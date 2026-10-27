// Cliente da API SparkyFitness — os mesmos endpoints que o app Android oficial usa.
import { settingsLib } from '@zeppos/zml/base-side'
import { dueDoses, dayStr } from './doses'

const SOURCE = 'zepp'
const FLOW_LEVELS = ['none', 'spotting', 'light', 'medium', 'heavy'] // enum do servidor (cycleSchemas.ts)
const MAX_FOODS = 30 // shortcut: a lista cabe no relógio, ampliar se a memória permitir

export function calcVolumeMl(volume, unit, volume_ml) {
  const v = Number(volume) || 0
  const u = (unit || '').toLowerCase().trim()
  if (u === 'l') return Math.round(v * 1000)
  if (u === 'oz' || u === 'fl oz') return Math.round(v * 29.5735)
  if (u === 'cup') return Math.round(v * 240)
  return Math.round(Number(volume_ml ?? volume) || 0)
}

export async function call(method, path, body) {
  const server = (settingsLib.getItem('server') || '').replace(/\/+$/, '')
  const key = settingsLib.getItem('apiKey') || ''
  if (!server || !key) throw new Error('configure servidor e API key no app Zepp')
  const res = await fetch({ url: server + path, method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, 'x-api-key': key },
    body: body ? JSON.stringify(body) : undefined })
  if (res.status < 200 || res.status >= 300) {
    let msg = ''
    try {
      const b = typeof res.body === 'string' && res.body ? JSON.parse(res.body) : res.body
      msg = (b && (b.message || b.error || (typeof b === 'string' ? b : ''))) || ''
    } catch {}
    throw new Error(`${method} ${path}: HTTP ${res.status}${msg ? ` - ${msg}` : ''}`)
  }
  return typeof res.body === 'string' && res.body ? JSON.parse(res.body) : res.body
}

// Endpoints opcionais (ciclo, jejum, sintomas...) podem estar desligados no servidor.
const opt = (p, fallback) => p.catch(() => fallback)

// Mesma conta do app: valor * quantidade / porção.
const macro = (entries, k) => Math.round((entries || []).reduce((s, e) => s + (e[k] || 0) * e.quantity / (e.serving_size || 1), 0))

