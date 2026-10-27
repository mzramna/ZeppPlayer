# Handoff — ZeppPlayer (branch `feat/mcp-playwright-multi-api-emulator`, PR #1)

Estado em 2026-10-27.

## Feito
- Emulador multi-API, servidor MCP (16 ferramentas), framework Playwright, suítes E2E parametrizadas para Home Assistant e SparkyFitness.
- CI GitHub Actions (Node 20/22/24) verde. Última execução local completa: build + 7 grupos unit + 15 servidor + 9 Playwright + 12 MCP + 6/6 E2E, exit 0.

## Falta
- [ ] O emulador **não reproduziu** o travamento do SparkyFitness ao abrir (só carrega sem cache do dia). Adicionar cenário com cache `today` preenchido, doses e alarmes, e simular coroa/gestos.
- [ ] Cenários E2E para: modos de luz por deslize no HA (inclusive build legacy API 1.0), abas/filtros/token mascarado nas configurações dos dois apps.
