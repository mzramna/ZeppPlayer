// Pure (no @zos imports). Turns watch readings into the JSON the zepp2hass Home Assistant
// integration reads, and lists the same metrics as mobile_app sensors (SENSOR_DEFS).
//
// readings, collected on the watch. Every field is optional; null/undefined is left out:
// {
//   time: 1729760000000,                         // ms epoch of the reading -> record_time (ISO)
//   battery: { level: 80, charging: false },     // level in %
//   steps: { current, target },
//   calorie: { current, target },                // kcal
//   distance: { current },                       // m
//   fatBurning: { current, target },             // min
//   stands: { current, target },
//   heartRate: { last, resting, max },           // bpm; max = today's maximum
//   bloodOxygen: [{ spo2, time }],               // recent readings, the last one is shown
//   stress: 35,                                  // current score
//   bodyTemperature: 3650,                       // Zepp raw (x100) or Celsius, normalised here
//   sleep: { status, score, startTime, endTime, deepTime, totalTime }, // status 1 = sleeping
//   pai: { week, day, lastWeek },
//   wearing: 2,                                  // 0 off, 1 on (still), 2 on (moving)
//   device: { name, source, width, height },
//   user: { nickName, age, height, weight, gender },
// }

// Drops null/undefined keys; undefined when nothing is left, so the parent drops the section too.
function clean(obj) {
  const out = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] != null) out[key] = obj[key];
  }
  return Object.keys(out).length ? out : undefined;
}

const goal = (s) => s && clean({ current: s.current, target: s.target });
const current = (s) => s && clean({ current: s.current });
// Zepp reports body temperature x100; the integration only divides values above 100, so Celsius passes through.
const celsius = (v) => (v > 100 ? v / 100 : v);

export function buildPayload(r) {
  const battery = r.battery;
  const hr = r.heartRate;
  const sleep = r.sleep;
  const pai = r.pai;
  const device = r.device;
  const user = r.user;
  return clean({
    record_time: new Date(r.time || Date.now()).toISOString(),
    battery: battery && clean({ current: battery.level, is_charging: battery.charging }),
    steps: goal(r.steps),
    calorie: goal(r.calorie),
    distance: current(r.distance),
    fat_burning: goal(r.fatBurning),
    stands: goal(r.stands),
    heart_rate:
      hr &&
      clean({
        last: hr.last,
        resting: hr.resting,
        summary: hr.max != null ? { maximum: { hr_value: hr.max } } : undefined,
      }),
    blood_oxygen: r.bloodOxygen && r.bloodOxygen.length ? { few_hours: r.bloodOxygen } : undefined,
    stress: r.stress != null ? { current: { value: r.stress } } : undefined,
    body_temperature:
      r.bodyTemperature != null ? { current: { value: celsius(r.bodyTemperature) } } : undefined,
    sleep:
      sleep &&
      clean({
        status: sleep.status,
        info: clean({
          score: sleep.score,
          startTime: sleep.startTime,
          endTime: sleep.endTime,
          deepTime: sleep.deepTime,
          totalTime: sleep.totalTime,
        }),
      }),
    pai: pai && clean({ week: pai.week, day: pai.day, last_week: pai.lastWeek }),
    is_wearing: r.wearing,
    device:
      device &&
      clean({ deviceName: device.name, deviceSource: device.source, width: device.width, height: device.height }),
    user:
      user &&
      clean({ nickName: user.nickName, age: user.age, height: user.height, weight: user.weight, gender: user.gender }),
  });
}

// Reads a dot path. A negative index counts from the end of an array ("blood_oxygen.few_hours.-1.spo2").
export function getPath(obj, path) {
  let cur = obj;
  for (const key of path.split(".")) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(key);
      cur = cur[i < 0 ? cur.length + i : i];
    } else {
      cur = cur[key];
    }
  }
  return cur;
}

