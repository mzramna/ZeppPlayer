// shortcut: HA returns JPEG, converted to PNG before sending because the IMG widget is documented for PNG only; FEATURES.camera stays off until verified on a watch.
import { SETTING } from "../shared/protocol.js";
import { baseUrls, joinUrl, errorText } from "./http.js";

const ENTITY_ID = /^camera\.[a-z0-9_]+$/;

// HA scales the image server side for width/height.
export function snapshotUrl(base, entity_id, width, height) {
  return `${joinUrl(base, `api/camera_proxy/${entity_id}`)}?width=${width}&height=${height}`;
}

// ZML download() returns a task with callbacks, not a Promise (template: zeus os3.0 file-download-module).
// A non-200 answer (401, 404...) still downloads, so its body must not be treated as an image.
function download(service, url, opts) {
  return new Promise((resolve, reject) => {
    const task = service.download(url, opts);
    if (!task) return reject(new Error("download unavailable"));
    task.onSuccess = (data) =>
      data && data.statusCode === 200 ? resolve(data) : reject(new Error(`HTTP ${data && data.statusCode}`));
    task.onFail = (data) => reject(new Error(`download failed ${JSON.stringify(data)}`));
  });
}

// shortcut: snapshot files in data://download are never deleted, fine for occasional refreshes.
export async function cameraSnapshot({ entity_id, width, height }, service) {
  if (!ENTITY_ID.test(entity_id || "")) throw new Error(`Invalid camera entity ${entity_id}`);
  const w = Number(width);
  const h = Number(height);
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) throw new Error("Invalid size");
  const bases = baseUrls();
  if (!bases.length) throw new Error("Home Assistant address not set");
  const token = settings.settingsStorage.getItem(SETTING.TOKEN);
  if (!token) throw new Error("Home Assistant token not set");
  // Named .png: the download is JPEG, and the in-place convert below makes it PNG.
  const name = `camera_${Date.now()}.png`;
  let file;
  let lastError;
  for (const base of bases) {
    try {
      file = await download(service, snapshotUrl(base, entity_id, w, h), {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 15000,
        filePath: name,
      });
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!file) throw new Error(`Connection error: ${errorText(lastError)}`);
  await service.convert({ filePath: file.filePath, targetFilePath: file.filePath });
  service.sendFile(file.filePath, { type: "image", name });
  return { file: name };
}
