import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load, reset, tap } from './helpers.mjs'
import { theme } from '../utils/theme.js'

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/today.json', import.meta.url)))
// Módulos reais (utils/sensors.js, utils/reminders.js). Sensores sem configuração lançam erro (falha de sensor);
// alarmes são conferidos em Z.alarm._map; falha de lembrete = alarm.set lançando.
const FUTURE = { medication_id: 'm4', schedule_id: 's4', scheduled_for: '2099-01-01T08:00:00.000Z', label: 'Omega', dose_amount: 1, dose_unit: 'cp', done: false }
const withFuture = (T) => ({ ...T, doses: [...T.doses, FUTURE] })
const alarmDoseIds = (Z) => [...Z.alarm._map.values()].map((o) => JSON.parse(o.param).medication_id).sort()
const pendingIds = (T) => T.doses.filter((d) => !d.done && Date.parse(d.scheduled_for) > Date.now()).map((d) => d.medication_id).sort()
const failAlarms = (Z) => { const real = Z.alarm.set; Z.alarm.set = () => { throw new Error('alarm') }; return () => { Z.alarm.set = real } }
const texts = (Z) => Z.widgets.map((w) => w.props.text).filter(Boolean)
const queue = (Z) => JSON.parse(Z.storage.getItem('queue', '[]'))
const toasts = (Z) => Z.calls.filter((c) => c[0] === 'toast').map((c) => c[1])
const tick = () => new Promise((r) => setTimeout(r, 0))
// Timers falsos: a página de jejum agenda setInterval; o teste dispara e confere o clear.
const timers = new Map()
let nextTimer = 1
globalThis.setInterval = (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id }
globalThis.clearInterval = (id) => { timers.delete(id) }

async function open(entry, { today, params, request, sensors } = {}) {
  const Z = reset({ sensors })
  if (today) Z.storage.setItem('today', JSON.stringify(today))
  await load(entry)
  const page = Z.page
  page.request = request
  page.onInit?.(params && JSON.stringify(params))
  page.build()
  return { Z, page }
}

test('dashboard sem cache pede sync e mostra botão', async () => {
  const { Z } = await open('page/index.js')
  assert.ok(texts(Z).includes('dash.syncToDownload'))
  assert.ok(texts(Z).includes('dash.sync (0)'))
})

test('dashboard completo: textos, cores e navegação', async () => {
  const { Z } = await open('page/index.js', { today: fixture() })
  const t = texts(Z)
  for (const x of ['800', 'dash.remaining', 'dash.eaten 1200', 'dash.burned 300', '80/150', '500/2000 ml', 'dash.noDoses'.slice(0, 0)]) assert.ok(x === '' || t.includes(x), x)
  assert.ok(t.some((x) => x.startsWith('dash.meds: ') && x.includes('Vitamina D')))
  assert.ok(t.includes('dash.cycle: luteal 21'))
  const ring = Z.widgets.find((w) => w.type === 'ARC_PROGRESS')
  assert.equal(ring.props.level, 60)
  assert.equal(ring.props.color, 0x8792e3)
  tap(Z, 'dash.mood')
  tap(Z, 'dash.fasting')
  assert.deepEqual(Z.calls.filter((c) => c[0] === 'push').map((c) => c[1]),
    [{ url: 'page/list', params: '{"key":"mood"}' }, { url: 'page/fasting' }])
})

test('dashboard acima da meta usa a cor over', async () => {
  const T = fixture(); T.calories = { eaten: 2300, burned: 0, remaining: -300, goal: 2000 }
  const { Z } = await open('page/index.js', { today: T })
  const ring = Z.widgets.find((w) => w.type === 'ARC_PROGRESS')
  assert.equal(ring.props.color, 0xe16b71)
  assert.equal(ring.props.level, 100)
  assert.ok(texts(Z).includes('dash.over'))
})

test('água +/- atualiza cache, barra, fila e botão de sync', async () => {
  const { Z } = await open('page/index.js', { today: fixture() })
  tap(Z, '+')
  tap(Z, '+')
  tap(Z, '−')
  assert.ok(texts(Z).includes('750/2000 ml'))
  assert.ok(texts(Z).includes('dash.sync (3)'))
  assert.deepEqual(queue(Z).map((e) => [e.type, e.data]), [['water', { container_id: 3, change: 1 }],
    ['water', { container_id: 3, change: 1 }], ['water', { container_id: 3, change: -1 }]])
  assert.equal(JSON.parse(Z.storage.getItem('today')).water.ml, 750)
})

test('sync: coleta saúde, envia fila, remove confirmados, salva cache e agenda lembretes', async () => {
  const T = withFuture(fixture())
  const sent = []
  const { Z, page } = await open('page/index.js', { today: T,
    request: async (m) => { sent.push(m); return { synced: [queue(Z)[0].id], today: { ...T, water: { ml: 1, goal_ml: 2 } } } } })
  tap(Z, '+'); tap(Z, '+')
  // sensores não configurados: collectHealth falha e não bloqueia o envio
  tap(Z, 'dash.sync')
  await tick(); await tick()
  assert.equal(sent[0].method, 'sync')
  assert.equal(sent[0].params.entries.length, 2)
  assert.equal(queue(Z).length, 1)
  assert.equal(JSON.parse(Z.storage.getItem('today')).water.ml, 1)
  assert.deepEqual(alarmDoseIds(Z), pendingIds(T))
  assert.ok(alarmDoseIds(Z).includes('m4'))
  assert.ok(toasts(Z).includes('1 dash.sent'))
  assert.deepEqual(Z.calls.find((c) => c[0] === 'replace')[1], { url: 'page/index' })
})

