import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reset, load } from './helpers.mjs'
import { routes } from './fixtures/full-routes.mjs'
import { sweepApi } from './fixtures/api-sweep.mjs'

const S = { server: 'https://sf.test/', apiKey: 'K' }
const NOW = new Date(2026, 9, 24, 10, 0)
const entry = (type, data) => ({ id: '1', type, data, ts: '2026-10-24T12:00:00.000Z', date: '2026-10-24', time: '09:00' })
const setup = async (opts = {}) => { const Z = reset({ settings: S, ...opts }); return { Z, api: await load('app-side/api.js') } }
const last = (Z) => Z.fetched.at(-1)

test('fetchToday monta o Today a partir das respostas reais', async () => {
  const { Z, api } = await setup({ routes: routes() })
  const t = await api.fetchToday(NOW)
  assert.equal(t.date, '2026-10-24')
  assert.deepEqual(t.calories, { eaten: 350, burned: 1800, remaining: 1650, goal: 2000 })
  assert.deepEqual(t.macros.protein, { value: 15, goal: 150 }) // 2.5*200/100 + 10
  assert.equal(t.macros.carbs.value, 56)
  assert.deepEqual(t.water, { ml: 750, goal_ml: 2500 })
  assert.equal(t.containers[0].is_primary, true)
  assert.deepEqual(t.cycle, { phase: 'luteal', cycleDay: 20, isLate: false })
  assert.equal(t.fasting.status, 'ACTIVE')
  assert.deepEqual(t.fastingPrefs, { fasting_type: '16:8', hours: 16 })
  assert.deepEqual(t.symptoms, [{ id: 'sy1', name: 'Dor de cabeça' }])
  assert.deepEqual(t.foods.map((f) => f.food_id), ['f1', 'f3']) // sem duplicata nem item sem variante
  assert.deepEqual(t.mealTypes, [{ id: 'b', name: 'Breakfast' }])
  assert.deepEqual(t.medications.map((m) => m.id), ['m1', 'm2'])
  assert.deepEqual(t.doses.slice(0, 2).map((d) => [d.schedule_id, d.done]), [['s1', true], ['s2', false]])
  assert.equal(t.doses.length, 4) // hoje + amanhã
  assert.equal(last(Z).headers.Authorization, 'Bearer K')
})

test('endpoints opcionais falhando viram null/[]', async () => {
  const r = routes()
  for (const k of Object.keys(r)) if (/medications|cycle|fasting|symptoms|favorites|foods|meal-types/.test(k)) delete r[k]
  const { api } = await setup({ routes: r })
  const t = await api.fetchToday(NOW)
  assert.deepEqual([t.cycle, t.fasting, t.fastingPrefs, t.symptoms, t.foods, t.doses, t.mealTypes], [null, null, null, [], [], [], []])
})

test('ciclo sem configuração e jejum inativo (corpo null)', async () => {
  const r = routes()
  r['/api/v2/cycle/overview?date=2026-10-24'] = { settings: null }
  r['/api/fasting/current'] = { status: 200, body: 'null' }
  const { api } = await setup({ routes: r })
  const t = await api.fetchToday(NOW)
  assert.equal(t.cycle, null)
  assert.equal(t.fasting, null)
})

test('resumo ou recipientes falhando lançam', async () => {
  for (const k of ['/api/daily-summary?date=2026-10-24', '/api/water-containers']) {
    const r = routes(); r[k] = { status: 500, body: '' }
    const { api } = await setup({ routes: r })
    await assert.rejects(api.fetchToday(NOW), /HTTP 500/)
  }
})

test('resumo sem metas nem balanço usa zeros', async () => {
  const r = routes(); r['/api/daily-summary?date=2026-10-24'] = { waterIntake: 0 }
  const { api } = await setup({ routes: r })
  const t = await api.fetchToday(NOW)
  assert.deepEqual(t.calories, { eaten: 0, burned: 0, remaining: 0, goal: 0 })
  assert.equal(t.macros.fiber.value, 0)
})

test('credencial ausente, 4xx e corpo vazio', async () => {
  let { api } = await setup({ settings: {} })
  await assert.rejects(api.call('GET', '/x'), /configure servidor/)
  ;({ api } = await setup({ routes: { '/a': { status: 401, body: '' }, '/b': { status: 204, body: '' }, '/c': { status: 200, body: '' } } }))
  await assert.rejects(api.call('GET', '/a'), /HTTP 401/)
  assert.equal(await api.call('GET', '/b'), '')
  assert.equal(await api.call('GET', '/c'), '')
})

test('barra no final do servidor é removida', async () => {
  const { Z, api } = await setup({ routes: { '/x': {} } })
  await api.call('GET', '/x')
  assert.equal(last(Z).url, 'https://sf.test/x')
})

