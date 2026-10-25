// Helpers to run a watch page/app-service module against the mocks.
import { state, reset } from "../mocks/state.js";

export { state, reset };

// Each module is imported once per process (a fresh query string per import would split V8 coverage).
// Every load() returns a fresh shallow copy of the definition, with its own state.
const modules = new Map();
export async function load(path, kind = "page") {
  const key = `${kind} ${path}`;
  let def = modules.get(key);
  if (!def) {
    // Each kind is registered by one module only, so a module imported earlier by a direct import
    // still leaves its definition in the registry.
    await import(new URL(`../../${path}`, import.meta.url).href);
    def = globalThis.__zepp[kind];
    if (!def) throw new Error(`${path} did not register a ${kind}`);
    if (def.state !== undefined) def.initialState = structuredClone(def.state);
    modules.set(key, def);
  }
  const copy = { ...def };
  if (def.initialState !== undefined) copy.state = structuredClone(def.initialState);
  return copy;
}

// respond(map): map method -> value | (params) => value | Error.
export function respond(map) {
  state.respond = async ({ method, params }) => {
    if (!(method in map)) throw new Error(`unexpected request ${method}`);
    const v = map[method];
    const r = typeof v === "function" ? await v(params || {}) : v;
    if (r instanceof Error) throw r;
    return r;
  };
}

// Builds a page: onInit(params) then build(), then waits for pending promises.
// Each page file is imported once per process (a second import would register a second copy and
// split V8 coverage). Every open() gets a fresh shallow copy of the definition with its own state.
const pages = new Map();
export async function open(path, params) {
  let def = pages.get(path);
  if (!def) {
    globalThis.__zepp.page = null;
    await import(new URL(`../../${path}`, import.meta.url).href);
    def = globalThis.__zepp.page;
    if (!def) throw new Error(`${path} did not register a page (imported before by a direct import?)`);
    def.initialState = structuredClone(def.state || {});
    pages.set(path, def);
  }
  return start({ ...def }, params);
}
export const openOnce = open;

async function start(page, params) {
  page.state = structuredClone(page.initialState || page.state || {});
  page.onInit && page.onInit(params === undefined ? undefined : typeof params === "string" ? params : JSON.stringify(params));
  page.build && page.build();
  await flush();
  return page;
}

export const flush = () => new Promise((r) => setTimeout(r, 0));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const texts = () => state.widgets.filter((w) => w.props.text !== undefined).map((w) => String(w.props.text));
export const findText = (needle) =>
  state.widgets.find((w) => w.props.text !== undefined && String(w.props.text).includes(needle));

// Clicks a widget: BUTTON click_func or CLICK_UP listeners.
export async function click(w) {
  if (!w) throw new Error("click: widget not found");
  if (w.props.click_func) w.props.click_func(w);
  (w.listeners.CLICK_UP || []).forEach((cb) => cb({}));
  await flush();
}

// The card background under a text widget (entityCard registers the click there).
export function clickable(text) {
  const t = findText(text);
  if (!t) throw new Error(`no widget with text ${text}`);
  if (t.props.click_func || t.listeners.CLICK_UP) return t;
  return state.widgets.find(
    (w) => (w.listeners.CLICK_UP || w.props.click_func) && w.props.y <= t.props.y && t.props.y < w.props.y + w.props.h
  );
}
