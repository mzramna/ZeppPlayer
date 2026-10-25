import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load, reset as resetBase } from './helpers.mjs'

const queue = () => JSON.parse(globalThis.__zos.storage.getItem('queue', '[]'))
// Os testes de coleta rodam no modo direto; o padrão (Health Connect) tem testes próprios no fim.
const reset = (o) => { const Z = resetBase(o); Z.storage.setItem('today', JSON.stringify({ sensorMode: 'direct' })); return Z }
const now = new Date(2026, 9, 24, 10, 0)
const all = {
  Step: { getCurrent: () => 4200 }, Calorie: { getCurrent: () => 310 }, HeartRate: { getResting: () => 58 },
  Sleep: { updateInfo() {}, getInfo: () => ({ totalTime: 420, deepTime: 90, score: 80, startTime: 23 * 60, endTime: 6 * 60 + 30 }) }
}

test('enfileira os 4 tipos de saúde', async () => {
  reset({ sensors: all })
  const { collectHealth } = await load('utils/sensors.js')
  collectHealth(now)
  const q = queue()
  assert.deepEqual(q.map((e) => e.data.type), ['steps', 'active_calories', 'resting_heart_rate', 'SleepSession'])
  assert.equal(q[0].data.value, 4200)
  const s = q[3].data
  assert.equal(s.duration_in_seconds, 25200)
  assert.equal(s.deep_sleep_seconds, 5400)
  assert.equal(new Date(s.bedtime).getDate(), 23) // antes da meia-noite = dia anterior
  assert.equal(new Date(s.wake_time).getHours(), 6)
})

test('segunda coleta substitui o pendente em vez de duplicar', async () => {
  reset({ sensors: all })
  const { collectHealth } = await load('utils/sensors.js')
  collectHealth(now)
  all.Step.getCurrent = () => 5000
  collectHealth(new Date(2026, 9, 24, 12, 0))
  all.Step.getCurrent = () => 4200
  const q = queue().filter((e) => e.data.type === 'steps')
  assert.equal(q.length, 1)
  assert.equal(q[0].data.value, 5000)
  assert.equal(queue().length, 4)
})

test('outro dia não substitui; sensor indisponível ou zerado é ignorado', async () => {
  reset({ sensors: { Step: { getCurrent: () => 1 }, HeartRate: { getResting: () => 0 } } })
  const { collectHealth } = await load('utils/sensors.js')
  collectHealth(now)
  collectHealth(new Date(2026, 9, 25, 9, 0))
  assert.deepEqual(queue().map((e) => e.date), ['2026-10-24', '2026-10-25'])
  assert.equal(queue().every((e) => e.data.type === 'steps'), true)
})

test('sono depois da meia-noite fica no mesmo dia; sono sem duração é ignorado', async () => {
  reset({ sensors: { Sleep: { updateInfo() {}, getInfo: () => ({ totalTime: 300, deepTime: 0, score: 0, startTime: 60, endTime: 360 }) } } })
  const { collectHealth } = await load('utils/sensors.js')
  collectHealth(now)
  assert.equal(new Date(queue()[0].data.bedtime).getDate(), 24)
  reset({ sensors: { Sleep: { updateInfo() {}, getInfo: () => ({ totalTime: 0 }) } } })
  ;(await load('utils/sensors.js')).collectHealth(now)
  assert.equal(queue().length, 0)
})

test('sensor que lança exceção na leitura é ignorado sem derrubar os outros', async () => {
  reset({ sensors: {
    Step: { getCurrent() { throw new Error('sem leitura') } },
    Calorie: { getCurrent: () => 0 },
    HeartRate: { getResting: () => 61 },
    Sleep: { updateInfo() { throw new Error('falhou') }, getInfo: () => ({}) }
  } })
  const { collectHealth } = await load('utils/sensors.js')
  collectHealth(now)
  assert.deepEqual(queue().map((e) => e.data.type), ['resting_heart_rate'])
  assert.equal(queue()[0].data.value, 61)
})

test('coleta sem argumento usa a data atual', async () => {
  reset({ sensors: { Step: { getCurrent: () => 10 } } })
  const { collectHealth } = await load('utils/sensors.js')
  collectHealth()
  const [item] = queue()
  assert.equal(item.data.value, 10)
  assert.equal(item.date, new Date().toLocaleDateString('sv-SE'))
})

test('pendente de outro tipo no mesmo dia não é removido pela nova coleta', async () => {
  reset({ sensors: { Step: { getCurrent: () => 100 }, HeartRate: { getResting: () => 60 } } })
  const { collectHealth } = await load('utils/sensors.js')
  collectHealth(now)
  collectHealth(now)
  assert.deepEqual(queue().map((e) => e.data.type).sort(), ['resting_heart_rate', 'steps'])
})

test('sono que começa e termina no mesmo dia mantém a data de hoje para bedtime', async () => {
  reset({ sensors: { Sleep: { updateInfo() {}, getInfo: () => ({ totalTime: 60, deepTime: 10, score: 50, startTime: 22 * 60, endTime: 23 * 60 }) } } })
  const { collectHealth } = await load('utils/sensors.js')
  collectHealth(now)
  const s = queue()[0].data
  assert.equal(new Date(s.bedtime).getDate(), 24)
  assert.equal(new Date(s.wake_time).getHours(), 23)
  assert.equal(s.sleep_score, 50)
})

test('padrão Health Connect (sem cache): não enfileira nada', async () => {
  resetBase({ sensors: all })
  const { collectHealth } = await load('utils/sensors.js')
  collectHealth(now)
  assert.equal(queue().length, 0)
})

test('health-connect: não enfileira e tira os health pendentes, mantendo os demais tipos', async () => {
  const Z = resetBase({ sensors: all })
  Z.storage.setItem('today', JSON.stringify({ calories: {} })) // cache antigo, sem sensorMode = padrão
  Z.storage.setItem('queue', JSON.stringify([
    { id: 'h1', type: 'health', data: { type: 'steps', value: 1 }, date: '2026-10-24' },
    { id: 'w1', type: 'water', data: { container_id: 3, change: 1 }, date: '2026-10-24' }
  ]))
  const { collectHealth } = await load('utils/sensors.js')
  collectHealth(now)
  assert.deepEqual(queue().map((e) => e.id), ['w1'])
})
