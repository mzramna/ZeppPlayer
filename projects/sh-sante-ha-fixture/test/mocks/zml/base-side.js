import { state } from "../state.js";

// Stands in for the ZML side service. download() and convert() follow the real ones: download()
// returns a task that reports through onSuccess/onFail (ZML's network.downloader), convert() a Promise.
export function BaseSideService(options) {
  return {
    ...options,
    call(data) {
      state.calls.push(data);
    },
    download(url, opts) {
      const task = { onSuccess: null, onFail: null };
      queueMicrotask(() => task.onSuccess?.({ filePath: opts.filePath, statusCode: 200 }));
      return task;
    },
    convert: async () => ({}),
    sendFile(path, opts) {
      state.requests.push({ method: "sendFile", params: { path, opts } });
      return { on() {} };
    },
  };
}
