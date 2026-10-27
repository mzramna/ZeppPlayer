# CLAUDE.md — ZeppPlayer estendido (emulador Zepp OS + MCP + Playwright)

Leia também `HANDOFF.md` e `README.md`.

## Regras gerais
- Responder ao usuário em **português (PT-BR)**.
- **Nunca** commitar em `main`/`master`: branch `feat/...` + PR em `mzramna/ZeppPlayer`; a matriz `Build & Test (Node 20/22/24)` precisa passar.
- Testes não podem depender de caminhos locais do usuário: em CI caem para `projects/*-fixture` e `app.template.json`.

## Estrutura
| Caminho | Papel |
|---|---|
| `src/runtime.js` | Runtime que emula `@zos/*` / hmUI (multi-API 1.0, 3.x, 4.0) |
| `src/server.js` | Servidor + ponte Zeus; `resolveProjectPath` |
| `src/mcp*` | Servidor MCP (ferramentas `emulator_*` e `zepp_pw_*`) |
| `projects/` | Fixtures dos apps (Home Assistant, SparkyFitness) |
| `test/` | Unit, servidor, Playwright, MCP e suítes E2E parametrizadas |
| `.github/workflows/ci.yml` | `npm install --ignore-scripts && npm rebuild esbuild`, build e testes |

## Comandos
```bash
npm run build          # app/index.browser.js e app/index.cli.js
npm test
npm run test:coverage
```

## Convenções
- `canvas` é `optionalDependency` (sem binário pré-compilado em Node 22/24).
- Ao adicionar API nova do Zepp OS ao runtime, cobrir com teste unitário e um cenário E2E nos dois apps.
- Os apps alvo são `sh-sante-ha-zepp` e `sparkyfitness-zeppos`; ao mudar comportamento deles, atualizar as suítes E2E correspondentes.
