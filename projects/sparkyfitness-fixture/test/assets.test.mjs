import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const root = new URL('../', import.meta.url)
const appJson = JSON.parse(readFileSync(new URL('app.json', root), 'utf8'))

// Mesma regra do zpm (zeus build) para app.json v3: a pasta de recursos é assets/<target>.<layout>,
// com layout = `${sr}-${st}`, sr ou st da plataforma. Errar isso dá "The icon in app.json is empty".
const assetDirs = Object.entries(appJson.targets).flatMap(([target, { platforms }]) => platforms.map(({ st, sr }) => {
  const layout = st && sr ? `${sr}-${st}` : sr || st
  return layout ? `${target}.${layout}` : target
}))
const [assetDir] = assetDirs
const assetPath = (p) => new URL(`assets/${assetDir}/${p}`, root)

test('cada pasta de recursos exigida pelo app.json existe e tem o ícone do app', () => {
  for (const dir of assetDirs) {
    const icon = new URL(`assets/${dir}/${appJson.app.icon}`, root)
    assert.ok(existsSync(icon), `zeus build vai procurar assets/${dir}/${appJson.app.icon}`)
  }
})
// Lê largura/altura do IHDR (bytes 16-23 de um PNG).
const pngSize = (file) => {
  const b = readFileSync(file)
  assert.deepEqual([...b.subarray(1, 4)], [0x50, 0x4e, 0x47], `${file} não é PNG`)
  return [b.readUInt32BE(16), b.readUInt32BE(20)]
}

test('todo src de imagem usado em page/ existe na pasta de recursos', () => {
  const pages = readdirSync(new URL('page/', root)).filter((f) => f.endsWith('.js'))
  const srcs = new Set()
  for (const f of pages) {
    const code = readFileSync(new URL(`page/${f}`, root), 'utf8')
    for (const [, s] of code.matchAll(/'((?:icons\/)?[\w.-]+\.png)'/g)) srcs.add(s)
  }
  assert.ok(srcs.size >= 8, 'poucos srcs encontrados: a regex quebrou?')
  for (const s of srcs) assert.ok(existsSync(assetPath(s)), `faltando assets/${assetDir}/${s}`)
})

test('icon.png tem 248x248 (tamanho do ícone de app para 480 px na documentação Zepp)', () => {
  assert.deepEqual(pngSize(assetPath('icon.png').pathname), [248, 248])
})

test('logo.png tem 120x120 e os ícones de cartão são 40x40', () => {
  assert.deepEqual(pngSize(assetPath('logo.png').pathname), [120, 120])
  const icons = readdirSync(assetPath('icons/').pathname).filter((f) => f.endsWith('.png'))
  assert.ok(icons.length >= 7)
  for (const f of icons) assert.deepEqual(pngSize(assetPath(`icons/${f}`).pathname), [40, 40], f)
})
