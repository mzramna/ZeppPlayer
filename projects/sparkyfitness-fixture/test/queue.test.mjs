import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load, reset } from './helpers.mjs'

const Z = () => globalThis.__zos
const queue = () => JSON.parse(Z().storage.getItem('queue', '[]'))
const fixed = new Date(2026, 0, 5, 9, 5) // 2026-01-05 09:05 local, valores de um dígito para testar padding

test('push monta id, ts, date e time a partir da data fixa', async () => {
  reset()
  const q = await load('utils/queue.js')
  const n = q.push('mood', { mood_value: 3 }, fixed)
  assert.equal(n, 1)
  const [item] = queue()
  assert.match(item.id, new RegExp(`^${fixed.getTime()}-0-`))
  assert.deepEqual({ ...item, id: 0 }, {
    id: 0, type: 'mood', data: { mood_value: 3 },
    ts: fixed.toISOString(), date: '2026-01-05', time: '09:05'
  })
})

test('push incrementa o id pelo tamanho da fila e devolve o tamanho', async () => {
  reset()
  const q = await load('utils/queue.js')
  q.push('mood', { mood_value: 1 }, fixed)
  assert.equal(q.push('mood', { mood_value: 2 }, fixed), 2)
  const [a, b] = queue().map((e) => e.id)
  assert.match(a, new RegExp(`^${fixed.getTime()}-0-`))
  assert.match(b, new RegExp(`^${fixed.getTime()}-1-`))
  assert.notEqual(a, b)
})

test('push usa a data atual quando nenhuma é passada', async () => {
  reset()
  const q = await load('utils/queue.js')
  const before = Date.now()
  q.push('fast_end', {})
  const [item] = queue()
  assert.ok(new Date(item.ts).getTime() >= before)
  assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/)
  assert.match(item.time, /^\d{2}:\d{2}$/)
})

test('remove tira só os ids informados e deixa o resto', async () => {
  reset()
  const q = await load('utils/queue.js')
  q.push('mood', { mood_value: 1 }, fixed)
  q.push('mood', { mood_value: 2 }, fixed)
  q.push('mood', { mood_value: 3 }, fixed)
  q.remove([queue()[1].id, 'nao-existe'])
  assert.deepEqual(queue().map((e) => e.data.mood_value), [1, 3])
})

test('load devolve [] com JSON corrompido ou fila ausente', async () => {
  reset()
  const q = await load('utils/queue.js')
  assert.deepEqual(q.load(), [])
  Z().storage.setItem('queue', '{nao é json')
  assert.deepEqual(q.load(), [])
  Z().storage.setItem('queue', 'null')
  assert.deepEqual(q.load(), [])
})

test('loadToday devolve null sem cache ou com JSON corrompido', async () => {
  reset()
  const q = await load('utils/queue.js')
  assert.equal(q.loadToday(), null)
  Z().storage.setItem('today', '{quebrado')
  assert.equal(q.loadToday(), null)
})

test('saveToday e loadToday fazem round trip', async () => {
  reset()
  const q = await load('utils/queue.js')
  const t = { date: '2026-01-05', water: { ml: 500, goal_ml: 2000 } }
  q.saveToday(t)
  assert.deepEqual(q.loadToday(), t)
})

test('addWater soma no cache e enfileira o item no formato do contrato', async () => {
  reset()
  const q = await load('utils/queue.js')
  q.saveToday({ date: '2026-01-05', water: { ml: 200, goal_ml: 2000 } })
  const n = q.addWater({ id: 7, volume_ml: 250 }, 1)
  assert.equal(q.loadToday().water.ml, 450)
  assert.equal(n, 1)
  const [item] = queue()
  assert.equal(item.type, 'water')
  assert.deepEqual(item.data, { container_id: 7, change: 1 })
  assert.match(item.id, /^\d+-0-/)
  assert.equal(item.date, localDate(item.ts))
  assert.match(item.time, /^\d{2}:\d{2}$/)
})

test('addWater com change negativo nunca deixa o cache abaixo de zero', async () => {
  reset()
  const q = await load('utils/queue.js')
  q.saveToday({ water: { ml: 100, goal_ml: 2000 } })
  q.addWater({ id: 1, volume_ml: 250 }, -1)
  assert.equal(q.loadToday().water.ml, 0)
  assert.equal(queue()[0].data.change, -1)
})

test('addWater sem cache (ou sem water) só enfileira e devolve o tamanho da fila', async () => {
  reset()
  const q = await load('utils/queue.js')
  assert.equal(q.addWater({ id: 1, volume_ml: 250 }, 1), 1)
  assert.equal(q.loadToday(), null)
  q.saveToday({ date: '2026-01-05' })
  assert.equal(q.addWater({ id: 1, volume_ml: 250 }, 1), 2)
  assert.equal(q.loadToday().water, undefined)
  assert.equal(queue().length, 2)
})

test('addWater com container sem volume_ml usa volume e trata water.ml nulo sem NaN', async () => {
  reset()
  const q = await load('utils/queue.js')
  q.saveToday({ water: { ml: null, goal_ml: 2000 } })
  const n = q.addWater({ id: 9, volume: 300 }, 1)
  assert.equal(q.loadToday().water.ml, 300)
  assert.equal(n, 1)
  const [item] = queue()
  assert.deepEqual(item.data, { container_id: 9, change: 1 })
})

// Data local YYYY-MM-DD derivada do próprio ts ISO, para checar o campo date contra o relógio local.
function localDate(iso) {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
