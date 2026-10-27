import { load, loadToday, push, remove } from './queue'

const read = (fn) => {
  try {
    return fn()
  } catch (e) {
    return undefined
  }
}

export function collectHealth(now = new Date()) {
  if ((loadToday()?.sensorMode ?? 'health-connect') !== 'direct') {
    remove(load().filter((e) => e.type === 'health').map((e) => e.id))
    return
  }
  if (typeof hmSensor === 'undefined') return

  const readings = [
    [
      'steps',
      () => {
        const s = hmSensor.createSensor(hmSensor.id.STEP)
        return { value: s ? s.current : 0 }
      }
    ],
    [
      'active_calories',
      () => {
        const c = hmSensor.createSensor(hmSensor.id.CALORIE)
        return { value: c ? c.current : 0 }
      }
    ],
    [
      'resting_heart_rate',
      () => {
        const h = hmSensor.createSensor(hmSensor.id.HEART)
        return { value: h ? (h.last || h.current) : 0 }
      }
    ]
  ]

  for (const [type, get] of readings) {
    const r = read(get)
    if (!r || !(r.value > 0)) continue
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    remove(load().filter((e) => e.type === 'health' && e.date === date && e.data.type === type).map((e) => e.id))
    push('health', { type, ...r }, now)
  }
}
