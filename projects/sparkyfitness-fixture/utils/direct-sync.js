import { localStorage } from '@zos/storage'

export function saveConfig(cfg) {
  if (!cfg) return
  try {
    localStorage.setItem('config', JSON.stringify(cfg))
  } catch (e) {}
}

export function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem('config', '')) || {}
  } catch (e) {
    return {}
  }
}

export function canDirectSync() {
  if (typeof globalThis.fetch !== 'function') return false
  const cfg = loadConfig()
  return !!(cfg && cfg.server && cfg.apiKey)
}

function calcVolumeMl(volume, unit, volume_ml) {
  const v = Number(volume) || 0
  const u = (unit || '').toLowerCase().trim()
  if (u === 'l') return Math.round(v * 1000)
  if (u === 'oz' || u === 'fl oz') return Math.round(v * 29.5735)
  if (u === 'cup') return Math.round(v * 240)
  return Math.round(Number(volume_ml ?? volume) || 0)
}

export async function directSync(entries = []) {
  const cfg = loadConfig()
  const server = (cfg.server || '').replace(/\/+$/, '')
  const key = cfg.apiKey || ''
  if (!server || !key) throw new Error('config ausente')

  const call = async (method, path, body) => {
    const res = await globalThis.fetch({
      url: server + path,
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'x-api-key': key
      },
      body: body ? JSON.stringify(body) : undefined
    })
    if (res.status < 200 || res.status >= 300) {
      let msg = ''
      try {
        const b = typeof res.body === 'string' && res.body ? JSON.parse(res.body) : res.body
        msg = (b && (b.message || b.error || (typeof b === 'string' ? b : ''))) || ''
      } catch {}
      throw new Error(`HTTP ${res.status}${msg ? ` - ${msg}` : ''}`)
    }
    return typeof res.body === 'string' && res.body ? JSON.parse(res.body) : res.body
  }

  const synced = []
  const sensorMode = cfg.sensorMode || 'health-connect'

  for (const e of entries) {
    if (e.type !== 'health' || sensorMode === 'direct') {
      if (e.type === 'water') {
        await call('POST', '/api/v2/measurements/water-intake', {
          entry_date: e.date,
          change_drinks: e.data.change,
          container_id: e.data.container_id
        })
      } else if (e.type === 'meds') {
        const d = e.data
        const scheduled = d.schedule_id && d.scheduled_for && d.status !== 'prn_taken'
        await call('POST', '/api/v2/medications/entries', {
          medication_id: d.medication_id,
          status: scheduled ? d.status : 'prn_taken',
          schedule_id: scheduled ? d.schedule_id : null,
          scheduled_for: scheduled ? d.scheduled_for : null,
          taken_at: e.ts,
          entry_date: e.date,
          dose_amount_snapshot: d.dose_amount ?? null,
          dose_unit_snapshot: d.dose_unit ?? null,
          source: 'zepp'
        })
      } else if (e.type === 'cycle') {
        await call('PUT', `/api/v2/cycle/logs/${e.date}`, { flow_level: e.data.flow_level })
      } else if (e.type === 'food') {
        const { name, ...d } = e.data
        await call('POST', '/api/food-entries/', { ...d, entry_date: e.date, entry_time: e.time })
      } else if (e.type === 'mood') {
        await call('POST', '/api/mood', { mood_value: e.data.mood_value, entry_date: e.date })
      } else if (e.type === 'symptom') {
        await call('POST', '/api/v2/symptoms/entries', {
          symptom_id: e.data.symptom_id,
          symptom_name_snapshot: e.data.name,
          entry_date: e.date,
          logged_at: e.ts,
          source: 'zepp'
        })
      } else if (e.type === 'fast_start') {
        await call('POST', '/api/fasting/start', {
          start_time: e.ts,
          target_end_time: e.data.target_end_time,
          fasting_type: e.data.fasting_type
        })
      } else if (e.type === 'fast_end') {
        const cur = await call('GET', '/api/fasting/current').catch(() => null)
        if (cur) await call('POST', '/api/fasting/end', { id: cur.id, start_time: cur.start_time, end_time: e.ts })
      } else if (e.type === 'health') {
        await call('POST', '/api/health-data', [{ ...e.data, date: e.date, source: 'zepp' }])
      }
    }
    synced.push(e.id)
  }

  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  const opt = (p, fallback) => p.catch(() => fallback)

  const [summary, containers, meds, fastingCurrent, fastingPrefs] = await Promise.all([
    call('GET', `/api/daily-summary?date=${date}`),
    call('GET', '/api/water-containers'),
    call('GET', '/api/v2/medications?activeOnly=true'),
    opt(call('GET', '/api/fasting/current'), null),
    opt(call('GET', '/api/fasting/preferences'), null)
  ])

  const goals = summary.goals || {}
  const cb = summary.calorieBalance || {}
  const fe = summary.foodEntries || []
  const macro = (k) => Math.round(fe.reduce((s, x) => s + (x[k] || 0) * x.quantity / (x.serving_size || 1), 0))

  const today = {
    date,
    sensorMode,
    calories: {
      eaten: Math.round(Number(cb.eaten) || 0),
      burned: Math.round(Number(cb.burned) || 0),
      remaining: Math.round(Number(cb.remaining) || 0),
      goal: Math.round(Number(cb.goal ?? goals.calories) || 0)
    },
    macros: {
      protein: { value: macro('protein'), goal: Math.round(Number(goals.protein) || 0) },
      carbs: { value: macro('carbs'), goal: Math.round(Number(goals.carbs) || 0) },
      fat: { value: macro('fat'), goal: Math.round(Number(goals.fat) || 0) },
      fiber: { value: macro('dietary_fiber'), goal: Math.round(Number(goals.dietary_fiber) || 0) }
    },
    water: {
      ml: Math.round(Number(summary.waterIntake) || 0),
      goal_ml: Math.round(Number(goals.water_goal_ml) || 0)
    },
    containers: (containers || []).map((c) => ({
      id: c.id,
      name: c.name,
      volume: Number(c.volume),
      unit: c.unit,
      volume_ml: calcVolumeMl(c.volume, c.unit, c.volume_ml),
      is_primary: c.is_primary
    })),
    doses: [],
    medications: (meds || []).map((m) => ({
      id: m.id,
      name: m.name,
      dose_amount: m.dose_amount ?? m.strength_value ?? null,
      dose_unit: m.dose_unit ?? m.strength_unit ?? null
    })),
    cycle: null,
    flowLevels: ['none', 'spotting', 'light', 'medium', 'heavy'],
    fasting: fastingCurrent ? {
      start_time: fastingCurrent.start_time,
      target_end_time: fastingCurrent.target_end_time,
      fasting_type: fastingCurrent.fasting_type,
      status: fastingCurrent.status
    } : null,
    fastingPrefs: fastingPrefs ? {
      fasting_type: (fastingPrefs.default_protocol || '16:8').replace('-', ':'),
      hours: Number(fastingPrefs.target_fasting_hours) || Number(String(fastingPrefs.default_protocol || '').split(/[-:]/)[0]) || 16
    } : null,
    symptoms: [],
    foods: [],
    mealTypes: []
  }

  return { synced, today, sensorMode, config: cfg }
}
