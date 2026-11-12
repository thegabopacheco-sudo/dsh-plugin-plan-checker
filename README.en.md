# dsh-plugin-plan-checker — Plan Checker

Valida planes de trabajo en Markdown para DeepSeek Harness: pasos, criterios de aceptacion, riesgos, rollback y verificacion, con score y hallazgos accionables.

## Tools

| Tool | Qué hace |
|---|---|
| `status` | Estado |
| `template` | Plantilla |
| `check` | Validar plan |

## Instalación

Desde **DSH → Settings → Plugins** instala `github:thegabopacheco-sudo/dsh-plugin-plan-checker` y permite el script de instalación.

```
dsh plugin --profile <perfil> add github:thegabopacheco-sudo/dsh-plugin-plan-checker
```

## Seguridad

- Lectura por defecto; escritura solo con `confirm:true` y pedido explícito.
- `DSH_PLAN_CHECKER_MODE=read-only` desactiva acciones.
- Listas blancas y auditoría en `<DSH_HOME>\cache\plan-checker\audit.jsonl`.

## Licencia

MIT © thegabopacheco-sudo
