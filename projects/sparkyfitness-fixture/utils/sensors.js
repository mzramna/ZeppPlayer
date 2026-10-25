// Lê os sensores do relógio e enfileira 'health' (um item pendente por data+tipo; o servidor faz upsert por dia).
import { Step, Calorie, HeartRate, Sleep } from '@zos/sensor'
import { load, loadToday, push, remove } from './queue'

// Sensor indisponível ou sem leitura vira undefined e é ignorado.
const read = (fn) => { try { return fn() } catch (e) { return undefined } }

const at = (d, min) => { const t = new Date(d); t.setHours(0, min, 0, 0); return t }

function sleepData(now) {
  const s = new Sleep()
  s.updateInfo()
  const { totalTime, deepTime, score, startTime, endTime } = s.getInfo()
  if (!(totalTime > 0)) return
  const wake = at(now, endTime)
  const bed = at(now, startTime)
  if (startTime > endTime) bed.setDate(bed.getDate() - 1) // dormiu antes da meia-noite
  return { value: totalTime, duration_in_seconds: totalTime * 60, time_asleep_in_seconds: totalTime * 60,
    deep_sleep_seconds: deepTime * 60, sleep_score: score, bedtime: bed.toISOString(), wake_time: wake.toISOString() }
}

export function collectHealth(now = new Date()) {
  // Padrão (Health Connect): não coleta; descarta o que ficou pendente de antes da troca de modo.
  if ((loadToday()?.sensorMode ?? 'health-connect') !== 'direct') {
    remove(load().filter((e) => e.type === 'health').map((e) => e.id))
    return
  }
  const readings = [
    ['steps', () => ({ value: new Step().getCurrent() })],
    ['active_calories', () => ({ value: new Calorie().getCurrent() })],
    ['resting_heart_rate', () => ({ value: new HeartRate().getResting() })],
    ['SleepSession', () => sleepData(now)]
  ]
  for (const [type, get] of readings) {
    const r = read(get)
    if (!r || !(r.value > 0)) continue
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    remove(load().filter((e) => e.type === 'health' && e.date === date && e.data.type === type).map((e) => e.id))
    push('health', { type, ...r }, now)
  }
}
