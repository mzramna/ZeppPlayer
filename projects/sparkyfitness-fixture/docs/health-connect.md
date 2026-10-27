# Health Connect: passos, FC, sono e calorias do relógio

O app Android do SparkyFitness não aceita chamadas de outros apps, mas lê o **Health Connect** (HC). O app Zepp do celular grava no HC os dados medidos pelo relógio. O caminho é:

**Relógio → app Zepp → Health Connect → SparkyFitness Android → servidor**

Por isso o modo padrão do SparkyFitness Zepp é **Via Health Connect**: o relógio não envia esses dados, e o servidor recebe tudo pelo app Android.

Para quem não usa Health Connect, existe a opção **Direto pela API**: o relógio envia passos, FC, sono e calorias ao servidor. Escolha no app Zepp, em **App Settings → SparkyFitness → Dados medidos pelo relógio**.

**Não use os dois caminhos ao mesmo tempo.** Veja a tabela abaixo.

## Ativação (modo Health Connect)

1. **App Zepp:** Perfil → seu relógio ou "Contas de terceiros" → Health Connect → permitir os tipos (passos, FC, sono, calorias, distância, treinos).
2. **Health Connect:** Prioridade de apps → colocar o Zepp à frente de outros apps que gravem passos ou sono. Os agregados (passos, calorias) respeitam essa ordem.
3. **SparkyFitness Android:** Configurações → Sync → ativar as métricas Passos, Calorias ativas e totais, FC, FC repouso, Sono e Treinos. Ligar a **sincronização em segundo plano** (a cada 4 h, desligada por padrão) e/ou **sincronizar ao abrir**. Tocar em Sync.
4. **Cuidado com a água:** se o app Zepp ou outro app gravar Hidratação no HC, o SparkyFitness importa isso como água e soma com a do nosso app. Se aparecer em dobro, desligue a métrica Hidratação no SparkyFitness ou o registro no outro app.
5. **Latência:** espere de 15 a 30 minutos entre o relógio e o HC. Esse valor é de terceiros, não confirmado. Modelos antigos podem não ter HC; confirme no seu Balance.

## Ativação (modo Direto pela API)

1. No app Zepp, escolha **Direto pela API**.
2. No SparkyFitness Android, **não** ative passos, FC, sono e calorias na sincronização do Health Connect. Senão os dados aparecem em dobro.

## O que duplica se os dois caminhos estiverem ligados

O servidor não junta fontes diferentes: cada uma vira uma linha separada, e a leitura soma tudo nos casos abaixo.

| Dado | Dois caminhos (`zepp` e `Health Connect`) |
|---|---|
| Passos | uma linha, vale o maior valor: seguro |
| Calorias ativas | uma linha, vale a última escrita |
| Calorias totais, sono, FC repouso, FC mín/máx/média | **linhas separadas por fonte** |
| Treinos e água | **linhas separadas, e a leitura soma tudo** (contagem em dobro) |

## O que vai direto ao servidor, com ou sem Health Connect

O HC resolve apenas passos, FC, sono, calorias, distância e treinos medidos pelo relógio. O resto segue direto ao servidor pelo app Zepp:

- **Água, remédios, alimentação, humor e sintomas:** sempre direto.
- **Ciclo:** também direto. O SparkyFitness só importa `MenstruationPeriod` do HC como medida personalizada, e o diário de ciclo é outro recurso.

O mini app não consegue gravar no HC, e o app Zepp não lê o HC para o relógio.

## Por que o relógio não envia pelo Wi-Fi

- Os módulos da API do relógio (Zepp OS) não incluem rede, `fetch` nem Wi-Fi. O `fetch` só existe no side service, que roda no celular.
- O relógio fala com o celular por BLE. O Wi-Fi do Balance é usado só pelo sistema, como atualizações e mapas.
- Por isso tudo passa pelo app Zepp no celular. A fila offline do relógio cobre os períodos sem celular por perto.

## Fontes e ressalvas

- A Zepp não publica documentação oficial sobre o Health Connect. A lista de tipos e a latência vêm de reportagens:
  - https://gadgetsandwearables.com/2025/01/24/zepp-health-connect/
  - https://www.notebookcheck.net/Amazfit-smartwatches-get-new-Health-Connect-data-sync-feature.951489.0.html
- Documentação oficial do Health Connect: https://developer.android.com/health-and-fitness/health-connect
- A prioridade entre fontes é a do próprio Health Connect, fora do controle deste projeto.
- Só dá para confirmar a lista de tipos e a latência no seu Balance.
