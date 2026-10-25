import { readFileSync, writeFileSync } from '../shared/fs'

const pad = (n) => String(n).padStart(2, '0')

const read = (k, d) => {
  try {
    if (typeof hmFS === 'undefined') return d
    const raw = readFileSync(k + '.json')
    if (raw === undefined || raw === null || raw === '') return d
    return JSON.parse(raw) ?? d
  } catch (e) {
    return d
  }
}

const write = (k, v) => {
  try {
    if (typeof hmFS !== 'undefined') {
      writeFileSync(k + '.json', JSON.stringify(v))
    }
  } catch (e) {}
}

export const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const load = () => read('queue', [])
export const loadToday = () => read('today', null)
export const saveToday = (t) => write('today', t)

export function push(type, data, d = new Date()) {
  const q = load()
  q.push({
    id: `${d.getTime()}-${q.length}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    data,
    ts: d.toISOString(),
    date: localDate(d),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  write('queue', q)
  return q.length
}

export function remove(ids) {
  write('queue', load().filter((e) => !ids.includes(e.id)))
}

export function addWater(container, change) {
  const t = loadToday()
  if (t && t.water) {
    const ml = Number(container.volume_ml ?? container.volume) || 0
    t.water.ml = Math.max(0, (Number(t.water.ml) || 0) + change * ml)
    saveToday(t)
  }
  return push('water', { container_id: container.id, change })
}
