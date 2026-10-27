# Arquitetura e Funcionamento — ZeppPlayer (Emulador Comunitário Zepp OS + MCP + Playwright)

Este documento descreve o funcionamento do ambiente de emulação ZeppPlayer (`zeppos-mcp-emulator`), sua integração via Model Context Protocol (MCP) e execução automatizada de testes Playwright.

---

## 1. Visão Geral

O **ZeppPlayer** emula o ecossistema de APIs do Zepp OS (tanto a API 1.0 quanto a API 3.x/4.0), permitindo carregar, inspecionar, navegar e testar interações de smartwatches diretamente em computadores x86/ARM sem necessidade do hardware físico.

### Componentes Principais
1. **Runtime de Emulação (`src/runtime.js`)**:
   - Fornece implementações em JavaScript/Node.js para as APIs nativas `@zos/ui`, `@zos/interaction`, `@zos/router`, `@zos/storage`, `@zos/notification`, `@zos/alarm` e `hmUI`/`hmApp`.
   - Modela telas redondas e quadradas (480x480, 454x454, 390x450, etc.) e simula telas sensíveis ao toque e giros de coroa digital.

2. **Servidor HTTP e Ponte Zeus (`src/server.js`)**:
   - Cria ponte local para carregar os projetos de aplicativos locais (como o Home Assistant e SparkyFitness).
   - Suporta fixtures isoladas para execução determinística em servidores de CI (GitHub Actions).

3. **Servidor MCP (`src/mcp*`)**:
   - Expõe 16 ferramentas nativas do protocolo MCP (e.g. `emulator_load_app`, `emulator_click`, `emulator_get_screen`, `emulator_set_sensors`) para que agentes de IA e ferramentas externas possam interagir visual e funcionalmente com o relógio.

4. **Suíte Playwright (`src/playwright/` e `test/e2e/`)**:
   - Executa asserções ponta a ponta sobre renderização de widgets, navegação de páginas e comportamento de formulários.
