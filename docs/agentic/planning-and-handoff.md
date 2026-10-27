# Diretivas de Planejamento e Handoff para Agentes — ZeppPlayer MCP Emulator

Este documento orienta os agentes sobre a manutenção do emulador, padrões de testes de regressão e evolução de ferramentas de teste.

---

## 1. Diretivas de Git e CI

1. **PROIBIDO COMMITAR DIRETAMENTE NA `main` OU `master`**:
   - Todo trabalho deve ser feito na branch ativa `feat/mcp-playwright-multi-api-emulator` ([PR #1](https://github.com/mzramna/ZeppPlayer/pull/1)).
   - A matriz de build do GitHub Actions (`Node 20.x`, `Node 22.x`, `Node 24.x`) deve rodar com sucesso.

2. **Isolamento de Caminhos Locais**:
   - Nunca codifique caminhos absolutos locais do host nos testes que rodam em CI.
   - Utilize a resolução dinâmica implementada em `resolveProjectPath` (que recorre a `projects/*-fixture` quando os caminhos do desenvolvedor não existirem no ambiente).

---

## 2. Compatibilidade Multi-Versão do Zepp OS

Sempre que uma nova API do Zepp OS for utilizada pelos aplicativos alvos (`sh-sante-ha-zepp` ou `sparkyfitness-zeppos`), implemente o stub e a lógica de emulação correspondente em `src/runtime.js` acompanhada de um caso de teste unitário em `test/runtime.test.js`.

---

## 3. Backlog e Próximos Passos

1. **Cenários E2E para Controle de Iluminação do Home Assistant**:
   - Adicionar teste automatizado Playwright simulando gestos laterais e clique externo para alternar modos de luz no emulador.
2. **Cenários de Alarme e Notificação do SparkyFitness**:
   - Validar a simulação do acionamento de `app-service/med_reminder` através de evento de alarme sintetizado pelo emulador.
