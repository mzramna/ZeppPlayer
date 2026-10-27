import { state } from "../state.js";

let next = 1;
// Tests set these to make the system refuse set() (returns 0) or fail cancel() (throws).
export const refuse = { set: false, cancel: false };
export const ONCE = 0, REPEAT_DAY = 1;
export const set = (option) => {
  if (refuse.set) return 0;
  const id = next++;
  state.alarms.set(id, option);
  return id;
};
export const cancel = (opt) => {
  if (refuse.cancel) throw new Error("no such alarm");
  return state.alarms.delete(typeof opt === "number" ? opt : opt.id);
};
export const getAllAlarms = () => [...state.alarms.keys()];
