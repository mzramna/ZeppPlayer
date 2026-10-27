// Lembretes de remédio: um alarme por dose futura não tomada (hoje+amanhã), recriados a cada sync.
// shortcut: cobre só hoje+amanhã, ampliar se o usuário ficar dias sem sincronizar.
import { localStorage } from '@zos/storage'
import { set, cancel } from '@zos/alarm'

export const pickReminders = (doses, now = new Date()) =>
  (doses || []).filter((d) => !d.done && new Date(d.scheduled_for) > now)

export function scheduleReminders(doses, now = new Date()) {
  let old = []
  try { old = JSON.parse(localStorage.getItem('alarms', '')) || [] } catch (e) { /* cache corrompido: nada a cancelar */ }
  old.forEach((id) => cancel(id))
  // set() devolve 0 quando falha; esses ids não vão para a lista
  const ids = pickReminders(doses, now)
    .map((d) => set({ url: 'app-service/med_reminder', time: Math.floor(new Date(d.scheduled_for).getTime() / 1000),
      store: true, param: JSON.stringify(d) }))
    .filter(Boolean)
  localStorage.setItem('alarms', JSON.stringify(ids))
  return ids
}
