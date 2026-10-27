// The background sync alarm and its storage keys, shared by app-service/sync.js (runs it) and
// page/sync/index.js (starts and stops it). Importing this file never registers a service.
import { set as setAlarm, cancel as cancelAlarm } from "@zos/alarm";
import { localStorage } from "@zos/storage";

export const SELF = "app-service/sync";
export const KEY_LAST = "last_sync";
export const KEY_ALARM = "sync_alarm_id";
export const KEY_FAILS = "sync_failures";

// Storage can be blocked on a device; the sync carries on without it.
export function read(key, fallback = null) {
  try {
    const v = localStorage.getItem(key, fallback);
    return v == null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

// A null value removes the key.
export function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {
    // Only the status line is lost.
  }
}

// Id of the alarm this run set; used when storage is blocked so the alarm is still replaced.
let lastAlarm = 0;

function cancelStored() {
  const prev = Number(read(KEY_ALARM, 0)) || lastAlarm;
  if (!prev) return;
  try {
    cancelAlarm(prev);
  } catch (e) {
    // Already fired or gone; nothing to cancel.
  }
}

// Replaces the stored alarm. A 0 id means the system refused it, so nothing is stored. Returns true when set.
export function scheduleNext(delaySec) {
  cancelStored();
  const id = setAlarm({ url: SELF, delay: delaySec, store: true });
  lastAlarm = id || 0;
  write(KEY_ALARM, id || null);
  return !!id;
}

export function stop() {
  cancelStored();
  lastAlarm = 0;
  write(KEY_ALARM, null);
}