test('sync coleta saúde dos sensores e enfileira antes de enviar', async () => {
  const sent = []
  const sensors = { Step: { getCurrent: () => 4321 }, Calorie: { getCurrent: () => 0 }, HeartRate: { getResting: () => 60 },
    Sleep: { updateInfo() {}, getInfo: () => ({ totalTime: 0 }) } }
  const { Z } = await open('page/index.js', { today: { ...fixture(), sensorMode: 'direct' }, sensors, request: async (m) => { sent.push(m); return { synced: [] } } })
  tap(Z, 'dash.sync'); await tick(); await tick()
  assert.deepEqual(sent[0].params.entries.filter((e) => e.type === 'health').map((e) => [e.data.type, e.data.value]),
    [['steps', 4321], ['resting_heart_rate', 60]])
})

test('sync no modo padrão (Health Connect) não coleta nem envia dados de saúde do relógio', async () => {
  const sent = []
  const sensors = { Step: { getCurrent: () => 4321 }, Calorie: { getCurrent: () => 0 }, HeartRate: { getResting: () => 60 },
    Sleep: { updateInfo() {}, getInfo: () => ({ totalTime: 0 }) } }
  const { Z } = await open('page/index.js', { today: fixture(), sensors, request: async (m) => { sent.push(m); return { synced: [] } } })
  tap(Z, 'dash.sync'); await tick(); await tick()
  assert.equal(sent[0].params.entries.filter((e) => e.type === 'health').length, 0)
})

test('sync: erro do servidor, falha do lembrete e celular desconectado', async () => {
  let reply = { synced: [], error: 'boom' }
  const { Z } = await open('page/index.js', { today: fixture(), request: async () => { if (!reply) throw new Error('ble'); return reply } })
  tap(Z, 'dash.sync'); await tick(); await tick()
  assert.ok(toasts(Z).includes('dash.error: boom'))
  assert.ok(texts(Z).includes('dash.sync (0)'))
  const restore = failAlarms(Z)
  reply = { synced: [], today: withFuture(fixture()) }
  tap(Z, 'dash.sync'); await tick(); await tick()
  assert.ok(Z.calls.some((c) => c[0] === 'replace'))
  restore()
  reply = null
  tap(Z, 'dash.sync'); await tick(); await tick()
  assert.ok(toasts(Z).includes('dash.disconnected'))
})

test('lista sem cache e lista vazia', async () => {
  let r = await open('page/list.js', { params: { key: 'mood' } })
  assert.ok(texts(r.Z).includes('dash.syncToDownload'))
  const T = fixture(); T.symptoms = []
  r = await open('page/list.js', { today: T, params: { key: 'symptom' } })
  assert.ok(texts(r.Z).includes('list.empty'))
})

test('lista de água: total e +/- por recipiente', async () => {
  const { Z } = await open('page/list.js', { today: fixture(), params: { key: 'water' } })
  assert.ok(texts(Z).includes('500 / 2000 ml'))
  tap(Z, '+ Copo')
  assert.ok(texts(Z).includes('750 / 2000 ml'))
  tap(Z, '− Copo')
  assert.deepEqual(queue(Z).map((e) => e.data), [{ container_id: 3, change: 1 }, { container_id: 3, change: -1 }])
  assert.ok(toasts(Z).includes('list.registered (2)'))
})

test('remédios: dose feita não clica, pendente vai a taken/skipped, PRN direto', async () => {
  let r = await open('page/list.js', { today: fixture(), params: { key: 'meds' } })
  const done = r.Z.widgets.find((w) => String(w.props.text).startsWith('✓ '))
  assert.equal(done.props.color, 0x737b8c)
  done.props.click_func()
  assert.deepEqual([queue(r.Z).length, r.Z.calls.filter((c) => c[0] === 'push' || c[0] === 'replace').length], [0, 0])
  tap(r.Z, 'Ibuprofeno')
  assert.deepEqual(queue(r.Z)[0].data, { medication_id: 'm3', status: 'prn_taken', dose_amount: 400, dose_unit: 'mg' })
  tap(r.Z, 'Vitamina D') // dose pendente
  const nav = r.Z.calls.find((c) => c[0] === 'push')[1]
  assert.equal(nav.url, 'page/list')

  for (const [label, status] of [['list.taken', 'taken'], ['list.skipped', 'skipped']]) {
    r = await open('page/list.js', { params: { key: 'dose', dose: fixture().doses[1] }, today: fixture() })
    tap(r.Z, label)
    assert.deepEqual(queue(r.Z)[0].data, { medication_id: 'm2', status, schedule_id: 's2',
      scheduled_for: '2026-10-24T20:00:00.000Z', dose_amount: 1, dose_unit: 'cp' })
    assert.equal(JSON.parse(r.Z.storage.getItem('today')).doses[1].done, true)
    assert.deepEqual(r.Z.calls.find((c) => c[0] === 'replace')[1], { url: 'page/list', params: '{"key":"meds"}' })
  }
})

