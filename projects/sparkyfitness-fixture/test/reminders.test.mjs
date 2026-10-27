import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reset, load } from './helpers.mjs'

const NOW = new Date(2026, 9, 24, 10, 0)
const at = (h, d = 24) => new Date(2026, 9, d, h).toISOString()
const dose = (o) => ({ medication_id: 'm', schedule_id: 's', scheduled_for: at(12), label: 'Med 12:00', dose_amount: 5, dose_unit: 'mg', done: false, ...o })

test('pickReminders: só futuras e não feitas', async () => {
  reset()
  const { pickReminders } = await load('utils/reminders.js')
  const r = pickReminders([dose({ schedule_id: 'past', scheduled_for: at(8) }), dose({ schedule_id: 'done', done: true }),
    dose({ schedule_id: 'now', scheduled_for: at(10) }), dose({ schedule_id: 'ok' }), dose({ schedule_id: 'tmrw', scheduled_for: at(8, 25) })], NOW)
  assert.deepEqual(r.map((d) => d.schedule_id), ['ok', 'tmrw'])
  assert.deepEqual(pickReminders(undefined, NOW), [])
})

test('scheduleReminders cancela os antigos, cria alarmes com param e guarda ids', async () => {
  const Z = reset()
  Z.storage.setItem('alarms', JSON.stringify([101, 102]))
  Z.alarm._map.set(101, {}); Z.alarm._map.set(102, {})
  const { scheduleReminders } = await load('utils/reminders.js')
  const d = dose()
  const ids = scheduleReminders([d, dose({ done: true })], NOW)
  assert.equal(ids.length, 1)
  assert.equal(Z.alarm._map.has(101) || Z.alarm._map.has(102), false)
  const a = Z.alarm._map.get(ids[0])
  assert.deepEqual([a.url, a.store, a.time], ['app-service/med_reminder', true, Math.floor(new Date(d.scheduled_for).getTime() / 1000)])
  assert.deepEqual(JSON.parse(a.param), d)
  assert.deepEqual(JSON.parse(Z.storage.getItem('alarms')), ids)
})

test('storage corrompido e alarme que falha (id 0) são tolerados', async () => {
  const Z = reset()
  Z.storage.setItem('alarms', '{ruim')
  Z.alarm.set = () => 0
  const { scheduleReminders } = await load('utils/reminders.js')
  assert.deepEqual(scheduleReminders([dose()], NOW), [])
  assert.equal(Z.storage.getItem('alarms'), '[]')
})

test('serviço: disparo notifica com ações; ação enfileira taken/skipped', async () => {
  const Z = reset()
  await load('app-service/med_reminder.js')
  const d = dose()
  Z.service.onInit(JSON.stringify(d))
  const n = Z.notified[0]
  assert.deepEqual([n.title, n.content, n.actions.map((a) => a.text)], ['Med 12:00', '5 mg', ['taken', 'skip']])
  assert.equal(Z.calls.at(-1)[0], 'exit')
  for (const [i, status] of [[0, 'taken'], [1, 'skipped']]) {
    Z.service.onInit(n.actions[i].param)
    const q = JSON.parse(Z.storage.getItem('queue'))
    assert.deepEqual(q.at(-1).data, { medication_id: 'm', schedule_id: 's', scheduled_for: d.scheduled_for, status, dose_amount: 5, dose_unit: 'mg' })
    assert.equal(q.at(-1).type, 'meds')
  }
})

test('serviço: param inválido não quebra e sai', async () => {
  const Z = reset()
  await load('app-service/med_reminder.js')
  Z.service.onInit('{x')
  Z.service.onInit(JSON.stringify({ label: 'Sem dose' })) // sem dose_amount: content amigável
  assert.equal(Z.notified[0].content, 'list.dose')
  assert.equal(Z.calls.filter((c) => c[0] === 'exit').length, 2)
})

// Mesmo motivo do teste de cobertura em api.test.mjs: o relatório lê só a última instância carregada.
test('cobertura: reminders percorre os ramos numa instância', async () => {
  const Z = reset()
  const { pickReminders, scheduleReminders } = await load('utils/reminders.js')
  assert.deepEqual(pickReminders(undefined), []) // now padrão
  Z.storage._map.clear()
  assert.equal(scheduleReminders([dose()], NOW).length, 1) // sem cache salvo: getItem devolve o padrão vazio
  Z.storage.setItem('alarms', 'null')
  const futureDose = dose({ scheduled_for: new Date(Date.now() + 3600000).toISOString() })
  assert.equal(scheduleReminders([futureDose]).length, 1) // cache 'null' vira [] e testa now padrão futuro
  Z.alarm.set = () => 0
  assert.deepEqual(scheduleReminders([dose({ schedule_id: 'x' })], NOW), [])
})

test('cobertura: med_reminder percorre os ramos numa instância', async () => {
  const Z = reset()
  await load('app-service/med_reminder.js')
  const d = dose()
  Z.storage.setItem('today', JSON.stringify({ doses: [d] }))
  Z.service.onInit(JSON.stringify(d))
  Z.service.onInit(Z.notified[0].actions[0].param) // Tomei atualiza done no cache
  assert.equal(JSON.parse(Z.storage.getItem('today')).doses[0].done, true)
  Z.service.onInit(Z.notified[0].actions[1].param) // Pular
  Z.service.onInit('{x')
  Z.service.onInit(JSON.stringify({ dose_unit: 'mg' })) // sem label, com unidade
  Z.service.onInit(JSON.stringify({})) // sem dose nem label: fallback para títulos padrão
  assert.equal(Z.storage.getItem('queue').length > 0, true)
  assert.equal(Z.calls.filter((c) => c[0] === 'exit').length, 6)
})
