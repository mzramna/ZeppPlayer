const lang = (typeof DeviceRuntimeCore !== 'undefined' && DeviceRuntimeCore.HmUtils && DeviceRuntimeCore.HmUtils.getLanguage)
  ? DeviceRuntimeCore.HmUtils.getLanguage()
  : 'pt-BR'

const STRINGS = {
  'dash.active': { 'pt-BR': 'Em andamento', 'en-US': 'Active' },
  'dash.burned': { 'pt-BR': 'Queimadas', 'en-US': 'Burned' },
  'dash.carbs': { 'pt-BR': 'Carboidratos', 'en-US': 'Carbs' },
  'dash.cycle': { 'pt-BR': 'Ciclo', 'en-US': 'Cycle' },
  'dash.disconnected': { 'pt-BR': 'Celular desconectado', 'en-US': 'Phone disconnected' },
  'dash.eaten': { 'pt-BR': 'Consumidas', 'en-US': 'Eaten' },
  'dash.error': { 'pt-BR': 'Erro', 'en-US': 'Error' },
  'dash.fasting': { 'pt-BR': 'Jejum', 'en-US': 'Fasting' },
  'dash.fat': { 'pt-BR': 'Gordura', 'en-US': 'Fat' },
  'dash.fiber': { 'pt-BR': 'Fibra', 'en-US': 'Fiber' },
  'dash.food': { 'pt-BR': 'Alimentação', 'en-US': 'Food' },
  'dash.meds': { 'pt-BR': 'Remédios', 'en-US': 'Meds' },
  'dash.mood': { 'pt-BR': 'Humor', 'en-US': 'Mood' },
  'dash.noDoses': { 'pt-BR': 'sem doses', 'en-US': 'no doses' },
  'dash.over': { 'pt-BR': 'Acima da meta', 'en-US': 'Over goal' },
  'dash.protein': { 'pt-BR': 'Proteína', 'en-US': 'Protein' },
  'dash.remaining': { 'pt-BR': 'Restantes', 'en-US': 'Remaining' },
  'dash.sent': { 'pt-BR': 'enviados', 'en-US': 'sent' },
  'dash.symptom': { 'pt-BR': 'Sintomas', 'en-US': 'Symptoms' },
  'dash.sync': { 'pt-BR': 'Sincronizar', 'en-US': 'Sync' },
  'dash.syncToDownload': { 'pt-BR': 'Sincronize para baixar seus dados', 'en-US': 'Sync to download your data' },
  'dash.syncing': { 'pt-BR': 'Sincronizando...', 'en-US': 'Syncing...' },
  'dash.water': { 'pt-BR': 'Água', 'en-US': 'Water' },
  'fast.end': { 'pt-BR': 'Encerrar jejum', 'en-US': 'End fast' },
  'fast.noPrefs': { 'pt-BR': 'Sem protocolo configurado', 'en-US': 'No protocol configured' },
  'fast.protocol': { 'pt-BR': 'Protocolo', 'en-US': 'Protocol' },
  'fast.remaining': { 'pt-BR': 'Restante', 'en-US': 'Remaining' },
  'fast.start': { 'pt-BR': 'Iniciar jejum', 'en-US': 'Start fast' },
  'flow.heavy': { 'pt-BR': 'Intenso', 'en-US': 'Heavy' },
  'flow.light': { 'pt-BR': 'Leve', 'en-US': 'Light' },
  'flow.medium': { 'pt-BR': 'Médio', 'en-US': 'Medium' },
  'flow.none': { 'pt-BR': 'Nenhum', 'en-US': 'None' },
  'flow.spotting': { 'pt-BR': 'Manchas', 'en-US': 'Spotting' },
  'list.cycle': { 'pt-BR': 'Ciclo', 'en-US': 'Cycle' },
  'list.dose': { 'pt-BR': 'Dose', 'en-US': 'Dose' },
  'list.empty': { 'pt-BR': 'Nada cadastrado na sua instância', 'en-US': 'Nothing set up on your instance' },
  'list.food': { 'pt-BR': 'Alimentação', 'en-US': 'Food' },
  'list.meal': { 'pt-BR': 'Refeição', 'en-US': 'Meal' },
  'list.meds': { 'pt-BR': 'Remédios', 'en-US': 'Medications' },
  'list.mood': { 'pt-BR': 'Humor', 'en-US': 'Mood' },
  'list.prn': { 'pt-BR': 'Avulso', 'en-US': 'As needed' },
  'list.registered': { 'pt-BR': 'Registrado', 'en-US': 'Logged' },
  'list.skipped': { 'pt-BR': 'Pulei', 'en-US': 'Skipped' },
  'list.symptom': { 'pt-BR': 'Sintomas', 'en-US': 'Symptoms' },
  'list.taken': { 'pt-BR': 'Tomei', 'en-US': 'Taken' },
  'list.water': { 'pt-BR': 'Água', 'en-US': 'Water' },
  'mood.1': { 'pt-BR': 'Muito ruim', 'en-US': 'Very bad' },
  'mood.2': { 'pt-BR': 'Ruim', 'en-US': 'Bad' },
  'mood.3': { 'pt-BR': 'Ok', 'en-US': 'Okay' },
  'mood.4': { 'pt-BR': 'Bom', 'en-US': 'Good' },
  'mood.5': { 'pt-BR': 'Ótimo', 'en-US': 'Great' },
  'skip': { 'pt-BR': 'Pular', 'en-US': 'Skip' },
  'taken': { 'pt-BR': 'Tomei', 'en-US': 'Taken' }
}

export function t(key) {
  const item = STRINGS[key]
  if (!item) return key
  return item[lang] || item['pt-BR'] || item['en-US'] || key
}