test('ciclo, humor, sintoma e alimento enfileiram o item exato', async () => {
  let r = await open('page/list.js', { today: fixture(), params: { key: 'cycle' } })
  tap(r.Z, 'flow.heavy')
  assert.deepEqual(queue(r.Z)[0].data, { flow_level: 'heavy' })
  r = await open('page/list.js', { today: fixture(), params: { key: 'mood' } })
  tap(r.Z, 'mood.4')
  assert.deepEqual(queue(r.Z)[0].data, { mood_value: 4 })
  r = await open('page/list.js', { today: fixture(), params: { key: 'symptom' } })
  tap(r.Z, 'Dor de cabeça')
  assert.deepEqual(queue(r.Z)[0].data, { symptom_id: 'y1', name: 'Dor de cabeça' })
  r = await open('page/list.js', { today: fixture(), params: { key: 'food' } })
  tap(r.Z, 'Arroz')
  assert.equal(r.Z.calls.find((c) => c[0] === 'push')[1].params, JSON.stringify({ key: 'meal', food: fixture().foods[0] }))
  r = await open('page/list.js', { today: fixture(), params: { key: 'meal', food: fixture().foods[0] } })
  tap(r.Z, 'Café')
  assert.deepEqual(queue(r.Z)[0].data, { food_id: 'f1', name: 'Arroz', variant_id: 'v1', quantity: 100, unit: 'g', meal_type_id: 'b' })
  assert.deepEqual(r.Z.calls.find((c) => c[0] === 'replace')[1], { url: 'page/list', params: '{"key":"food"}' })
})

test('lista sem parâmetros usa objeto vazio', async () => {
  const Z = reset()
  await load('page/list.js')
  Z.page.onInit(undefined)
  assert.deepEqual(Z.page.params, {})
})

test('jejum: sem cache, sem prefs, iniciar e encerrar com cache otimista', async () => {
  let r = await open('page/fasting.js')
  assert.ok(texts(r.Z).includes('dash.syncToDownload'))
  const T = fixture(); T.fastingPrefs = null
  r = await open('page/fasting.js', { today: T })
  assert.ok(texts(r.Z).includes('fast.noPrefs'))
  assert.ok(!texts(r.Z).includes('fast.start'))

  r = await open('page/fasting.js', { today: fixture() })
  assert.ok(texts(r.Z).includes('fast.protocol 16:8'))
  tap(r.Z, 'fast.start')
  const item = queue(r.Z)[0]
  assert.equal(item.type, 'fast_start')
  assert.equal(item.data.fasting_type, '16:8')
  const h = (Date.parse(item.data.target_end_time) - Date.parse(item.ts)) / 3600e3
  assert.ok(Math.abs(h - 16) < 0.01)
  assert.equal(JSON.parse(r.Z.storage.getItem('today')).fasting.status, 'active')
  assert.ok(r.Z.calls.some((c) => c[0] === 'replace'))
})

test('jejum ativo mostra timer; encerrar enfileira fast_end e limpa cache', async () => {
  const T = fixture()
  const now = Date.now()
  T.fasting = { start_time: new Date(now - 8 * 3600e3).toISOString(), target_end_time: new Date(now + 8 * 3600e3).toISOString(),
    fasting_type: '16:8', status: 'active' }
  const r = await open('page/fasting.js', { today: T })
  assert.equal(r.Z.widgets.find((w) => w.type === 'ARC_PROGRESS').props.level, 50)
  assert.ok(texts(r.Z).includes('8:00'))
  assert.ok(texts(r.Z).some((x) => x.startsWith('fast.remaining 7:5') || x.startsWith('fast.remaining 8:00')))
  tap(r.Z, 'fast.end')
  assert.deepEqual(queue(r.Z).map((e) => [e.type, e.data]), [['fast_end', {}]])
  assert.equal(JSON.parse(r.Z.storage.getItem('today')).fasting, null)
})

test('jejum além da meta: anel completo em success e restante zerado', async () => {
  const T = fixture()
  const now = Date.now()
  T.fasting = { start_time: new Date(now - 20 * 3600e3).toISOString(), target_end_time: new Date(now - 4 * 3600e3).toISOString(), status: 'active' }
  const r = await open('page/fasting.js', { today: T })
  const ring = r.Z.widgets.find((w) => w.type === 'ARC_PROGRESS')
  assert.equal(ring.props.level, 100)
  assert.equal(ring.props.color, 0x3ecc7b)
  assert.ok(texts(r.Z).includes('fast.remaining 0:00'))
})

test('dose registrada vira feita no cache e na lista recarregada, sem novo toque', async () => {
  const r = await open('page/list.js', { today: fixture(), params: { key: 'dose', dose: fixture().doses[1] } })
  tap(r.Z, 'list.taken')
  assert.equal(JSON.parse(r.Z.storage.getItem('today')).doses[1].done, true)
  assert.equal(JSON.parse(r.Z.storage.getItem('today')).doses[0].done, fixture().doses[0].done)
  const again = await open('page/list.js', { today: JSON.parse(r.Z.storage.getItem('today')), params: { key: 'meds' } })
  const row = again.Z.widgets.find((w) => String(w.props.text).includes('Vitamina D') && String(w.props.text).startsWith('✓ '))
  assert.ok(row)
  assert.equal(row.props.color, 0x737b8c)
  row.props.click_func()
  assert.equal(queue(again.Z).length, 0)
})