// mobile_app sensors. `path` is the payload path; `type` picks sensor or binary_sensor.
export const SENSOR_DEFS = [
  { unique_id: "record_time", name: "Record Time", path: "record_time", unit: null, device_class: null, state_class: null, icon: "mdi:calendar-clock", entity_category: "diagnostic", type: "sensor" },
  { unique_id: "battery", name: "Battery", path: "battery.current", unit: "%", device_class: "battery", state_class: "measurement", icon: "mdi:battery", type: "sensor" },
  { unique_id: "is_charging", name: "Is Charging", path: "battery.is_charging", unit: null, device_class: "battery_charging", state_class: null, icon: "mdi:battery-charging", type: "binary_sensor" },
  { unique_id: "steps", name: "Steps", path: "steps.current", unit: "steps", device_class: null, state_class: "total_increasing", icon: "mdi:walk", type: "sensor" },
  { unique_id: "calories", name: "Calories", path: "calorie.current", unit: "kcal", device_class: null, state_class: "total_increasing", icon: "mdi:fire", type: "sensor" },
  { unique_id: "distance", name: "Distance", path: "distance.current", unit: "m", device_class: "distance", state_class: "total_increasing", icon: "mdi:map-marker-distance", type: "sensor" },
  { unique_id: "fat_burning", name: "Fat Burning", path: "fat_burning.current", unit: "min", device_class: "duration", state_class: "total_increasing", icon: "mdi:run-fast", type: "sensor" },
  { unique_id: "stands", name: "Stands", path: "stands.current", unit: "times", device_class: null, state_class: "total_increasing", icon: "mdi:human-handsup", type: "sensor" },
  { unique_id: "heart_rate", name: "Heart Rate", path: "heart_rate.last", unit: "bpm", device_class: null, state_class: "measurement", icon: "mdi:heart-pulse", type: "sensor" },
  { unique_id: "heart_rate_resting", name: "Heart Rate Resting", path: "heart_rate.resting", unit: "bpm", device_class: null, state_class: "measurement", icon: "mdi:heart", type: "sensor" },
  { unique_id: "heart_rate_max", name: "Heart Rate Max", path: "heart_rate.summary.maximum.hr_value", unit: "bpm", device_class: null, state_class: "measurement", icon: "mdi:heart-flash", type: "sensor" },
  { unique_id: "blood_oxygen", name: "Blood Oxygen", path: "blood_oxygen.few_hours.-1.spo2", unit: "%", device_class: null, state_class: "measurement", icon: "mdi:water-percent", type: "sensor" },
  { unique_id: "stress", name: "Stress", path: "stress.current.value", unit: "points", device_class: null, state_class: "measurement", icon: "mdi:emoticon-sad-outline", type: "sensor" },
  { unique_id: "body_temperature", name: "Body Temperature", path: "body_temperature.current.value", unit: "°C", device_class: "temperature", state_class: "measurement", icon: "mdi:thermometer", type: "sensor" },
  { unique_id: "sleep_status", name: "Sleep Status", path: "sleep.status", unit: null, device_class: null, state_class: null, icon: "mdi:sleep", type: "sensor" },
  { unique_id: "sleep_score", name: "Sleep Score", path: "sleep.info.score", unit: "points", device_class: null, state_class: "measurement", icon: "mdi:sleep", type: "sensor" },
  { unique_id: "sleep_deep", name: "Sleep Deep", path: "sleep.info.deepTime", unit: "min", device_class: "duration", state_class: "measurement", icon: "mdi:weather-night", type: "sensor" },
  { unique_id: "sleep_total", name: "Sleep Total", path: "sleep.info.totalTime", unit: "min", device_class: "duration", state_class: "measurement", icon: "mdi:clock-outline", type: "sensor" },
  { unique_id: "pai", name: "PAI", path: "pai.week", unit: "points", device_class: null, state_class: "measurement", icon: "mdi:chart-bubble", type: "sensor" },
  { unique_id: "is_wearing", name: "Is Wearing", path: "is_wearing", unit: null, device_class: "occupancy", state_class: null, icon: "mdi:watch", type: "binary_sensor" },
  { unique_id: "device_name", name: "Device", path: "device.deviceName", unit: null, device_class: null, state_class: null, icon: "mdi:watch-variant", entity_category: "diagnostic", type: "sensor" },
  { unique_id: "user_name", name: "User", path: "user.nickName", unit: null, device_class: null, state_class: null, icon: "mdi:account", entity_category: "diagnostic", type: "sensor" },
];
