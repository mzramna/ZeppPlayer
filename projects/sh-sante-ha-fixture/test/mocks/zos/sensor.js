import { state } from "../state.js";

// Each class returns values from state.sensors[ClassName][getter] (function or value).
function sensorClass(name) {
  return class {
    constructor() {
      return new Proxy(this, {
        get(target, key) {
          if (key in target) return target[key];
          const values = state.sensors[name] || {};
          if (!(key in values)) return () => undefined;
          const v = values[key];
          return typeof v === "function" ? v : () => v;
        },
      });
    }
  };
}
export const HeartRate = sensorClass("HeartRate");
export const Sleep = sensorClass("Sleep");
export const Battery = sensorClass("Battery");
export const Step = sensorClass("Step");
export const Calorie = sensorClass("Calorie");
export const Distance = sensorClass("Distance");
export const Stand = sensorClass("Stand");
export const FatBurning = sensorClass("FatBurning");
export const Pai = sensorClass("Pai");
export const Wear = sensorClass("Wear");
export const BloodOxygen = sensorClass("BloodOxygen");
export const Stress = sensorClass("Stress");
export const BodyTemperature = sensorClass("BodyTemperature");
export const Screen = sensorClass("Screen");
export const Workout = sensorClass("Workout");
export const Time = sensorClass("Time");
export const Accelerometer = sensorClass("Accelerometer");
export const Vibrator = sensorClass("Vibrator");
export const VIBRATOR_SCENE_SHORT_STRONG = 23, VIBRATOR_SCENE_DURATION = 24, VIBRATOR_SCENE_NOTIFICATION = 25;