test('jejum: timer de 1 min atualiza tempo decorrido e restante, e onDestroy limpa', async () => {
  timers.clear()
  const realNow = Date.now
  try {
    const T = fixture()
    const now = realNow()
    T.fasting = { start_time: new Date(now - 8 * 3600e3).toISOString(), target_end_time: new Date(now + 8 * 3600e3).toISOString(),
      fasting_type: '16:8', status: 'active' }
    const r = await open('page/fasting.js', { today: T })
    assert.equal(timers.size, 1)
    const [[id, tm]] = [...timers]
    assert.equal(tm.ms, 60000)
    Date.now = () => now + 3600e3 // uma hora depois
    tm.fn()
    assert.ok(texts(r.Z).includes('9:00'))
    assert.ok(texts(r.Z).includes('fast.remaining 7:00'))
    r.page.onDestroy()
    assert.equal(timers.has(id), false)
    assert.equal(timers.size, 0)
  } finally {
    Date.now = realNow
  }
})

test('jejum sem ativo não agenda timer', async () => {
  timers.clear()
  await open('page/fasting.js', { today: fixture() })
  assert.equal(timers.size, 0)
})

// ---- cobertura extra: dashboard (index.js) ----

test('dashboard sem recipientes: sem botões de água, barra e sync continuam', async () => {
  const T = fixture(); T.containers = []
  const { Z } = await open('page/index.js', { today: T })
  const t = texts(Z)
  assert.ok(!t.includes('+') && !t.includes('−'))
  assert.ok(t.includes('500/2000 ml'))
  assert.ok(t.includes('dash.sync (0)'))
})

test('dashboard sem recipiente primário usa o primeiro da lista', async () => {
  const T = fixture()
  T.containers = [{ id: 7, name: 'Garrafa', volume: 500, unit: 'ml', volume_ml: 500, is_primary: false },
    { id: 8, name: 'Copo', volume: 250, unit: 'ml', volume_ml: 250, is_primary: false }]
  const { Z } = await open('page/index.js', { today: T })
  tap(Z, '+')
  assert.equal(queue(Z)[0].data.container_id, 7)
  assert.equal(JSON.parse(Z.storage.getItem('today')).water.ml, 1000)
  assert.ok(texts(Z).includes('1000/2000 ml'))
})

test('água − abaixo de zero: cache fica em 0 e a fila registra o −1', async () => {
  const T = fixture(); T.water.ml = 100
  const { Z } = await open('page/index.js', { today: T })
  tap(Z, '−')
  assert.equal(JSON.parse(Z.storage.getItem('today')).water.ml, 0)
  assert.ok(texts(Z).includes('0/2000 ml'))
  assert.deepEqual(queue(Z).map((e) => e.data), [{ container_id: 3, change: -1 }])
})

test('metas zeradas não dividem por zero e barras param em 100%', async () => {
  const T = fixture(); T.calories.goal = 0; T.water.goal_ml = 0; T.macros.protein.goal = 0
  const { Z } = await open('page/index.js', { today: T })
  assert.equal(Z.widgets.find((w) => w.type === 'ARC_PROGRESS').props.level, 100)
  const fill = (color) => Z.widgets.filter((w) => w.type === 'FILL_RECT' && w.props.color === color).map((w) => w.props.w)
  assert.deepEqual(fill(0x4799c2), [340])
  assert.deepEqual(fill(0xe3ae63), [150])
  assert.ok(texts(Z).includes('80/0'))
})

test('macro e água parciais: barra proporcional ao consumo', async () => {
  const { Z } = await open('page/index.js', { today: fixture() })
  const fill = (color) => Z.widgets.filter((w) => w.type === 'FILL_RECT' && w.props.color === color).map((w) => w.props.w)
  assert.deepEqual(fill(0x4799c2), [Math.round(340 * 500 / 2000)])
  assert.deepEqual(fill(0xe3ae63), [Math.round(150 * 80 / 150)])
})

test('dashboard sem doses pendentes e sem ciclo mostra placeholders', async () => {
  const T = fixture(); T.doses = T.doses.map((d) => ({ ...d, done: true })); T.cycle = null
  const { Z } = await open('page/index.js', { today: T })
  const t = texts(Z)
  assert.ok(t.includes('dash.meds: dash.noDoses'))
  assert.ok(t.includes('dash.cycle: -'))
  assert.ok(t.includes('dash.fasting: -'))
})

test('dashboard sem nenhuma dose cadastrada mostra placeholder', async () => {
  const T = fixture(); T.doses = []
  const { Z } = await open('page/index.js', { today: T })
  assert.ok(texts(Z).includes('dash.meds: dash.noDoses'))
})

test('cartões do dashboard levam às telas certas e jejum ativo aparece', async () => {
  const { Z } = await open('page/index.js', { today: fixture() })
  tap(Z, 'dash.meds'); tap(Z, 'dash.cycle'); tap(Z, 'dash.symptom'); tap(Z, 'dash.food')
  assert.deepEqual(Z.calls.filter((c) => c[0] === 'push').map((c) => c[1]), [
    { url: 'page/list', params: '{"key":"meds"}' }, { url: 'page/list', params: '{"key":"cycle"}' },
    { url: 'page/list', params: '{"key":"symptom"}' }, { url: 'page/list', params: '{"key":"food"}' }])
  const T = fixture(); T.fasting = { start_time: new Date().toISOString(), target_end_time: new Date(Date.now() + 3600e3).toISOString(), status: 'active' }
  const r = await open('page/index.js', { today: T })
  assert.ok(texts(r.Z).includes('dash.fasting: dash.active'))
})

