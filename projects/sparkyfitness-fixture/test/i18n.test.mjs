import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const SKIP = new Set(['node_modules', 'test', 'build', 'dist', 'coverage', 'legacy'])
// Todo .js do projeto, sem depender de quem importa @zos/i18n.
const jsFiles = (d) => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap((e) => {
  const p = join(d, e.name)
  if (e.isDirectory()) return SKIP.has(e.name) || e.name.startsWith('.') ? [] : jsFiles(p)
  return e.name.endsWith('.js') ? [p] : []
})

// Valores que o código gera em tempo de execução. Lidos do código quando possível.
const listOf = (src, re, what) => {
  const m = src.match(re)
  assert.ok(m, `não achei ${what} no código; atualize test/i18n.test.mjs`)
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
}
const FLOW_LEVELS = listOf(read('app-side/api.js'), /const FLOW_LEVELS = (\[[^\]]*\])/, 'FLOW_LEVELS')
const MACROS = listOf(read('page/index.js'), /const MACROS = (\[[^\]]*\])/, 'MACROS')
const screensBlock = read('page/list.js').split('const SCREENS = {')[1].split('\nPage(')[0]
const LIST_SCREENS = [...screensBlock.matchAll(/^ {2}(\w+): \{/gm)].map((m) => m[1])
assert.ok(LIST_SCREENS.length > 0, 'SCREENS vazio em page/list.js')
const MOOD_VALUES = [1, 2, 3, 4, 5] // page/list.js: [1, 2, 3, 4, 5].map(...)
const LIST_STATUS = ['taken', 'skipped'] // page/list.js: SCREENS.dose

// Template literals usados em t(`...`), pelo texto exato do código -> chaves geradas.
const DYNAMIC = {
  'flow.${f}': FLOW_LEVELS.map((f) => `flow.${f}`),
  'mood.${v}': MOOD_VALUES.map((v) => `mood.${v}`),
  'list.${status}': LIST_STATUS.map((s) => `list.${s}`),
  'list.${this.params.key}': LIST_SCREENS.map((s) => `list.${s}`),
  'dash.${m}': MACROS.map((m) => `dash.${m}`),
}

// Argumento 1 de cada getText(...) / t(...), inclusive ternários e templates.
const firstArgs = (src) => {
  const out = []
  for (const m of src.matchAll(/(?<![\w$.])(?:getText|t)\(/g)) {
    let i = m.index + m[0].length, depth = 0, q = null, arg = ''
    for (; i < src.length; i++) {
      const c = src[i]
      if (q) { if (c === q && src[i - 1] !== '\\') q = null; arg += c; continue }
      if (c === "'" || c === '"' || c === '`') { q = c; arg += c; continue }
      if ('([{'.includes(c)) depth++
      else if (')]}'.includes(c)) { if (depth === 0) break; depth-- }
      else if (c === ',' && depth === 0) break
      arg += c
    }
    out.push(arg)
  }
  return out
}

const { used, unresolved } = (() => {
  const used = new Set()
  const unresolved = []
  for (const f of jsFiles('.')) {
    for (const arg of firstArgs(read(f))) {
      const lits = [...arg.matchAll(/(['"`])((?:(?!\1).)*)\1/g)].map((x) => x[2])
      if (!lits.length) { unresolved.push(`${f}: chave não literal em ${arg}`); continue }
      for (const lit of lits) {
        if (!lit.includes('${')) { used.add(lit); continue }
        if (!(lit in DYNAMIC)) { unresolved.push(`${f}: chave dinâmica sem lista conhecida: ${lit}`); continue }
        DYNAMIC[lit].forEach((k) => used.add(k))
      }
    }
  }
  return { used, unresolved }
})()

const po = (l) => {
  const src = read(`page/i18n/${l}.po`)
  const pairs = [...src.matchAll(/^msgid "(.*)"\nmsgstr "(.*)"$/gm)]
  assert.equal(pairs.length, (src.match(/^msgid /gm) || []).length, `${l}.po: bloco msgid sem msgstr logo abaixo`)
  return pairs.map((m) => ({ id: m[1], str: m[2] }))
}
const LANGS = ['pt-BR', 'en-US']
const ids = Object.fromEntries(LANGS.map((l) => [l, po(l).map((e) => e.id)]))

test('o scanner acha as chaves conhecidas (sanidade)', () => {
  for (const k of ['dash.sync', 'taken', 'skip', 'list.taken', 'flow.heavy', 'mood.5', 'list.water', 'dash.fiber']) {
    assert.ok(used.has(k), `scanner não achou ${k}`)
  }
  assert.deepEqual(unresolved, [], 'chaves não resolvidas (adicione o template em DYNAMIC)')
})

for (const l of LANGS) {
  test(`${l}: toda chave usada no código existe, sem duplicata e com tradução`, () => {
    const have = ids[l]
    assert.equal(new Set(have).size, have.length, `${l}.po tem msgid duplicado`)
    const missing = [...used].filter((k) => !have.includes(k)).sort()
    assert.deepEqual(missing, [], `${l}.po sem chave(s): ${missing.join(', ')}`)
    const empty = po(l).filter((e) => !e.str.trim()).map((e) => e.id)
    assert.deepEqual(empty, [], `${l}.po com msgstr vazio: ${empty.join(', ')}`)
  })

  test(`${l}: sem chave sobrando no .po`, () => {
    const extra = ids[l].filter((k) => !used.has(k)).sort()
    assert.deepEqual(extra, [], `${l}.po com chave que o código não usa: ${extra.join(', ')}`)
  })
}

test('en-US e pt-BR têm exatamente as mesmas chaves', () => {
  const en = new Set(ids['en-US']), pt = new Set(ids['pt-BR'])
  assert.deepEqual([...en].filter((k) => !pt.has(k)).sort(), [], 'faltam no pt-BR')
  assert.deepEqual([...pt].filter((k) => !en.has(k)).sort(), [], 'faltam no en-US')
})