const sent = async (e, extra = {}) => {
  const { Z, api } = await setup({ routes: { '/api/fasting/current': { id: 'f1', start_time: 'S' }, ...extra } })
  await api.sendEntry(e)
  return Z.fetched.map((f) => [f.method, f.url.replace('https://sf.test', ''), f.body])
}
const ok = { '/api/v2/measurements/water-intake': {}, '/api/v2/medications/entries': {}, '/api/mood': {}, '/api/v2/symptoms/entries': {},
  '/api/fasting/start': {}, '/api/fasting/end': {}, '/api/health-data': {}, '/api/v2/cycle/logs/2026-10-24': {}, '/api/food-entries/': {} }

test('água +1 e -1', async () => {
  for (const change of [1, -1]) {
    assert.deepEqual(await sent(entry('water', { container_id: 3, change }), ok),
      [['POST', '/api/v2/measurements/water-intake', { entry_date: '2026-10-24', change_drinks: change, container_id: 3 }]])
  }
})

test('remédio agendado (taken/skipped/snoozed) leva schedule_id e scheduled_for', async () => {
  for (const status of ['taken', 'skipped', 'snoozed']) {
    const [[m, u, b]] = await sent(entry('meds', { medication_id: 'm1', status, schedule_id: 's1', scheduled_for: '2026-10-24T11:00:00Z', dose_amount: 500, dose_unit: 'mg' }), ok)
    assert.deepEqual([m, u], ['POST', '/api/v2/medications/entries'])
    assert.deepEqual(b, { medication_id: 'm1', status, schedule_id: 's1', scheduled_for: '2026-10-24T11:00:00Z', taken_at: '2026-10-24T12:00:00.000Z',
      entry_date: '2026-10-24', dose_amount_snapshot: 500, dose_unit_snapshot: 'mg', source: 'zepp' })
  }
})

test('remédio avulso ou agendado incompleto vira prn_taken', async () => {
  for (const data of [{ medication_id: 'm1', status: 'prn_taken', schedule_id: 's1', scheduled_for: 'x' }, { medication_id: 'm1', status: 'taken', schedule_id: 's1' }, { medication_id: 'm1' }]) {
    const [[, , b]] = await sent(entry('meds', data), ok)
    assert.deepEqual([b.status, b.schedule_id, b.scheduled_for, b.dose_amount_snapshot], ['prn_taken', null, null, null])
  }
})

test('ciclo, alimento, humor, sintoma', async () => {
  assert.deepEqual(await sent(entry('cycle', { flow_level: 'light' }), ok), [['PUT', '/api/v2/cycle/logs/2026-10-24', { flow_level: 'light' }]])
  const food = { food_id: 'f1', name: 'Arroz', variant_id: 'v1', quantity: 100, unit: 'g', meal_type_id: 'b' }
  assert.deepEqual((await sent(entry('food', food), ok))[0][2],
    { food_id: 'f1', variant_id: 'v1', quantity: 100, unit: 'g', meal_type_id: 'b', entry_date: '2026-10-24', entry_time: '09:00' })
  assert.deepEqual(await sent(entry('mood', { mood_value: 4 }), ok), [['POST', '/api/mood', { mood_value: 4, entry_date: '2026-10-24' }]])
  assert.deepEqual(await sent(entry('symptom', { symptom_id: 'sy1', name: 'Dor' }), ok),
    [['POST', '/api/v2/symptoms/entries', { symptom_id: 'sy1', symptom_name_snapshot: 'Dor', entry_date: '2026-10-24', logged_at: '2026-10-24T12:00:00.000Z', source: 'zepp' }]])
})

test('jejum: início e fim (fim busca o id do jejum ativo)', async () => {
  assert.deepEqual(await sent(entry('fast_start', { fasting_type: '16:8', target_end_time: 'T' }), ok),
    [['POST', '/api/fasting/start', { start_time: '2026-10-24T12:00:00.000Z', target_end_time: 'T', fasting_type: '16:8' }]])
  assert.deepEqual(await sent(entry('fast_end', {}), ok), [['GET', '/api/fasting/current', undefined],
    ['POST', '/api/fasting/end', { id: 'f1', start_time: 'S', end_time: '2026-10-24T12:00:00.000Z' }]])
  // sem jejum ativo: nada a encerrar
  assert.equal((await sent(entry('fast_end', {}), { ...ok, '/api/fasting/current': { status: 200, body: 'null' } })).length, 1)
})

test('health vai como array com source zepp; tipo desconhecido é ignorado', async () => {
  assert.deepEqual(await sent(entry('health', { type: 'steps', value: 5000 }), ok),
    [['POST', '/api/health-data', [{ type: 'steps', value: 5000, date: '2026-10-24', source: 'zepp' }]]])
  assert.deepEqual(await sent(entry('nada', {}), ok), [])
})

test('erro HTTP no envio rejeita', async () => {
  const { api } = await setup({ routes: { '/api/mood': { status: 503, body: '' } } })
  await assert.rejects(api.sendEntry(entry('mood', { mood_value: 3 })), /HTTP 503/)
})

// Cobertura numa instância só (ver test/fixtures/api-sweep.mjs).
test('cobertura: fetchToday e envios percorrem os ramos numa instância', async () => {
  const settings = { ...S }
  const Z = reset({ settings, routes: routes() })
  await sweepApi(await load('app-side/api.js'), Z, settings)
})