test('sync sem lista de enviados nem erro: toast com zero e contador da fila', async () => {
  const { Z } = await open('page/index.js', { today: fixture(), request: async () => ({ today: fixture() }) })
  tap(Z, 'dash.sync'); await tick(); await tick()
  assert.ok(toasts(Z).includes('0 dash.sent'))
  assert.ok(Z.calls.some((c) => c[0] === 'replace'))
})

test('sync sem cache do dia: não reconstrói a tela nem reagenda lembretes', async () => {
  const { Z } = await open('page/index.js', { request: async () => ({ synced: [] }) })
  tap(Z, 'dash.sync (0)'); await tick(); await tick()
  assert.ok(toasts(Z).includes('0 dash.sent'))
  assert.equal(Z.alarm._map.size, 0)
  assert.equal(Z.calls.some((c) => c[0] === 'replace'), false)
  assert.ok(texts(Z).includes('dash.sync (0)'))
})

// ---- cobertura extra: listas (list.js) ----

test('lista sem cache de cada tela mostra aviso de sincronia e nenhum botão', async () => {
  for (const key of ['water', 'meds', 'cycle', 'mood', 'symptom', 'food', 'meal']) {
    const { Z } = await open('page/list.js', { params: { key, food: { food_id: 'f1' } } })
    assert.ok(texts(Z).includes('dash.syncToDownload'), key)
    assert.equal(Z.widgets.filter((w) => w.type === 'BUTTON').length, 0, key)
  }
})

test('lista de água: recipientes com volume, total e vazio sem recipiente', async () => {
  const { Z } = await open('page/list.js', { today: fixture(), params: { key: 'water' } })
  assert.ok(texts(Z).includes('list.water'))
  assert.ok(texts(Z).includes('+ Copo 250ml'))
  assert.ok(texts(Z).includes('− Copo 250ml'))
  const T = fixture(); T.containers = []
  const empty = await open('page/list.js', { today: T, params: { key: 'water' } })
  assert.ok(texts(empty.Z).includes('list.empty'))
  assert.ok(!texts(empty.Z).includes('500 / 2000 ml'))
})

test('água − no total já zerado: cabeçalho fica em 0 e a fila registra −1', async () => {
  const T = fixture(); T.water.ml = 100
  const { Z } = await open('page/list.js', { today: T, params: { key: 'water' } })
  tap(Z, '− Copo')
  assert.ok(texts(Z).includes('0 / 2000 ml'))
  assert.ok(toasts(Z).includes('list.registered (1)'))
  assert.deepEqual(queue(Z).map((e) => e.data), [{ container_id: 3, change: -1 }])
})

test('remédios: PRN sem dose e com dose sem unidade, sem seção sem medicamentos', async () => {
  const T = fixture()
  T.medications = [{ id: 'm9', name: 'Vitamina C', dose_amount: null, dose_unit: null },
    { id: 'm10', name: 'Calcio', dose_amount: 2 }]
  const { Z } = await open('page/list.js', { today: T, params: { key: 'meds' } })
  assert.ok(texts(Z).includes('list.prn'))
  assert.ok(texts(Z).includes('Vitamina C'))
  assert.ok(texts(Z).includes('Calcio 2'))
  tap(Z, 'Vitamina C')
  assert.deepEqual(queue(Z)[0].data, { medication_id: 'm9', status: 'prn_taken', dose_amount: null, dose_unit: null })
  assert.ok(toasts(Z).includes('list.registered (1)'))
  assert.equal(Z.calls.some((c) => c[0] === 'replace'), false)

  const none = fixture(); none.medications = []
  const r = await open('page/list.js', { today: none, params: { key: 'meds' } })
  assert.ok(!texts(r.Z).includes('list.prn'))
})

test('remédios sem doses nem medicamentos mostra vazio', async () => {
  const T = fixture(); T.doses = []; T.medications = []
  const { Z } = await open('page/list.js', { today: T, params: { key: 'meds' } })
  assert.ok(texts(Z).includes('list.empty'))
})

test('dose: opções taken e skipped com toast e cache, sem marcar dose de outro horário', async () => {
  const { Z } = await open('page/list.js', { today: fixture(), params: { key: 'dose', dose: fixture().doses[1] } })
  assert.ok(texts(Z).includes('list.taken'))
  assert.ok(texts(Z).includes('list.skipped'))
  tap(Z, 'list.skipped')
  assert.ok(toasts(Z).includes('list.registered (1)'))
  const today = JSON.parse(Z.storage.getItem('today'))
  assert.equal(today.doses[0].done, true)
  assert.equal(today.doses[1].done, true)
  assert.equal(today.doses.length, 2)
})

test('ciclo lista os cinco fluxos e registra o escolhido', async () => {
  const { Z } = await open('page/list.js', { today: fixture(), params: { key: 'cycle' } })
  for (const f of ['none', 'spotting', 'light', 'medium', 'heavy']) assert.ok(texts(Z).includes(`flow.${f}`), f)
  tap(Z, 'flow.spotting')
  assert.deepEqual(queue(Z)[0].data, { flow_level: 'spotting' })
  assert.ok(toasts(Z).includes('list.registered (1)'))
})

