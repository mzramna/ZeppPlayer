import { state } from "../state.js";

// Mirrors ZML: the page gets request/call; request resolves with the side's result.
export function BasePage(options) {
  return {
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
