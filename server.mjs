#!/usr/bin/env node
// dsh-plugin-plan-checker — valida planes de trabajo en Markdown.
// Tools: status, template, check.

import path from 'node:path';
import os from 'node:os';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';

const VERSION = '0.1.0';
const DSH_HOME = (() => {
  const v = process.env.DSH_HOME && process.env.DSH_HOME.trim();
  return v || path.join(process.env.USERPROFILE || process.env.HOME || os.homedir(), '.dsh');
})();
const CACHE_DIR = path.join(DSH_HOME, 'cache', 'plan-checker');
const MAX_PLAN_CHARS = 40000;
const log = (m) => process.stderr.write(`[plancheck] ${m}\n`);

const PATTERNS = {
  step: [/^\s*[-*]\s*\[[ x]\]\s+\S+/gm, /^\s*\d+[.)]\s+\S+/gm, /^#{2,4}\s+(?:paso|step)\s+\d+/gim],
  acceptance: [/(criterios?\s+de\s+aceptaci[oó]n|aceptaci[oó]n|done\s+when|definition\s+of\s+done|se\s+considera\s+terminado|completado\s+cuando)/gi],
  verification: [/(verificaci[oó]n|verificar|probar|test|tests|qa|validar|comprobar|evidencia)/gi],
  rollback: [/(rollback|revertir|reversi[oó]n|volver\s+atr[aá]s|plan\s+b|contingencia)/gi],
  risks: [/(riesgos?|riesgo|risk|mitigaci[oó]n|supuestos|dependencias|bloqueos?)/gi],
  owners: [/(responsable|owner|asignado|encargado|@[a-zA-Z0-9_-]+)/gi],
  deadlines: [/(fecha|l[ií]mite|deadline|para\s+el|antes\s+del|\d{4}-\d{2}-\d{2})/gi],
  vague: [/(mejorar|arreglar|optimizar|revisar|probar\s+cosas|etc\.?|lo\s+que\s+sea|algo\s+as[ií])/gi],
};
const VAGUE_STEP = /^\s*(?:[-*]\s*\[[ x]\]\s*|\d+[.)]\s*)(mejorar|arreglar|optimizar|revisar|probar|hacer|ver)\b/i;

function countMatches(text, patterns) {
  let total = 0;
  for (const pattern of patterns) total += (text.match(pattern) || []).length;
  return total;
}
function analyze(plan) {
  if (!plan || typeof plan !== 'string') throw new Error('plan vacío');
  if (plan.length > MAX_PLAN_CHARS) throw new Error(`plan demasiado largo (${plan.length} > ${MAX_PLAN_CHARS})`);
  const lines = plan.split('\n');
  const steps = (() => {
    const checklist = lines.filter((line) => /^\s*[-*]\s*\[[ x]\]\s+\S+/.test(line));
    if (checklist.length) return checklist.length;
    const numbered = lines.filter((line) => /^\s*\d+[.)]\s+\S+/.test(line));
    if (numbered.length) return numbered.length;
    return lines.filter((line) => /^#{2,4}\s+(?:paso|step)\s+\d+/i.test(line)).length;
  })();
  const findings = [];
  const add = (severity, message) => findings.push({ severity, message });
  if (steps < 3) add('error', `plan demasiado corto: ${steps} paso(s) detectado(s) (mínimo 3)`);
  if (countMatches(plan, PATTERNS.acceptance) === 0) add('error', 'falta criterio de aceptación / definition of done');
  if (countMatches(plan, PATTERNS.verification) === 0) add('error', 'falta paso de verificación (tests/QA/evidencia)');
  if (countMatches(plan, PATTERNS.rollback) === 0) add('warn', 'no hay plan de rollback/contingencia');
  if (countMatches(plan, PATTERNS.risks) === 0) add('warn', 'no se listan riesgos ni supuestos');
  if (countMatches(plan, PATTERNS.owners) === 0) add('warn', 'no se asigna responsable a los pasos');
  if (countMatches(plan, PATTERNS.deadlines) === 0) add('warn', 'sin fechas o límites');
  const vagueLines = lines.filter((line) => VAGUE_STEP.test(line));
  if (vagueLines.length) add('warn', `${vagueLines.length} paso(s) vago(s): ${vagueLines.slice(0, 3).map((line) => line.trim().slice(0, 60)).join(' | ')}`);
  if (countMatches(plan, PATTERNS.vague) >= 4) add('warn', 'el plan usa lenguaje vago con frecuencia');

  let score = 100;
  for (const finding of findings) score -= finding.severity === 'error' ? 20 : 8;
  score = Math.max(0, score);
  const verdict = findings.some((finding) => finding.severity === 'error') ? 'rechazado' : findings.length ? 'aceptable con observaciones' : 'aprobado';
  return { steps, findings, score, verdict, chars: plan.length };
}
function textResult(text) { return { content: [{ type: 'text', text }] }; }