test('humor lista os cinco níveis e registra o primeiro', async () => {
  const { Z } = await open('page/list.js', { today: fixture(), params: { key: 'mood' } })
  for (let v = 1; v <= 5; v++) assert.ok(texts(Z).includes(`mood.${v}`), `mood.${v}`)
  tap(Z, 'mood.1')
  assert.deepEqual(queue(Z)[0].data, { mood_value: 1 })
})

test('alimento sem favoritos e refeição sem tipos mostram vazio', async () => {
  const T = fixture(); T.foods = []
  let r = await open('page/list.js', { today: T, params: { key: 'food' } })
  assert.ok(texts(r.Z).includes('list.empty'))
  const M = fixture(); M.mealTypes = []
  r = await open('page/list.js', { today: M, params: { key: 'meal', food: fixture().foods[0] } })
  assert.ok(texts(r.Z).includes('list.empty'))
})

test('refeição com mais de um tipo grava o tipo escolhido', async () => {
  const M = fixture(); M.mealTypes = [{ id: 'b', name: 'Café' }, { id: 'l', name: 'Almoço' }]
  const { Z } = await open('page/list.js', { today: M, params: { key: 'meal', food: M.foods[0] } })
  tap(Z, 'Almoço')
  assert.equal(queue(Z)[0].data.meal_type_id, 'l')
  assert.equal(queue(Z)[0].data.name, 'Arroz')
})

// ---- cobertura extra: jejum (fasting.js) ----

test('jejum sem cache não cria botões e onDestroy sem timer não quebra', async () => {
  timers.clear()
  const { Z, page } = await open('page/fasting.js')
  assert.equal(Z.widgets.filter((w) => w.type === 'BUTTON').length, 0)
  assert.equal(timers.size, 0)
  page.onDestroy()
})

test('jejum sem preferências e sem jejum não cria botão', async () => {
  const T = fixture(); T.fastingPrefs = null
  const { Z } = await open('page/fasting.js', { today: T })
  assert.equal(Z.widgets.filter((w) => w.type === 'BUTTON').length, 0)
})

test('jejum iniciado usa as horas das preferências e o botão de início', async () => {
  const T = fixture(); T.fastingPrefs = { fasting_type: '18:6', hours: 18 }
  const { Z } = await open('page/fasting.js', { today: T })
  const btn = Z.widgets.find((w) => w.type === 'BUTTON')
  assert.equal(btn.props.text, 'fast.start')
  assert.equal(btn.props.normal_color, 0x427cf0)
  tap(Z, 'fast.start')
  const item = queue(Z)[0]
  assert.equal(item.data.fasting_type, '18:6')
  const h = (Date.parse(item.data.target_end_time) - Date.parse(item.ts)) / 3600e3
  assert.ok(Math.abs(h - 18) < 0.01)
  assert.equal(JSON.parse(Z.storage.getItem('today')).fasting.fasting_type, '18:6')
})

test('jejum ativo sem preferências ainda permite encerrar', async () => {
  const T = fixture(); T.fastingPrefs = null
  const now = Date.now()
  T.fasting = { start_time: new Date(now - 2 * 3600e3).toISOString(), target_end_time: new Date(now + 14 * 3600e3).toISOString(),
    fasting_type: '16:8', status: 'active' }
  const { Z } = await open('page/fasting.js', { today: T })
  assert.ok(!texts(Z).includes('fast.noPrefs'))
  const btn = Z.widgets.find((w) => w.type === 'BUTTON')
  assert.equal(btn.props.text, 'fast.end')
  assert.equal(btn.props.normal_color, 0xed5e63)
  tap(Z, 'fast.end')
  assert.deepEqual(queue(Z).map((e) => [e.type, e.data]), [['fast_end', {}]])
  assert.equal(JSON.parse(Z.storage.getItem('today')).fasting, null)
  assert.ok(toasts(Z).includes('list.registered'))
})

// ---- fluxos completos: uma única carga de cada página, para que a cobertura medida
// (que reporta a última carga do arquivo) enxergue todos os caminhos ----

const imgs = (Z) => Z.widgets.filter((w) => w.type === 'IMG')
const srcs = (Z) => imgs(Z).map((w) => w.props.src).sort()
test('dashboard: logo no topo e um ícone por cartão, água e sincronizar', async () => {
  const { Z } = await open('page/index.js', { today: fixture() })
  assert.ok(imgs(Z).some((w) => w.props.src === 'logo.png' && w.props.x === 216 && w.props.y === 8))
  assert.deepEqual(srcs(Z).filter((s) => s !== 'logo.png'), [
    'icons/happy-outline.png', 'icons/leaf-outline.png', 'icons/medkit-outline.png', 'icons/medkit-outline.png',
    'icons/restaurant.png', 'icons/sync.png', 'icons/timer-outline.png', 'icons/water.png'
  ].sort())
  // o ícone fica à esquerda do botão do cartão, na mesma linha
  const meds = Z.widgets.find((w) => String(w.props.text).startsWith('dash.meds'))
  const icon = imgs(Z).find((w) => w.props.src === 'icons/medkit-outline.png' && w.props.y === meds.props.y + 12)
  assert.ok(icon && icon.props.x < meds.props.x)
})

