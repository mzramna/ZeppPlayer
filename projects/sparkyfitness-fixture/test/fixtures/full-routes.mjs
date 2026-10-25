// Respostas "reais" de todos os endpoints lidos por fetchToday.
import { readFileSync } from 'node:fs'
const j = (n) => JSON.parse(readFileSync(new URL(`./${n}.json`, import.meta.url)))
export const routes = () => ({
  '/api/daily-summary?date=2026-10-24': j('summary'),
  '/api/water-containers': j('containers'),
  '/api/v2/medications?activeOnly=true': j('medications'),
  '/api/v2/medications/entries?fromDate=2026-10-24&toDate=2026-10-25': [
    { id: 'e1', medication_id: 'm1', schedule_id: 's1', status: 'taken', entry_date: '2026-10-24', entry_type: 'medication' }],
  '/api/v2/cycle/overview?date=2026-10-24': { settings: { id: 1 }, date: '2026-10-24', phase: 'luteal', cycleDay: 20, late: { isLate: false, daysLate: 0 } },
  // envelopado: o fake de fetch confunde `status` do corpo com o HTTP
  '/api/fasting/current': { status: 200, body: JSON.stringify({ id: 'f1', start_time: '2026-10-23T20:00:00Z', target_end_time: '2026-10-24T12:00:00Z', fasting_type: '16:8', status: 'ACTIVE' }) },
  '/api/fasting/preferences': { default_protocol: '16:8', target_fasting_hours: 16 },
  '/api/v2/symptoms/custom': [{ id: 'sy1', name: 'headache', display_name: 'Dor de cabeça', is_archived: false }, { id: 'sy2', name: 'old', display_name: null, is_archived: true }],
  '/api/favorites': { favoriteFoods: [{ id: 'f1', name: 'Arroz', default_variant: { id: 'v1', serving_size: 100, serving_unit: 'g' } }], favoriteMeals: [] },
  '/api/foods': { recentFoods: [{ id: 'f1', name: 'Arroz', default_variant: { id: 'v1', serving_size: 100, serving_unit: 'g' } },
    { id: 'f2', name: 'Sem variante' }], topFoods: [{ id: 'f3', name: 'Ovo', default_variant: { id: 'v3', serving_size: 1, serving_unit: 'un' } }] },
  '/api/meal-types': [{ id: 'b', name: 'Breakfast', is_visible: true }, { id: 'x', name: 'Oculta', is_visible: false }]
})
