// Percorre os ramos de api.js e doses.js numa única instância. Motivo: o relatório de cobertura lê só a
// última instância carregada de cada arquivo, e cada load() gera uma nova. Quem chama faz load() e passa aqui.
import assert from 'node:assert/strict'
import { routes } from './full-routes.mjs'

const NOW = new Date(2026, 9, 24, 10, 0)
const entry = (type, data) => ({ id: '1', type, data, ts: '2026-10-24T12:00:00.000Z', date: '2026-10-24', time: '09:00' })
const D = '2026-10-24'
const OK = { '/api/v2/measurements/water-intake': {}, '/api/v2/medications/entries': {}, '/api/mood': {}, '/api/v2/symptoms/entries': {},
  '/api/fasting/start': {}, '/api/fasting/end': {}, '/api/health-data': {}, '/api/v2/cycle/logs/2026-10-24': {}, '/api/food-entries/': {} }

export async function sweepApi(api, Z, settings) {
  const set = (edit) => { const r = routes(); edit(r); Z.routes = r }
  Z.routes = routes()
  await api.fetchToday(NOW) // caminho completo
  set((r) => { r[`/api/daily-summary?date=${D}`] = {} }) // sem metas, balanço nem comidas
  assert.equal((await api.fetchToday(NOW)).macros.protein.value, 0)
  set((r) => { r[`/api/daily-summary?date=${D}`] = { goals: { calories: 2000 }, foodEntries: [{ protein: 10, quantity: 2 }], calorieBalance: { goal: 1500 } } })
  const t1 = await api.fetchToday(NOW)
  assert.deepEqual([t1.calories.goal, t1.macros.protein.value], [1500, 20])
  set((r) => { delete r['/api/favorites']; delete r['/api/foods']; r['/api/meal-types'] = [{ id: 'z', name: 'Z' }] })
  assert.deepEqual((await api.fetchToday(NOW)).foods, [])
  set((r) => { r['/api/v2/symptoms/custom'] = [{ id: 's', name: 'nome', display_name: null, is_archived: false }] })
  assert.deepEqual((await api.fetchToday(NOW)).symptoms, [{ id: 's', name: 'nome' }])
  set((r) => { r[`/api/v2/cycle/overview?date=${D}`] = { settings: {}, phase: 'p', cycleDay: 1, late: { isLate: true } } })
  assert.equal((await api.fetchToday(NOW)).cycle.isLate, true)
  set((r) => { r['/api/fasting/preferences'] = { status: 200, body: 'null' }; r['/api/fasting/current'] = { status: 200, body: 'null' } })
  const t2 = await api.fetchToday(NOW)
  assert.deepEqual([t2.fasting, t2.fastingPrefs], [null, null])
  // doses: todos os tipos de agenda e ramos de data
  const sch = (o) => ({ id: 'x', schedule_type_id: 'daily', time_of_day: '08:00:00', ...o })
  set((r) => { r['/api/v2/medications?activeOnly=true'] = [
    { id: 'a', name: 'A', is_active: false, schedules: [sch()] },
    { id: 'b', name: 'B', dose_amount: 5, dose_unit: 'mg', schedules: [
      sch({ id: 'd1', time_of_day: null }), sch({ id: 'w', schedule_type_id: 'weekly', days_of_week: [6] }), sch({ id: 'p', schedule_type_id: 'prn' }),
      sch({ id: 'e', schedule_type_id: 'every_n_days', interval_days: 1, start_date: '2026-10-20' }), sch({ id: 'e0', schedule_type_id: 'every_n_days', interval_days: 0 }),
      sch({ id: 'm', schedule_type_id: 'monthly', day_of_month: 25 }), sch({ id: 'c', schedule_type_id: 'cyclic', cycle_on_days: 1, cycle_off_days: 1, start_date: '2026-10-20' }),
      sch({ id: 'c0', schedule_type_id: 'cyclic', cycle_on_days: 0 }), sch({ id: 'z', schedule_type_id: 'zzz' }),
      sch({ id: 'c1', created_at: '2026-10-25T08:00:00' }), sch({ id: 'ina', active: false }), sch({ id: 'end', end_date: '2026-10-23' }),
      sch({ id: 'st', start_date: '2026-10-25' }), sch({ id: 'tp', schedule_type_id: 'taper', dose_amount: 1 })] }] })
  const t3 = await api.fetchToday(NOW)
  assert.ok(t3.doses.some((d) => d.schedule_id === 'd1' && d.label === 'B'))
  // HTTP: corpo objeto passa direto
  set((r) => { r['/api/mood'] = { status: 200, body: { ok: 1 } } })
  assert.deepEqual(await api.call('POST', '/api/mood', { a: 1 }), { ok: 1 })
  // credencial ausente
  settings.server = ''
  await assert.rejects(api.call('GET', '/x'), /configure servidor/)
  settings.server = 'https://sf.test/'
  settings.apiKey = ''
  await assert.rejects(api.call('GET', '/x'), /configure servidor/)
  settings.apiKey = 'K'
  // todos os envios, com e sem jejum ativo
  set((r) => Object.assign(r, { ...OK, '/api/fasting/current': { id: 'f1', start_time: 'S' } }))
  const sends = [
    entry('water', { container_id: 3, change: 1 }),
    entry('meds', { medication_id: 'm1', status: 'taken', schedule_id: 's1', scheduled_for: 'x' }),
    entry('meds', { medication_id: 'm1', status: 'prn_taken' }),
    entry('cycle', { flow_level: 'light' }),
    entry('food', { food_id: 'f1', name: 'A', variant_id: 'v1', quantity: 1, unit: 'g', meal_type_id: 'b' }),
    entry('mood', { mood_value: 4 }),
    entry('symptom', { symptom_id: 'sy1', name: 'Dor' }),
    entry('fast_start', { fasting_type: '16:8', target_end_time: 'T' }),
    entry('fast_end', {}),
    entry('health', { type: 'steps', value: 1 }),
    entry('desconhecido', {})
  ]
  for (const e of sends) await api.sendEntry(e)
  assert.ok(Z.fetched.some((f) => f.url.endsWith('/api/fasting/end')))
  set((r) => Object.assign(r, { ...OK, '/api/fasting/current': { status: 200, body: 'null' } }))
  await api.sendEntry(entry('fast_end', {}))
  assert.equal(Z.fetched.at(-1).method, 'GET')
}
