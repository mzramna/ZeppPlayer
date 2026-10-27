// Fake phone globals for side-service code: settings.settingsStorage and fetch.
export function installSettings(initial = {}) {
  const store = new Map(Object.entries(initial));
  const listeners = [];
  globalThis.settings = {
    settingsStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => {
        const oldValue = store.get(k);
        store.set(k, String(v));
        listeners.forEach((cb) => cb({ key: k, newValue: String(v), oldValue }));
      },
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
      addListener: (_e, cb) => listeners.push(cb),
      toObject: () => Object.fromEntries(store),
    },
  };
  return store;
}

// routes: array of [matcher(string|RegExp|fn), response({status, body}) | fn(opts) | Error].
// Records every call in the returned array.
export function installFetch(routes = []) {
  const calls = [];
  globalThis.fetch = async (opts) => {
    calls.push(opts);
    for (const [match, response] of routes) {
      const ok =
        typeof match === "string" ? opts.url === match || opts.url.startsWith(match)
        : match instanceof RegExp ? match.test(opts.url)
        : match(opts);
      if (!ok) continue;
      const r = typeof response === "function" ? await response(opts) : response;
      if (r instanceof Error) throw r;
      return r;
    }
    throw new Error(`fetch: no route for ${opts.method || "GET"} ${opts.url}`);
  };
  return calls;
}