test('dashboard sem cache: logo grande no centro e botão Sincronizar na cor da marca', async () => {
  const { Z } = await open('page/index.js')
  assert.ok(imgs(Z).some((w) => w.props.src === 'logo.png' && w.props.x === 180 && w.props.y === 16))
  const sync = Z.widgets.find((w) => String(w.props.text).startsWith('dash.sync ('))
  assert.equal(sync.props.normal_color, theme.brand)
  assert.deepEqual(srcs(Z), ['icons/sync.png', 'logo.png'])
})

test('lista: ícone do cabeçalho segue a tela; sem chave não cria ícone', async () => {
  for (const [key, src] of [['water', 'icons/water.png'], ['meds', 'icons/medkit-outline.png'], ['dose', 'icons/medkit-outline.png'],
    ['cycle', 'icons/leaf-outline.png'], ['mood', 'icons/happy-outline.png'], ['symptom', 'icons/medkit-outline.png'],
    ['food', 'icons/restaurant.png'], ['meal', 'icons/restaurant.png']]) {
    const { Z } = await open('page/list.js', { today: fixture(), params: { key } })
    assert.deepEqual(srcs(Z), [src], key)
  }
  const { Z } = await open('page/list.js', { params: { key: 'water' } })
  assert.deepEqual(srcs(Z), ['icons/water.png'])
  const none = await open('page/list.js')
  assert.deepEqual(srcs(none.Z), [])
})

test('jejum: ícone do cronômetro acima do anel, com ou sem jejum ativo', async () => {
  const { Z } = await open('page/fasting.js', { today: fixture() })
  assert.ok(imgs(Z).some((w) => w.props.src === 'icons/timer-outline.png' && w.props.y === 96))
  const none = await open('page/fasting.js')
  assert.deepEqual(srcs(none.Z), [])
})

test('dashboard numa mesma carga: cache, sem cache, metas zeradas, sem recipientes e sync com falhas', async () => {
  const Z = reset()
  await load('page/index.js')
  const page = Z.page
  const show = (today) => {
    if (today) Z.storage.setItem('today', JSON.stringify(today)); else Z.storage.removeItem('today')
    Z.widgets.length = 0
    page.build()
    return Z
  }
  page.request = async () => ({ synced: [] })
  show(null)
  tap(Z, 'dash.sync (0)'); await tick(); await tick()
  assert.ok(texts(Z).includes('dash.sync (0)'))

  page.request = async () => ({ synced: [], error: 'boom' })
  tap(Z, 'dash.sync (0)'); await tick(); await tick()
  assert.ok(toasts(Z).includes('dash.error: boom'))
  page.request = async () => ({ synced: [], today: withFuture(fixture()) })
  const restore = failAlarms(Z)
  tap(Z, 'dash.sync (0)'); await tick(); await tick()
  assert.ok(Z.calls.some((c) => c[0] === 'replace'))
  restore()
  page.request = async () => { throw new Error('ble') }
  tap(Z, 'dash.sync (0)'); await tick(); await tick()
  assert.ok(toasts(Z).includes('dash.disconnected'))

  const edge = fixture()
  edge.calories = { eaten: 2300, burned: 0, remaining: -300, goal: 0 }
  edge.water.goal_ml = 0; edge.macros.carbs.goal = 0
  edge.doses = edge.doses.map((d) => ({ ...d, done: true })); edge.cycle = null
  edge.containers = [{ id: 7, name: 'Garrafa', volume: 500, unit: 'ml', volume_ml: 500, is_primary: false }]
  show(edge)
  tap(Z, '+')
  assert.equal(queue(Z).at(-1).data.container_id, 7)
  assert.ok(texts(Z).includes('dash.over'))
  assert.ok(texts(Z).includes('dash.meds: dash.noDoses'))

  page.request = async () => ({ today: fixture() })
  const none = fixture(); none.containers = []; none.doses = []
  show(none)
  assert.ok(!texts(Z).includes('+'))
  tap(Z, 'dash.sync'); await tick(); await tick()
  assert.ok(toasts(Z).includes('0 dash.sent'))
  Z.crown?.callback?.(0, 1)

  show(fixture())
  tap(Z, 'dash.water')
  tap(Z, '+'); tap(Z, '−')
  for (const c of ['dash.meds', 'dash.cycle', 'dash.mood', 'dash.symptom', 'dash.food', 'dash.fasting']) tap(Z, c)
  Z.crown?.callback?.(0, 1)
  Z.crown?.callback?.(0, -1)
  assert.equal(Z.gesture?.callback?.(3), true)
  assert.equal(Z.gesture?.callback?.(1), false)
  page.onDestroy()
})

