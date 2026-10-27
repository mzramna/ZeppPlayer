import { notify } from "@zos/notification";
import { getText } from "@zos/i18n";
import { FEATURES } from "../config/build.js";
import { METHOD } from "../shared/protocol.js";
import { buildPayload } from "../shared/zepp2hass.js";
import { collectReadings } from "./collect.js";
import { KEY_LAST, KEY_FAILS, read, write, scheduleNext, stop } from "./schedule.js";

const RETRY_SEC = 5 * 60;
const FAILS_BEFORE_NOTIFY = 3;

// Seconds until the next run: the phone's interval after success, a short retry after failure.
export function nextDelaySeconds(result) {
  const minutes = result && result.ok ? Number(result.interval) : 0;
  return minutes > 0 ? minutes * 60 : RETRY_SEC;
}

// The ZML messaging object app.js creates; pages use the same one.
async function sendToPhone() {
  const messaging = /** @type {any} */ (getApp())._options.globalData.messaging;
  const payload = buildPayload(collectReadings());
  const res = await messaging.request({ method: METHOD.SYNC_SENSORS, params: { payload } }, { timeout: 15000 });
  return { ok: true, interval: res.interval, disabled: !!res.disabled };
}

export async function runSync() {
  // A retry is set before sending, so a service killed mid-sync still runs again.
  scheduleNext(RETRY_SEC);
  /** @type {{ ok: boolean, interval?: number, error?: string, disabled?: boolean }} */
  let result;
  try {
    result = await sendToPhone();
  } catch (e) {
    result = { ok: false, error: (e && e.message) || String(e) };
  }
  // The phone has no sensor mode set, so nothing will ever be sent: stop instead of retrying.
  if (result.disabled) {
    stop();
    return result;
  }
  write(KEY_LAST, JSON.stringify({ time: Date.now(), ok: result.ok, error: result.error }));

  // Once per streak: the counter keeps growing until a success resets it.
  const fails = result.ok ? 0 : Number(read(KEY_FAILS, 0)) + 1;
  if (fails === FAILS_BEFORE_NOTIFY && FEATURES.notification) {
    notify({ title: getText("sync_failing_title"), content: getText("sync_failing_body"), actions: [] });
  }
  write(KEY_FAILS, fails);
  scheduleNext(nextDelaySeconds(result));
  return result;
}

AppService({
  onInit() {
    return runSync();
  },
  onDestroy() {},
});
