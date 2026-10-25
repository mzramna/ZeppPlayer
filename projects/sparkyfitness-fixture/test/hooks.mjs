// Hooks de módulo: importam o código REAL do app (para a cobertura do Node medir os arquivos),
// trocando @zos/* e @zeppos/zml/* por fakes que leem globalThis.__zos.
// O token r=N na query isola cada load(); stubs=<dir> troca ../utils/<nome> por arquivos de stub.
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { basename, extname } from 'node:path'

// Os fakes leem globalThis.__zos a cada chamada (Z é um proxy vivo): o módulo é compartilhado entre
// loads, só o estado muda com reset().
const FAKE = {
  '@zos/storage': 'export const localStorage = { getItem: (k, d) => Z.storage.getItem(k, d), setItem: (k, v) => Z.storage.setItem(k, v), removeItem: (k) => Z.storage.removeItem(k) }',
  '@zos/ui': `const keys = (f) => new Proxy({}, { get: (_, k) => f(String(k)) })
    export const widget = keys((k) => k), prop = keys((k) => k.toLowerCase()), align = keys((k) => k), text_style = keys((k) => k), event = keys((k) => k)
    export const createWidget = (t, p) => Z.ui.createWidget(t, p), deleteWidget = (w) => Z.ui.deleteWidget(w)
    export default { widget, prop, align, text_style, event, createWidget, deleteWidget }`,
  '@zos/router': 'export const push = (o) => Z.calls.push(["push", o]); export const back = () => Z.calls.push(["back"]); export const replace = (o) => Z.calls.push(["replace", o])',
  '@zos/interaction': `export const showToast = (o) => Z.calls.push(["toast", o.content])
    export const onDigitalCrown = (o) => { Z.crown = o; Z.calls.push(["onDigitalCrown", o]) }
    export const offDigitalCrown = () => { Z.crown = null; Z.calls.push(["offDigitalCrown"]) }
    export const onGesture = (o) => { Z.gesture = o; Z.calls.push(["onGesture", o]) }
    export const offGesture = () => { Z.gesture = null; Z.calls.push(["offGesture"]) }
    export const GESTURE_UP = 1, GESTURE_DOWN = 2, GESTURE_LEFT = 3, GESTURE_RIGHT = 4`,
  '@zos/sensor': 'const mk = (n) => class { constructor(...a) { return new Z.sensors[n](...a) } }; export const Step = mk("Step"), Calorie = mk("Calorie"), HeartRate = mk("HeartRate"), Sleep = mk("Sleep")',
  '@zos/alarm': 'export const set = (o) => Z.alarm.set(o); export const cancel = (id) => Z.alarm.cancel(id)',
  '@zos/notification': 'export const notify = (o) => Z.notify(o)',
  '@zos/app-service': 'export const exit = () => Z.calls.push(["exit"])',
  '@zos/i18n': 'export const getText = (k) => k',
  '@zeppos/zml/base-page': 'export const BasePage = (o) => o',
  '@zeppos/zml/base-app': 'export const BaseApp = (o) => o',
  '@zeppos/zml/base-side': 'export const BaseSideService = (o) => o; export const settingsLib = { getItem: (k) => Z.settings.getItem(k), setItem: (k, v) => Z.settings.setItem(k, v) }'
}

export async function resolve(spec, ctx, next) {
  const [parent, query = ''] = (ctx.parentURL ?? '').split('?')
  const params = new URLSearchParams(query)
  if (/^@(zos|zeppos\/zml)\//.test(spec)) return { url: `zos-fake:${spec}`, shortCircuit: true }
  if (!spec.startsWith('.') || !parent.startsWith('file:')) return next(spec, ctx)
  let url = new URL(spec, parent)
  if (!extname(url.pathname)) url = new URL(url.href + '.js')
  const dir = params.get('stubs') || ''
  if (dir && url.pathname.includes('/utils/')) {
    const stub = `${dir}/${basename(url.pathname)}`
    if (existsSync(stub)) url = pathToFileURL(stub)
  }
  return { url: dir ? `${url.href}?${query}` : url.href, shortCircuit: true }
}

export async function load(url, ctx, next) {
  if (url.startsWith('zos-fake:')) {
    const spec = url.slice(9)
    if (!FAKE[spec]) throw new Error(`sem fake para ${spec}`)
    return { format: 'module', source: 'const Z = new Proxy({}, { get: (_, k) => globalThis.__zos[k], set: (_, k, v) => { globalThis.__zos[k] = v; return true } });\n' + FAKE[spec], shortCircuit: true }
  }
  if (!url.startsWith('file:')) return next(url, ctx)
  return { format: 'module', source: readFileSync(fileURLToPath(url.split('?')[0])), shortCircuit: true }
}