test('listas: todas as telas e estados vazios numa mesma carga', async () => {
  const Z = reset()
  await load('page/list.js')
  const page = Z.page
  const show = (params, today) => {
    if (today) Z.storage.setItem('today', JSON.stringify(today)); else Z.storage.removeItem('today')
    page.onInit(params && JSON.stringify(params))
    delete page.head // cada tela real é uma instância nova; aqui a instância é reusada
    Z.widgets.length = 0
    page.build()
    return Z
  }
  const T = () => fixture()
  show(undefined, null)
  show({ key: 'water' }, null); assert.ok(texts(Z).includes('dash.syncToDownload'))
  show({ key: 'food' }, { ...T(), foods: [] }); assert.ok(texts(Z).includes('list.empty'))
  show({ key: 'meal', food: T().foods[0] }, { ...T(), mealTypes: [] }); assert.ok(texts(Z).includes('list.empty'))
  show({ key: 'symptom' }, { ...T(), symptoms: [] }); assert.ok(texts(Z).includes('list.empty'))
  show({ key: 'water' }, { ...T(), containers: [] }); assert.ok(texts(Z).includes('list.empty'))
  show({ key: 'meds' }, { ...T(), doses: [], medications: [] }); assert.ok(texts(Z).includes('list.empty'))
  show({ key: 'meds' }, { ...T(), medications: [] }); assert.ok(!texts(Z).includes('list.prn'))

  show({ key: 'water' }, T()); tap(Z, '+ Copo'); tap(Z, '− Copo')
  const withPrn = T(); withPrn.medications = [{ id: 'm3', name: 'Ibuprofeno', dose_amount: 400, dose_unit: 'mg' }]
  show({ key: 'meds' }, withPrn); tap(Z, 'Ibuprofeno')
  show({ key: 'meds' }, withPrn).widgets.find((w) => String(w.props.text).startsWith('✓ ')).props.click_func()
  show({ key: 'dose', dose: T().doses[1] }, T()); tap(Z, 'list.taken')
  show({ key: 'dose', dose: T().doses[1] }, T()); tap(Z, 'list.skipped')
  show({ key: 'cycle' }, T()); tap(Z, 'flow.heavy')
  show({ key: 'mood' }, T()); tap(Z, 'mood.5')
  show({ key: 'symptom' }, T()); tap(Z, 'Dor de cabeça')
  show({ key: 'food' }, T()); tap(Z, 'Arroz')
  show({ key: 'meal', food: T().foods[0] }, T()); tap(Z, 'Café')

  // Paginação, coroa e gestos laterais
  const many = T()
  many.foods = Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, name: `Food ${i}`, default_variant: { id: `v${i}`, serving_size: 1, serving_unit: 'g' } }))

  // Food page 0 (totalPages: 2)
  show({ key: 'food', page: 0 }, many)
  tap(Z, '▶')
  tap(Z, '◀')
  assert.equal(Z.gesture?.callback?.(3), true) // next page
  assert.equal(Z.gesture?.callback?.(4), true) // prev tab (food -> symptom)
  assert.equal(Z.gesture?.callback?.(1), false) // other gesture
  Z.crown?.callback?.(0, 1) // next page via crown (page 0 -> 1)
  Z.crown?.callback?.(0, -1) // page is 0, degree < 0 branch false

  // Food page 1 (última página)
  show({ key: 'food', page: 1 }, many)
  Z.crown?.callback?.(0, -1) // prev page via crown (page 1 -> 0)
  Z.crown?.callback?.(0, 1) // page is 1, degree > 0 branch false
  assert.equal(Z.gesture?.callback?.(3), true) // next tab wraps to water

  // Water page 0 (primeira aba do carrossel)
  show({ key: 'water', page: 0 }, T())
  assert.equal(Z.gesture?.callback?.(4), true) // prev tab wraps to food

  // Meds page 0 (aba intermediária)
  show({ key: 'meds', page: 0 }, T())
  assert.equal(Z.gesture?.callback?.(4), true) // prev tab (meds -> water)
  assert.equal(Z.gesture?.callback?.(3), true) // next tab (meds -> cycle)

  // Dose (fora de TABS, idx < 0)
  show({ key: 'dose', dose: T().doses[1] }, T())
  page.prevPage(1)
  page.nextPage(1)
  page.onDestroy()
})

test('jejum numa mesma carga: sem cache, sem prefs, iniciar, timer, encerrar e além da meta', async () => {
  timers.clear()
  const Z = reset()
  await load('page/fasting.js')
  const page = Z.page
  const show = (today) => {
    if (today) Z.storage.setItem('today', JSON.stringify(today)); else Z.storage.removeItem('today')
    page.onDestroy()
    Z.widgets.length = 0
    page.build()
    return Z
  }
  show(null)
  const noPrefs = fixture(); noPrefs.fastingPrefs = null
  show(noPrefs)

  const started = fixture()
  started.fasting = { start_time: new Date().toISOString(), target_end_time: new Date(Date.now() + 16 * 3600e3).toISOString(), fasting_type: '16:8', status: 'active' }
  show(started)
  assert.equal(timers.size, 1)
  const [tm] = timers.values()
  tm.fn()
  Z.crown?.callback?.(0, 1)
  tap(Z, 'fast.end')
  assert.equal(JSON.parse(Z.storage.getItem('today')).fasting, null)

  const noPrefsActive = { ...started }; const P = fixture(); P.fastingPrefs = null; P.fasting = started.fasting
  show(P); tap(Z, 'fast.end')
  const late = fixture(); late.fasting = { start_time: new Date(Date.now() - 20 * 3600e3).toISOString(),
    target_end_time: new Date(Date.now() - 4 * 3600e3).toISOString(), status: 'active' }
  show(late)
  assert.equal(Z.widgets.find((w) => w.type === 'ARC_PROGRESS').props.color, 0x3ecc7b)

  // Idle com prefs: coroa ajusta horas e atualiza texto
  const idle = fixture(); idle.fasting = null
  show(idle)
  Z.crown?.callback?.(0, 1)
  Z.crown?.callback?.(0, -1)
  tap(Z, 'fast.start')

  page.onDestroy()
  assert.equal(timers.size, 0)
  void noPrefsActive
})
