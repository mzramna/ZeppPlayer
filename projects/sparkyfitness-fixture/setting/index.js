const THEME = {
  bg: '#0f172a',
  cardBg: '#1e293b',
  cardBorder: '#334155',
  inputBg: '#0f172a',
  inputBorder: '#334155',
  textPrimary: '#f8fafc',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  accent: '#38bdf8',
  accentAmber: '#f59e0b',
}

const styles = {
  page: {
    backgroundColor: THEME.bg,
    minHeight: '100%',
    padding: '16px 14px 28px 14px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  headerCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: '14px',
    border: `1px solid ${THEME.cardBorder}`,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  headerRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: THEME.textPrimary,
    fontSize: '20px',
    fontWeight: '700',
  },
  headerBadge: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    border: `1px solid ${THEME.accent}`,
    borderRadius: '12px',
    padding: '3px 9px',
    color: THEME.accent,
    fontSize: '11px',
    fontWeight: '600',
  },
  headerSubtitle: {
    color: THEME.textSecondary,
    fontSize: '13px',
    lineHeight: '18px',
  },
  card: {
    backgroundColor: THEME.cardBg,
    borderRadius: '14px',
    border: `1px solid ${THEME.cardBorder}`,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  cardTitle: {
    color: THEME.textPrimary,
    fontSize: '15px',
    fontWeight: '600',
  },
  cardSubtitle: {
    color: THEME.textSecondary,
    fontSize: '12px',
    lineHeight: '16px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  fieldHint: {
    color: THEME.textSecondary,
    fontSize: '11px',
    lineHeight: '15px',
  },
  input: {
    borderRadius: '10px',
    padding: '10px 12px',
    backgroundColor: THEME.inputBg,
    color: THEME.textPrimary,
    border: `1px solid ${THEME.inputBorder}`,
    fontSize: '14px',
    height: '42px',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    borderRadius: '10px',
    padding: '10px 12px',
    backgroundColor: THEME.inputBg,
    color: THEME.textPrimary,
    border: `1px solid ${THEME.inputBorder}`,
    fontSize: '14px',
    height: '44px',
    width: '100%',
    boxSizing: 'border-box',
  },
  notice: {
    borderRadius: '10px',
    backgroundColor: THEME.inputBg,
    border: `1px solid ${THEME.cardBorder}`,
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  noticeTitle: {
    fontSize: '12px',
    fontWeight: '600',
  },
  noticeHelp: {
    color: THEME.textSecondary,
    fontSize: '12px',
    lineHeight: '17px',
  },
  tipsCard: {
    backgroundColor: THEME.cardBg,
    borderRadius: '14px',
    border: `1px solid ${THEME.cardBorder}`,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  footer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '6px 0 0 0',
  },
  footerText: {
    color: THEME.textMuted,
    fontSize: '11px',
    textAlign: 'center',
  },
}

AppSettingsPage({
  build({ settingsStorage: s }) {
    const field = (label, key, placeholder, hint) =>
      View({ style: styles.fieldGroup }, [
        TextInput({
          label,
          placeholder,
          value: s.getItem(key) || '',
          subStyle: styles.input,
          style: styles.input,
          onChange: (v) => s.setItem(key, v.trim()),
        }),
        Text({ style: styles.fieldHint }, hint),
      ])

    // Padrão: Health Connect. A ajuda muda com a escolha (build roda de novo a cada mudança no storage).
    const mode = s.getItem('sensorMode') || 'health-connect'
    const isDirect = mode === 'direct'
    const help = isDirect
      ? 'Não ative também essas métricas na sincronização do Health Connect do app SparkyFitness, ou os dados aparecem em dobro.'
      : '1) App Zepp: permitir passos, FC, sono e calorias no Health Connect. 2) Health Connect: pôr o Zepp à frente nas prioridades. 3) SparkyFitness Android: ativar essas métricas em Sync. Veja docs/health-connect.md.'

    return View({ style: styles.page }, [
      // 1. Header Hero Card
      View({ style: styles.headerCard }, [
        View({ style: styles.headerRow }, [
          Text({ style: styles.headerTitle, bold: true }, '⚡ SparkyFitness'),
          Text({ style: styles.headerBadge }, 'Zepp OS Companion'),
        ]),
        Text({ style: styles.headerSubtitle }, 'Sincronize água, medicamentos, ciclo menstrual, hábitos e telemetria de saúde com o SparkyFitness.'),
      ]),

      // 2. Server & Authentication Card
      View({ style: styles.card }, [
        Text({ style: styles.cardTitle, bold: true }, 'Servidor & Autenticação'),
        Text({ style: styles.cardSubtitle }, 'Endereço e credenciais de acesso da sua instância.'),
        field('URL do servidor', 'server', 'https://sparky.example.com', 'Ex: https://meu-sparky.local:8000 (com http:// ou https://)'),
        field('API key', 'apiKey', 'Gerada em Settings > API Keys', 'Chave pessoal de autenticação gerada nas configurações do app web'),
      ]),

      // 3. Sensor Sync Section
      Section({
        title: 'Dados medidos pelo relógio (passos, FC, sono, calorias)',
        style: styles.card,
      }, [
        View({ style: styles.fieldGroup }, [
          Select({
            label: 'Modo de Sincronização',
            value: mode,
            options: [
              { name: 'Via Health Connect', value: 'health-connect' },
              { name: 'Direto pela API', value: 'direct' },
            ],
            subStyle: styles.select,
            style: styles.select,
            onChange: (v) => s.setItem('sensorMode', v),
          }),
        ]),
        View({
          style: {
            ...styles.notice,
            borderLeft: isDirect ? `4px solid ${THEME.accentAmber}` : `4px solid ${THEME.accent}`,
          },
        }, [
          Text({
            style: {
              ...styles.noticeTitle,
              color: isDirect ? THEME.accentAmber : THEME.accent,
            },
            bold: true,
          }, isDirect ? '⚠️ Atenção: Modo Direto Ativo' : 'ℹ️ Modo Recomendado: Health Connect'),
          Text({ style: styles.noticeHelp, paragraph: true }, help),
        ]),
      ]),

      // 4. Quick Tips & Footer Card
      View({ style: styles.tipsCard }, [
        Text({ style: styles.cardTitle, bold: true }, 'Dicas de Sincronização'),
        Text({ style: styles.fieldHint }, '• Água, remédios e jejum são sincronizados em segundo plano ou manualmente no relógio.'),
        Text({ style: styles.fieldHint }, '• Os registros ficam salvos localmente no relógio mesmo quando desconectado do celular.'),
        View({ style: styles.footer }, [
          Text({ style: styles.footerText }, 'SparkyFitness Zepp OS • Configurações Móveis'),
        ]),
      ]),
    ])
  },
})
