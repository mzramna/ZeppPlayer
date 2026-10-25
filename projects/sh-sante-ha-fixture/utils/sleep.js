// Sleep as Android (SaA) commands. Pure logic, no @zos imports, so node:test can load it.
// The phone sends them as Android intents through the HA Companion notify command.

export const SAA_ACTIONS = { START: "start", STOP: "stop" };

const SAA_PACKAGE = "com.urbandroid.sleep";
const INTENTS = new Map([
  [SAA_ACTIONS.START, "com.urbandroid.sleep.alarmclock.START_SLEEP_TRACK"],
  [SAA_ACTIONS.STOP, "com.urbandroid.sleep.alarmclock.STOP_SLEEP_TRACK"],
]);

// The `data` of a CALL_SERVICE to notify.<saaNotifyService>.
export function saaCommand(action) {
  const intentAction = INTENTS.get(action);
  if (!intentAction) throw new Error(`Unknown Sleep as Android action: ${action}`);
  return {
    message: "command_broadcast_intent",
    data: { intent_package_name: SAA_PACKAGE, intent_action: intentAction },
  };
}
