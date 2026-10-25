import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers.mjs'

const { dueDoses } = await load('app-side/doses.js')

const NOW = new Date(2026, 9, 24, 10, 0) // sábado
const med = (schedules, extra = {}) => ({ id: 'm', name: 'Med', dose_amount: 5, dose_unit: 'mg', is_active: true, schedules, ...extra })
const sch = (o) => ({ id: 's', schedule_type_id: 'daily', time_of_day: '08:00:00', ...o })
const days = (meds, e = []) => dueDoses(meds, e, NOW)

test('daily gera hoje e amanhã ordenados, sem hora por último, com label e dose', () => {
  const r = days([med([sch({ id: 'a', time_of_day: null }), sch({ id: 'b', time_of_day: '09:30:00', dose_amount: 2 }), sch({ id: 'c' })])])
  assert.deepEqual(r.map((d) => d.schedule_id), ['c', 'b', 'a', 'c', 'b', 'a'])
  assert.equal(r[1].label, 'Med 09:30')
  assert.deepEqual([r[1].dose_amount, r[0].dose_amount, r[1].dose_unit], [2, 5, 'mg'])
  assert.equal(new Date(r[0].scheduled_for).getHours(), 8)
  assert.equal(r[2].label, 'Med')
})

test('weekly: sábado (6) hoje, domingo (0) amanhã', () => {
  assert.equal(days([med([sch({ schedule_type_id: 'weekly', days_of_week: [0] })])]).length, 1)
  assert.equal(days([med([sch({ schedule_type_id: 'specific_days', days_of_week: [6] })])]).length, 1)
  assert.equal(days([med([sch({ schedule_type_id: 'weekly', days_of_week: [] })])]).length, 0)
  assert.equal(days([med([sch({ schedule_type_id: 'weekly' })])]).length, 0)
})

test('every_n_days ancora no start_date', () => {
  const n = (start, interval) => days([med([sch({ schedule_type_id: 'every_n_days', interval_days: interval, start_date: start })])]).length
  assert.equal(n('2026-10-22', 2), 1) // hoje (2 dias depois) sim, amanhã não
  assert.equal(n('2026-10-25', 1), 1) // só amanhã
  assert.equal(n('2026-10-24', 0), 0)
  assert.equal(n(null, 1), 2)
})

test('monthly inclui dia 31 em mês curto e dia exato', () => {
  const n = (dom) => days([med([sch({ schedule_type_id: 'monthly', day_of_month: dom })])]).length
  assert.equal(n(24), 1)
  assert.equal(n(25), 1)
  assert.equal(n(10), 0)
  assert.equal(n(null), 0)
  const apr30 = (dom) => dueDoses([med([sch({ schedule_type_id: 'monthly', day_of_month: dom })])], [], new Date(2026, 3, 30)).length
  assert.equal(apr30(31), 1) // só 30/abr (último dia do mês); 01/mai não
})

test('cyclic: 2 dias on, 2 off', () => {
  const n = (start, on = 2, off = 2) => days([med([sch({ schedule_type_id: 'cyclic', cycle_on_days: on, cycle_off_days: off, start_date: start })])]).length
  assert.equal(n('2026-10-24'), 2) // posições 0 e 1
  assert.equal(n('2026-10-23'), 1) // 1 (on) e 2 (off)
  assert.equal(n('2026-10-26'), 0) // antes do início
  assert.equal(n('2026-10-24', 0), 0)
})

test('taper conta como diário; prn, inativos, desconhecidos e datas fora do período não', () => {
  assert.equal(days([med([sch({ schedule_type_id: 'taper' })])]).length, 2)
  assert.equal(days([med([sch({ schedule_type_id: 'prn' }), sch({ schedule_type_id: 'zzz' })])]).length, 0)
  assert.equal(days([med([sch()], { is_active: false })]).length, 0)
  assert.equal(days([med([sch({ active: false })])]).length, 0)
  assert.equal(days([med([sch({ start_date: '2026-10-25' })])]).length, 1)
  assert.equal(days([med([sch({ end_date: '2026-10-24' })])]).length, 1)
  assert.equal(days([med([sch({ created_at: '2026-10-25T09:00:00' })])]).length, 1) // criado amanhã: hoje não
  assert.equal(days(null).length + days([{ id: 'x', name: 'x' }]).length, 0)
})

test('done vem de taken/skipped do mesmo schedule no dia; snoozed e prn não contam', () => {
  const m = [med([sch({ id: 's1' }), sch({ id: 's2', time_of_day: '20:00:00' })])]
  const e = (o) => ({ medication_id: 'm', entry_date: '2026-10-24', status: 'taken', ...o })
  assert.deepEqual(days(m, [e({ schedule_id: 's1' })]).map((d) => d.done), [true, false, false, false])
  assert.equal(days(m, [e({ schedule_id: 's1', status: 'skipped', entry_date: '2026-10-24T00:00:00.000Z' })])[0].done, true)
  assert.equal(days(m, [e({ schedule_id: 's1', status: 'snoozed' })])[0].done, false)
  assert.equal(days(m, [e({ schedule_id: 's1', status: 'prn_taken' })])[0].done, false)
  assert.equal(days(m, [e({ schedule_id: 's1', entry_date: '2026-10-25' })])[0].done, false) // outro dia (amanhã fica done)
  assert.deepEqual(days(m, [e({})]).map((d) => d.done), [true, true, false, false]) // sem schedule_id vale p/ o remédio no dia
  assert.equal(days(m, [{ medication_id: 'm', schedule_id: 's1', status: 'taken' }])[0].done, true) // sem entry_date
})
