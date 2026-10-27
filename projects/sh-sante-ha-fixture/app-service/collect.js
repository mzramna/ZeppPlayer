import {
  HeartRate, Battery, Step, Calorie, Distance, Stand, FatBurning, Pai, Wear,
  Sleep, BloodOxygen, Stress, BodyTemperature,
} from "@zos/sensor";
import { getDeviceInfo } from "@zos/device";
import { getProfile } from "@zos/user";

// One failing sensor leaves only its own section undefined.
function read(fn) {
  try {
    return fn();
  } catch (e) {
    return undefined;
  }
}

// Watch readings in the shape shared/zepp2hass.js buildPayload() expects.
// shortcut: battery.charging and pai.lastWeek are not in the typings, so they are left out.
export function collectReadings() {
  return {
    time: Date.now(),
    battery: read(() => ({ level: new Battery().getCurrent() })),
    steps: read(() => {
      const s = new Step();
      return { current: s.getCurrent(), target: s.getTarget() };
    }),
    calorie: read(() => {
      const s = new Calorie();
      return { current: s.getCurrent(), target: s.getTarget() };
    }),
    distance: read(() => ({ current: new Distance().getCurrent() })),
    fatBurning: read(() => {
      const s = new FatBurning();
      return { current: s.getCurrent(), target: s.getTarget() };
    }),
    stands: read(() => {
      const s = new Stand();
      return { current: s.getCurrent(), target: s.getTarget() };
    }),
    heartRate: read(() => {
      const s = new HeartRate();
      return {
        last: s.getLast(),
        resting: s.getResting(),
        max: read(() => s.getDailySummary().maximum.hr_value),
      };
    }),
    bloodOxygen: read(() => new BloodOxygen().getLastFewHour(2)),
    stress: read(() => new Stress().getCurrent().value),
    bodyTemperature: read(() => new BodyTemperature().getCurrent().current),
    sleep: read(() => {
      const s = new Sleep();
      s.updateInfo();
      const info = s.getInfo();
      return {
        status: s.getSleepingStatus(),
        score: info.score,
        startTime: info.startTime,
        endTime: info.endTime,
        deepTime: info.deepTime,
        totalTime: info.totalTime,
      };
    }),
    pai: read(() => {
      const s = new Pai();
      return { week: s.getTotal(), day: s.getToday() };
    }),
    wearing: read(() => new Wear().getStatus()),
    device: read(() => {
      const d = getDeviceInfo();
      return { name: d.deviceName, source: d.deviceSource, width: d.width, height: d.height };
    }),
    user: read(() => {
      const p = getProfile();
      return { nickName: p.nickName, age: p.age, height: p.height, weight: p.weight, gender: p.gender };
    }),
  };
}