function buildInstructions() {
  return [
    'Plan Checker: valida planes de trabajo en Markdown antes de ejecutarlos.',
    '',
    'Herramientas: status, template, check.',
    '',
    'Reglas:',
    '- check es solo lectura: analiza pasos, criterios de aceptación, verificación, rollback, riesgos, responsables y fechas.',
    '- Reporta el score y hallazgos reales; no apruebes un plan sin criterios de verificación.',
    '- Usa template para obtener un plan mínimo verificable.',
  ].join('\n');
}

function buildServer() {
  const server = new McpServer({ name: 'dsh-plugin-plan-checker', version: VERSION }, { capabilities: { tools: {} }, instructions: buildInstructions() });

  server.registerTool(
    'status',
    { title: 'Estado', description: 'Reglas de validación y límites.', inputSchema: z.object({}) },
    async () => textResult([`Reglas: pasos>=3, aceptación, verificación, rollback, riesgos, responsables, fechas, lenguaje vago`, `Límite: ${MAX_PLAN_CHARS} caracteres`, 'Modo: solo lectura', ''].join('\n')),
  );

  server.registerTool(
    'template',
    { title: 'Plantilla', description: 'Devuelve un plan mínimo verificable.', inputSchema: z.object({}) },
    async () => textResult([
      '# Plan: <objetivo>',
      '',
      '## Pasos',
      '- [ ] 1. <acción concreta> — responsable: <quién>',
      '- [ ] 2. <acción concreta> — responsable: <quién>',
      '- [ ] 3. <verificación: test/comprobación> — responsable: <quién>',
      '',
      '## Criterios de aceptación',
      '- <se considera terminado cuando...>',
      '',
      '## Verificación',
      '- <cómo se comprueba: test, QA, evidencia>',
      '',
      '## Riesgos y supuestos',
      '- <riesgo> → mitigación: <...>',
      '',
      '## Rollback',
      '- <cómo revertir si falla>',
      '',
      '## Fechas',
      '- <fecha límite>',
    ].join('\n')),
  );

  server.registerTool(
    'check',
    { title: 'Validar plan', description: 'Analiza un plan por texto o archivo y devuelve score y hallazgos.', inputSchema: z.object({ plan: z.string().optional(), path: z.string().optional() }) },
    async (args) => {
      let plan = args.plan;
      if (!plan && args.path) {
        if (!existsSync(args.path)) throw new Error(`archivo no encontrado: ${args.path}`);
        plan = readFileSync(args.path, 'utf8');
      }
      if (!plan) throw new Error('pasa plan (texto) o path (archivo .md)');
      const result = analyze(plan);
      return textResult([
        `Score: ${result.score}/100 · Veredicto: ${result.verdict}`,
        `Pasos detectados: ${result.steps} · Caracteres: ${result.chars}`,
        '',
        'Hallazgos:',
        ...(result.findings.length ? result.findings.map((finding) => `${finding.severity === 'error' ? '❌' : '⚠️'} ${finding.message}`) : ['✅ Sin hallazgos: el plan tiene pasos, aceptación y verificación.']),
      ].join('\n'));
    },
  );

  return server;
}

try { mkdirSync(CACHE_DIR, { recursive: true }); } catch { /* ignora */ }
log('modo: solo lectura');
serveStdio(buildServer, { onerror: (e) => log(`serveStdio: ${e.message}`) });
process.on('uncaughtException', (e) => log(`excepción: ${e.message}`));
process.on('unhandledRejection', (e) => log(`rechazo: ${e && e.message ? e.message : String(e)}`));
