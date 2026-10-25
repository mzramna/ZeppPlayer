import { readFileSync, writeFileSync } from '../shared/fs'

export const pickReminders = (doses, now = new Date()) =>
  (doses || []).filter((d) => !d.done && new Date(d.scheduled_for) > now)

export function scheduleReminders(doses, now = new Date()) {
  let old = []
  try {
    if (typeof hmFS !== 'undefined' && hmFS.SysProGetChars) {
      old = JSON.parse(hmFS.SysProGetChars('alarms') || '[]') || []
    } else if (typeof hmFS !== 'undefined') {
      const raw = readFileSync('alarms.json')
      if (raw) old = JSON.parse(raw) || []
    }
  } catch (e) {}

  if (typeof hmApp !== 'undefined' && hmApp.alarmCancel) {
    old.forEach((id) => {
      try { hmApp.alarmCancel(id) } catch (e) {}
    })
  }

  const ids = []
  if (typeof hmApp !== 'undefined' && hmApp.alarmNew) {
    pickReminders(doses, now).forEach((d) => {
      try {
        const id = hmApp.alarmNew({
          file: 'page/list',
          param: JSON.stringify({ key: 'dose', dose: d, reminder: true }),
          time: Math.floor(new Date(d.scheduled_for).getTime() / 1000)
        })
        if (id) ids.push(id)
      } catch (e) {}
    })
  }

  try {
    if (typeof hmFS !== 'undefined' && hmFS.SysProSetChars) {
      hmFS.SysProSetChars('alarms', JSON.stringify(ids))
    } else if (typeof hmFS !== 'undefined') {
      writeFileSync('alarms.json', JSON.stringify(ids))
    }
  } catch (e) {}

  return ids
}
