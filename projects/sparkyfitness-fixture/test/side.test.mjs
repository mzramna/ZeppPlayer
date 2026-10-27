import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reset, load } from './helpers.mjs'
import { routes } from './fixtures/full-routes.mjs'
import { sweepApi } from './fixtures/api-sweep.mjs'

const S = { server: 'https://sf.test', apiKey: 'K' }
const e = (id, type, data) => ({ id, type, data, ts: '2026-10-24T12:00:00.000Z', date: '2026-10-24', time: '09:00' })
const run = async (Z, method, params) => {
  await load('app-side/index.js')
  let out
  await Z.side.onRequest({ method, params }, (err, r) => { out = r })
  return out
}
// fetchToday usa a data real do aparelho: mapeia as rotas datadas para hoje.
const today = () => new Date().toLocaleDateString('sv')
const withToday = () => Object.fromEntries(Object.entries(routes()).map(([k, v]) =>
  [k.replace(/2026-10-24/g, today()).replace('toDate=2026-10-25', `toDate=${new Date(Date.now() + 864e5).toLocaleDateString('sv')}`), v]))

test('sync ok: envia na ordem e devolve synced + today', async () => {
  const Z = reset({ settings: S, routes: { ...withToday(), '/api/mood': {}, '/api/v2/measurements/water-intake': {} } })
  const r = await run(Z, 'sync', { entries: [e('1', 'mood', { mood_value: 3 }), e('2', 'water', { container_id: 3, change: 1 })] })
  assert.deepEqual(r.synced, ['1', '2'])
  assert.equal(r.error, undefined)
  assert.equal(r.today.water.ml, 750)
  assert.deepEqual(Z.fetched.slice(0, 2).map((f) => f.url), ['https://sf.test/api/mood', 'https://sf.test/api/v2/measurements/water-intake'])
})

test('falha no meio: para no primeiro erro, sem ler o resto', async () => {
  const Z = reset({ settings: S, routes: { '/api/mood': {}, '/api/v2/measurements/water-intake': { status: 500, body: '' } } })
  const r = await run(Z, 'sync', { entries: [e('1', 'mood', { mood_value: 3 }), e('2', 'water', { container_id: 3, change: 1 }), e('3', 'mood', { mood_value: 1 })] })
  assert.deepEqual(r.synced, ['1'])
  assert.match(r.error, /HTTP 500/)
  assert.equal(r.today, undefined)
  assert.equal(Z.fetched.length, 2)
})

test('sem entradas só atualiza o dia; falha na leitura mantém synced', async () => {
  let Z = reset({ settings: S, routes: withToday() })
  let r = await run(Z, 'sync', {})
  assert.deepEqual(r.synced, [])
  assert.ok(r.today)
  Z = reset({ settings: S, routes: { '/api/mood': {} } })
  r = await run(Z, 'sync', { entries: [e('1', 'mood', { mood_value: 3 })] })
  assert.deepEqual(r.synced, ['1'])
  assert.match(r.error, /HTTP 404/)
})

test('método inválido e credencial ausente', async () => {
  let Z = reset({ settings: S })
  assert.deepEqual(await run(Z, 'outro'), { error: 'método inválido' })
  Z = reset({ settings: {} })
  const r = await run(Z, 'sync', { entries: [e('1', 'mood', { mood_value: 3 })] })
  assert.deepEqual(r.synced, [])
  assert.match(r.error, /configure servidor/)
})

test('sensorMode: padrão health-connect sem valor salvo, vai no today e na resposta', async () => {
  const Z = reset({ settings: S, routes: withToday() })
  const r = await run(Z, 'sync', {})
  assert.equal(r.sensorMode, 'health-connect')
  assert.equal(r.today.sensorMode, 'health-connect')
})

test('modo health-connect: health não é enviado, mas o id entra em synced; demais tipos passam', async () => {
  const Z = reset({ settings: S, routes: { ...withToday(), '/api/mood': {}, '/api/v2/measurements/water-intake': {} } })
  const r = await run(Z, 'sync', { entries: [e('1', 'mood', { mood_value: 3 }), e('2', 'health', { type: 'steps', value: 4200 }),
    e('3', 'water', { container_id: 3, change: 1 }), e('4', 'health', { type: 'SleepSession', value: 420 })] })
  assert.deepEqual(r.synced, ['1', '2', '3', '4'])
  assert.equal(Z.fetched.filter((f) => f.url.includes('/api/health-data')).length, 0)
  assert.deepEqual(Z.fetched.slice(0, 2).map((f) => f.url), ['https://sf.test/api/mood', 'https://sf.test/api/v2/measurements/water-intake'])
  assert.equal(r.sensorMode, 'health-connect')
})

test('modo direct: health é enviado com source zepp e sensorMode volta direct', async () => {
  const Z = reset({ settings: { ...S, sensorMode: 'direct' }, routes: { ...withToday(), '/api/health-data': {} } })
  const r = await run(Z, 'sync', { entries: [e('1', 'health', { type: 'steps', value: 4200 })] })
  assert.deepEqual(r.synced, ['1'])
  assert.deepEqual(Z.fetched[0].body, [{ type: 'steps', value: 4200, date: '2026-10-24', source: 'zepp' }])
  assert.equal(r.sensorMode, 'direct')
  assert.equal(r.today.sensorMode, 'direct')
})

test('erro na sincronização também devolve sensorMode', async () => {
  const Z = reset({ settings: { ...S, sensorMode: 'direct' }, routes: { '/api/mood': {}, '/api/v2/measurements/water-intake': { status: 500, body: '' } } })
  const r = await run(Z, 'sync', { entries: [e('1', 'mood', { mood_value: 3 }), e('2', 'water', { container_id: 3, change: 1 })] })
  assert.deepEqual(r.synced, ['1'])
  assert.match(r.error, /HTTP 500/)
  assert.equal(r.sensorMode, 'direct')
})

// Mesmo motivo do teste de cobertura em api.test.mjs: o relatório lê só a última instância carregada.
test('cobertura: onRequest percorre os ramos numa instância', async () => {
  const settings = { ...S }
  const Z = reset({ settings, routes: { ...withToday(), '/api/mood': {}, '/api/v2/measurements/water-intake': {} } })
  await load('app-side/index.js')
  const req = async (method, params) => { let out; await Z.side.onRequest({ method, params }, (_, r) => { out = r }); return out }
  assert.deepEqual((await req('sync', undefined)).synced, []) // sem params
  assert.deepEqual((await req('sync', { entries: [e('1', 'mood', { mood_value: 3 })] })).synced, ['1'])
  Z.routes = { '/api/mood': {}, '/api/v2/measurements/water-intake': { status: 500, body: '' } }
  assert.match((await req('sync', { entries: [e('2', 'water', { container_id: 3, change: 1 })] })).error, /HTTP 500/)
  assert.deepEqual(await req('outro'), { error: 'método inválido' })
  settings.server = ''
  assert.match((await req('sync', { entries: [] })).error, /configure servidor/)
  // api.js/doses.js: a última instância carregada é a que o relatório mostra
  settings.server = 'https://sf.test'
  await sweepApi(await load('app-side/api.js'), Z, settings)
})
