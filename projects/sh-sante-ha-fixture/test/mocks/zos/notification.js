import { state } from "../state.js";

export const notify = (opts) => state.notifications.push(opts);
export const cancel = () => {};
