import { state } from "../state.js";

export function BaseApp(options) {
  return {
    globalData: {},
    ...options,
    request(data) {
      state.requests.push(data);
      return Promise.resolve().then(() => state.respond(data));
    },
    call(data) {
      state.calls.push(data);
    },
  };
}
