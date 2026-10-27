// Dispara no horário da dose (param = dose) e de novo ao tocar em Tomei/Pular (param = {dose, status}).
// Limite de ~600 ms: só notifica ou enfileira, sem rede.
import { notify } from '@zos/notification'
import { exit } from '@zos/app-service'
import { getText } from '@zos/i18n'
import { push, loadToday, saveToday } from '../utils/queue'

const FILE = 'app-service/med_reminder'

AppService({
  onInit(param) {
    try {
      const p = JSON.parse(param)
      if (p.status) {
        const { medication_id, schedule_id, scheduled_for, dose_amount, dose_unit } = p.dose
        push('meds', { medication_id, schedule_id, scheduled_for, status: p.status, dose_amount, dose_unit })
        const T = loadToday()
        if (T && T.doses) {
          T.doses.forEach((x) => {
            if (x.medication_id === medication_id && x.schedule_id === schedule_id && x.scheduled_for === scheduled_for) {
              x.done = true
            }
          })
          saveToday(T)
        }
      } else {
        const doseText = [p.dose_amount, p.dose_unit].filter((x) => x != null).join(' ')
        const content = doseText || getText('list.dose')
        notify({ title: p.label || getText('dash.meds'), content, vibrate: 1,
          actions: [{ text: getText('taken'), file: FILE, param: JSON.stringify({ dose: p, status: 'taken' }) },
            { text: getText('skip'), file: FILE, param: JSON.stringify({ dose: p, status: 'skipped' }) }] })
      }
    } catch (e) { /* param inválido: nada a fazer */ }
    exit()
  }
})