export async function fetchToday(now = new Date()) {
  const date = dayStr(now)
  const next = dayStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))
  const [summary, containers, meds, entries, cycle, fast, prefs, symptoms, favs, foods, mealTypes] = await Promise.all([
    call('GET', `/api/daily-summary?date=${date}`),
    call('GET', '/api/water-containers'),
    opt(call('GET', '/api/v2/medications?activeOnly=true'), []),
    opt(call('GET', `/api/v2/medications/entries?fromDate=${date}&toDate=${next}`), []),
    opt(call('GET', `/api/v2/cycle/overview?date=${date}`), null),
    opt(call('GET', '/api/fasting/current'), null),
    opt(call('GET', '/api/fasting/preferences'), null),
    opt(call('GET', '/api/v2/symptoms/custom'), []),
    opt(call('GET', '/api/favorites'), {}),
    opt(call('GET', '/api/foods'), {}),
    opt(call('GET', '/api/meal-types'), [])
  ])
  const goals = summary.goals || {}
  const cb = summary.calorieBalance || {}
  const fe = summary.foodEntries
  const seen = new Set()
  const foodList = [...(favs.favoriteFoods || []), ...(foods.recentFoods || []), ...(foods.topFoods || [])]
    .filter((f) => f.default_variant && !seen.has(f.id) && seen.add(f.id)).slice(0, MAX_FOODS)
    .map((f) => ({ food_id: f.id, name: f.name, variant_id: f.default_variant.id,
      quantity: f.default_variant.serving_size, unit: f.default_variant.serving_unit }))
  return {
    date,
    calories: {
      eaten: Math.round(Number(cb.eaten) || 0),
      burned: Math.round(Number(cb.burned) || 0),
      remaining: Math.round(Number(cb.remaining) || 0),
      goal: Math.round(Number(cb.goal ?? goals.calories) || 0)
    },
    macros: {
      protein: { value: macro(fe, 'protein'), goal: Math.round(Number(goals.protein) || 0) },
      carbs: { value: macro(fe, 'carbs'), goal: Math.round(Number(goals.carbs) || 0) },
      fat: { value: macro(fe, 'fat'), goal: Math.round(Number(goals.fat) || 0) },
      fiber: { value: macro(fe, 'dietary_fiber'), goal: Math.round(Number(goals.dietary_fiber) || 0) }
    },
    water: { ml: Math.round(Number(summary.waterIntake) || 0), goal_ml: Math.round(Number(goals.water_goal_ml) || 0) },
    containers: containers.map(({ id, name, volume, unit, volume_ml, is_primary }) => ({
      id,
      name,
      volume: Number(volume),
      unit,
      volume_ml: calcVolumeMl(volume, unit, volume_ml),
      is_primary
    })),
    doses: dueDoses(meds, entries, now),
    medications: meds.map(({ id, name, dose_amount, dose_unit, strength_value, strength_unit }) => ({
      id,
      name,
      dose_amount: dose_amount ?? strength_value ?? null,
      dose_unit: dose_unit ?? strength_unit ?? null
    })),
    cycle: cycle && cycle.settings ? { phase: cycle.phase, cycleDay: cycle.cycleDay, isLate: !!(cycle.late && cycle.late.isLate) } : null,
    flowLevels: FLOW_LEVELS,
    fasting: fast ? { start_time: fast.start_time, target_end_time: fast.target_end_time, fasting_type: fast.fasting_type, status: fast.status } : null,
    fastingPrefs: prefs ? {
      fasting_type: (prefs.default_protocol || '16:8').replace('-', ':'),
      hours: Number(prefs.target_fasting_hours) || Number(String(prefs.default_protocol || '').split(/[-:]/)[0]) || 16
    } : null,
    symptoms: symptoms.filter((s) => !s.is_archived).map((s) => ({ id: s.id, name: s.display_name || s.name })),
    foods: foodList,
    mealTypes: mealTypes.filter((m) => m.is_visible !== false).map(({ id, name }) => ({ id, name }))
  }
}

const SENDERS = {
  water: (e) => call('POST', '/api/v2/measurements/water-intake',
    { entry_date: e.date, change_drinks: e.data.change, container_id: e.data.container_id }),
  meds: (e) => {
    const d = e.data
    const scheduled = d.schedule_id && d.scheduled_for && d.status !== 'prn_taken'
    return call('POST', '/api/v2/medications/entries', {
      medication_id: d.medication_id, status: scheduled ? d.status : 'prn_taken',
      schedule_id: scheduled ? d.schedule_id : null, scheduled_for: scheduled ? d.scheduled_for : null,
      taken_at: e.ts, entry_date: e.date,
      dose_amount_snapshot: d.dose_amount ?? null, dose_unit_snapshot: d.dose_unit ?? null, source: SOURCE })
  },
  cycle: (e) => call('PUT', `/api/v2/cycle/logs/${e.date}`, { flow_level: e.data.flow_level }),
  food: (e) => {
    const { name, ...d } = e.data
    return call('POST', '/api/food-entries/', { ...d, entry_date: e.date, entry_time: e.time })
  },
  mood: (e) => call('POST', '/api/mood', { mood_value: e.data.mood_value, entry_date: e.date }),
  symptom: (e) => call('POST', '/api/v2/symptoms/entries', { symptom_id: e.data.symptom_id,
    symptom_name_snapshot: e.data.name, entry_date: e.date, logged_at: e.ts, source: SOURCE }),
  fast_start: (e) => call('POST', '/api/fasting/start',
    { start_time: e.ts, target_end_time: e.data.target_end_time, fasting_type: e.data.fasting_type }),
  // O servidor exige o id do jejum; sem jejum ativo ele já terminou (ex.: encerrado no app).
  fast_end: async (e) => {
    const cur = await call('GET', '/api/fasting/current')
    if (cur) await call('POST', '/api/fasting/end', { id: cur.id, start_time: cur.start_time, end_time: e.ts })
  },
  health: (e) => call('POST', '/api/health-data', [{ ...e.data, date: e.date, source: SOURCE }])
}

export const sendEntry = (e) => (SENDERS[e.type] ? SENDERS[e.type](e) : Promise.resolve())
