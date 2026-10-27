// Porta de shared/src/medications/schedules.ts (getDueDosesForDate) para hoje+amanhã, no fuso do celular.
const pad = (n) => String(n).padStart(2, '0')
export const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const utcMs = (s) => new Date(s + 'T00:00:00Z').getTime()
const daysBetween = (a, b) => Math.round((utcMs(b) - utcMs(a)) / 86400000)

function dueOn(s, day) {
  if (s.active === false) return false
  if (s.start_date && day < s.start_date) return false
  if (s.end_date && day > s.end_date) return false
  const t = s.schedule_type_id
  if (t === 'daily' || t === 'taper') return true
  if (t === 'weekly' || t === 'specific_days') return !!s.days_of_week && s.days_of_week.includes(new Date(utcMs(day)).getUTCDay())
  if (t === 'every_n_days') {
    if (!s.interval_days || s.interval_days <= 0) return false
    const n = daysBetween(s.start_date || '2020-01-01', day)
    return n >= 0 && n % s.interval_days === 0
  }
  if (t === 'monthly') {
    if (!s.day_of_month) return false
    const d = Number(day.slice(8))
    const last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate()
    return d === s.day_of_month || (d === last && s.day_of_month > last)
  }
  if (t === 'cyclic') {
    const on = s.cycle_on_days || 0
    if (on <= 0) return false
    const n = daysBetween(s.start_date || '2020-01-01', day)
    return n >= 0 && n % (on + (s.cycle_off_days || 0)) < on
  }
  return false // prn e desconhecidos
}

// Dose feita = entrada taken/skipped do mesmo schedule no dia, ou sem schedule_id para o mesmo remédio (igual ao app web).
const isDone = (e, med, sched, day) =>
  (e.status === 'taken' || e.status === 'skipped') && (!e.entry_date || e.entry_date.slice(0, 10) === day) &&
  (e.schedule_id === sched.id || (e.medication_id === med.id && !e.schedule_id))

export function dueDoses(medications, entries, now = new Date()) {
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  const out = []
  for (const date of [now, tomorrow]) {
    const day = dayStr(date)
    const slots = []
    for (const med of medications || []) {
      if (med.is_active === false) continue
      for (const s of med.schedules || []) {
        if (s.schedule_type_id === 'prn') continue
        // sem start_date, o servidor ignora dias anteriores à criação do schedule
        if (!s.start_date && s.created_at && day < dayStr(new Date(s.created_at))) continue
        if (dueOn(s, day)) slots.push([med, s])
      }
    }
    slots.sort((a, b) => (a[1].time_of_day || '99').localeCompare(b[1].time_of_day || '99')) // estável: sem hora vai por último
    for (const [med, s] of slots) {
      const [hh, mm] = (s.time_of_day || '00:00').split(':').map(Number)
      out.push({
        medication_id: med.id, schedule_id: s.id,
        scheduled_for: new Date(date.getFullYear(), date.getMonth(), date.getDate(), hh, mm).toISOString(),
        label: s.time_of_day ? `${med.name} ${s.time_of_day.slice(0, 5)}` : med.name,
        dose_amount: s.dose_amount ?? med.dose_amount ?? med.strength_value ?? null, dose_unit: med.dose_unit ?? med.strength_unit ?? null,
        done: (entries || []).some((e) => isDone(e, med, s, day))
      })
    }
  }
  return out
}
