import { register } from 'node:module'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve as abs } from 'node:path'
import { pathToFileURL } from 'node:url'

register('./hooks.mjs', import.meta.url)

let n = 0
// Entradas que se registram no topo (Page(), AppSideService()...) precisam de instância nova a cada load;
// as demais ficam compartilhadas, para a cobertura do Node enxergar um único módulo por arquivo.
const REGISTERS = /^(Page|App|AppSideService|AppService|AppSettingsPage)\(/m

// stubs: { sensors: 'fonte esm' } substitui ../utils/sensors (isola o grafo desse load).
export function load(entry, stubs = {}) {
  const url = pathToFileURL(abs(entry)).href
  const hasStubs = Object.keys(stubs).length > 0
  if (!hasStubs && !REGISTERS.test(readFileSync(abs(entry), 'utf8'))) return import(url)
  const dir = mkdtempSync(join(tmpdir(), 'zos-stubs-'))
  for (const [name, src] of Object.entries(stubs)) writeFileSync(join(dir, `${name}.js`), src)
  const q = new URLSearchParams({ r: String(++n), stubs: hasStubs ? pathToFileURL(dir).href.replace('file://', '') : '' })
  return import(`${url}?${q}`)
}

// Estado fake novo a cada teste. Páginas/serviços registram-se via Page()/AppSideService()/AppService().
export function reset({ settings = {}, routes = {}, sensors = {} } = {}) {
  const store = new Map()
  const widgets = []
  const alarms = new Map()
  let nextAlarm = 1
  const Z = {
    calls: [],
    storage: { getItem: (k, d) => (store.has(k) ? store.get(k) : d), setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k), _map: store },
    ui: {
      widget: new Proxy({}, { get: (_, k) => k }), prop: new Proxy({}, { get: (_, k) => String(k).toLowerCase() }),
      align: new Proxy({}, { get: (_, k) => k }), text_style: new Proxy({}, { get: (_, k) => k }), event: new Proxy({}, { get: (_, k) => k }),
      createWidget(type, props) {
        const w = { type, props: { ...props }, setProperty(p, v) { this.props[p] = v }, getProperty(p) { return this.props[p] },
          addEventListener(ev, fn) { this.props['on_' + ev] = fn }, createWidget: (t, p) => Z.ui.createWidget(t, p) }
        widgets.push(w)
        return w
      },
      deleteWidget(w) { const i = widgets.indexOf(w); if (i >= 0) widgets.splice(i, 1) }
    },
    widgets,
    sensors: Object.fromEntries(['Step', 'Calorie', 'HeartRate', 'Sleep'].map((n) => [n, class {
      constructor() { if (!(n in sensors)) throw new Error(`${n} indisponível`); Object.assign(this, sensors[n]) }
    }])),
    alarm: { set: (o) => { const id = nextAlarm++; alarms.set(id, o); return id }, cancel: (id) => alarms.delete(id), _map: alarms },
    notified: [],
    notify: (o) => { Z.notified.push(o); return Z.notified.length },
    settings: { getItem: (k) => settings[k], setItem: (k, v) => { settings[k] = v } },
    fetched: [],
    routes
  }
  globalThis.__zos = Z
  globalThis.fetch = async (req) => {
    Z.fetched.push({ ...req, body: req.body ? JSON.parse(req.body) : undefined })
    const path = req.url.replace(/^https?:\/\/[^/]+/, '')
    const r = Z.routes[`${req.method} ${path}`] ?? Z.routes[path]
    if (r === undefined) return { status: 404, body: '' }
    const v = typeof r === 'function' ? r(req) : r
    return v && v.status ? v : { status: 200, body: JSON.stringify(v) }
  }
  globalThis.Page = (o) => { Z.page = o }
  globalThis.App = (o) => { Z.app = o }
  globalThis.AppSideService = (o) => { Z.side = o }
  globalThis.AppService = (o) => { Z.service = o }
  globalThis.AppSettingsPage = (o) => { Z.setting = o }
  return Z
}

// Encontra widget por texto e dispara o clique.
export function tap(Z, text) {
  const w = Z.widgets.find((x) =>
    text instanceof RegExp ? text.test(x.props.text) :
    (x.props.text === text || String(x.props.text).startsWith(text) || String(x.props.text).includes(text))
  )
  if (!w) throw new Error(`widget "${text}" não encontrado: ${Z.widgets.map((x) => x.props.text).filter(Boolean).join(' | ')}`)
  ;(w.props.click_func || w.props.on_CLICK_UP)(w)
  return w
}
