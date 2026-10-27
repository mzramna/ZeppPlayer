// rmSync records the paths it was asked to delete; tests read and clear `removed`.
export const removed = [];
export function rmSync(opt) {
  removed.push(typeof opt === "string" ? opt : opt.path);
  return 0;
}
