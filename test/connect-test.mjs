// Test end-to-end de plan-checker.
import path from 'node:path';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const packageDir = path.resolve(import.meta.dirname, '..');
const tmpDir = path.join(packageDir, 'test', 'tmp');
rmSync(tmpDir, { recursive: true, force: true });
const home = path.join(tmpDir, 'dsh-home');
mkdirSync(home, { recursive: true });
const goodPlan = [
  '# Plan: publicar plugin',
  '',
  '## Pasos',
  '- [ ] 1. Crear bundle con esbuild — responsable: @gabriel',
  '- [ ] 2. Verificar artefacto con npm pack — responsable: @gabriel',
  '- [ ] 3. Ejecutar tests e2e — responsable: @gabriel',
  '',
  '## Criterios de aceptación',
  '- Se considera terminado cuando el artefacto responde status y los tests pasan.',
  '',
  '## Verificación',
  '- Ejecutar tests e2e y revisar la evidencia del artefacto.',
  '',
  '## Riesgos y supuestos',
  '- Riesgo: rate limit de GitHub → mitigación: cola con reintentos.',
  '',
  '## Rollback',
  '- Revertir el commit y volver a la versión anterior.',
  '',
  '## Fechas',
  '- Fecha límite: 2026-11-20',
].join('\n');
const badPlan = 'arreglar todo, revisar cosas, mejorar lo que sea, etc.';
writeFileSync(path.join(tmpDir, 'plan.md'), goodPlan, 'utf8');

function makeClient() {
  const entry = process.env.PLANCHECK_SERVER ? path.resolve(process.env.PLANCHECK_SERVER) : path.join(packageDir, 'server.mjs');
  const transport = new StdioClientTransport({ command: process.execPath, args: [entry], env: { SystemRoot: process.env.SystemRoot || 'C:\\Windows', PATH: process.env.PATH, USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME || process.env.USERPROFILE, TEMP: process.env.TEMP, TMP: process.env.TMP, DSH_HOME: home }, stderr: 'pipe' });
  transport.stderr?.on('data', (c) => process.stderr.write(`[server] ${c}`));
  const client = new Client({ name: 'plancheck-test', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } });
  return client.connect(transport).then(() => ({ client, transport }));
}
const textOf = (r) => (r.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

const { client, transport } = await makeClient();
console.log('tools:', (await client.listTools()).tools.map((t) => t.name).join(', '));
const status = textOf(await client.callTool({ name: 'status', arguments: {} }));
console.log('status reglas:', status.includes('pasos>=3'));
const template = textOf(await client.callTool({ name: 'template', arguments: {} }));
console.log('template verificable:', template.includes('Criterios de aceptación') && template.includes('Rollback') && template.includes('Verificación'));
const good = textOf(await client.callTool({ name: 'check', arguments: { plan: goodPlan } }));
console.log('--- good ---'); console.log(good);
console.log('aprobado:', good.includes('aprobado') && good.includes('100/100'));
const bad = textOf(await client.callTool({ name: 'check', arguments: { plan: badPlan } }));
console.log('--- bad ---'); console.log(bad);
console.log('rechazado:', bad.includes('rechazado'));
console.log('detecta errores:', bad.includes('criterio de aceptación') && bad.includes('verificación'));
const fromFile = textOf(await client.callTool({ name: 'check', arguments: { path: path.join(tmpDir, 'plan.md') } }));
console.log('lee archivo:', fromFile.includes('aprobado'));
const noInput = await client.callTool({ name: 'check', arguments: {} });
console.log('sin input isError:', noInput.isError === true);
const missing = await client.callTool({ name: 'check', arguments: { path: 'C:\\no-existe.md' } });
console.log('archivo inexistente isError:', missing.isError === true);
await client.close(); try { await transport.close?.(); } catch {}
console.log('OK');
