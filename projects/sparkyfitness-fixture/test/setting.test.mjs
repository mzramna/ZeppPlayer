import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load, reset } from './helpers.mjs'

globalThis.Section = (props, children) => ({ type: 'Section', props, children })
globalThis.Select = (props) => ({ type: 'Select', props })
globalThis.View = (props, children) => ({ type: 'View', props, children })
globalThis.Text = (props, children) => ({ type: 'Text', props, children })
globalThis.TextInput = (props) => ({ type: 'TextInput', props })

// Percorre recursivamente a árvore gerada pelo build procurando componentes que satisfaçam a condição.
function findDescendants(node, predicate) {
  const matches = []
  if (!node) return matches
  if (predicate(node)) matches.push(node)
  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      matches.push(...findDescendants(child, predicate))
    }
  }
  return matches
}

test('campos mostram o valor salvo e onChange grava sem espaços', async () => {
  const Z = reset()
  const m = new Map([['server', 'https://a.b']])
  const settingsStorage = { getItem: (k) => m.get(k), setItem: (k, v) => m.set(k, v) }
  await load('setting/index.js')
  const root = Z.setting.build({ settingsStorage })
  const inputs = findDescendants(root, (n) => n.type === 'TextInput').map((n) => n.props)
  assert.equal(inputs.length, 2)
  const [server, key] = inputs

  // Valores iniciais e estilo escuro moderno
  assert.equal(server.value, 'https://a.b')
  assert.equal(key.value, '')
  assert.equal(server.style.backgroundColor, '#0f172a')
  assert.equal(server.style.color, '#f8fafc')
  assert.equal(server.style.borderRadius, '10px')
  assert.equal(server.style.border, '1px solid #334155')
  assert.equal(key.style.borderRadius, '10px')

  // onChange grava com trim
  server.onChange('  https://x.y  ')
  key.onChange(' k ')
  assert.equal(m.get('server'), 'https://x.y')
  assert.equal(m.get('apiKey'), 'k')
})

test('seção de sensores: padrão Health Connect, escolha grava sensorMode e a ajuda muda', async () => {
  const Z = reset()
  const m = new Map()
  const settingsStorage = { getItem: (k) => m.get(k), setItem: (k, v) => m.set(k, v) }
  await load('setting/index.js')
  const getSection = () => findDescendants(Z.setting.build({ settingsStorage }), (n) => n.type === 'Section')[0]
  let sec = getSection()
  assert.equal(sec.props.title, 'Dados medidos pelo relógio (passos, FC, sono, calorias)')

  const select = findDescendants(sec, (n) => n.type === 'Select')[0].props
  assert.deepEqual(select.options, [
    { name: 'Via Health Connect', value: 'health-connect' },
    { name: 'Direto pela API', value: 'direct' }
  ])
  assert.equal(select.value, 'health-connect') // padrão sem valor salvo
  assert.equal(select.style.borderRadius, '10px')
  assert.equal(select.style.backgroundColor, '#0f172a')

  const helpPara = findDescendants(sec, (n) => n.type === 'Text' && n.props?.paragraph)[0]
  assert.ok(helpPara)
  assert.match(helpPara.children, /docs\/health-connect\.md/)

  // Seleciona modo direct
  select.onChange('direct')
  assert.equal(m.get('sensorMode'), 'direct')
  sec = getSection()
  const directSelect = findDescendants(sec, (n) => n.type === 'Select')[0].props
  assert.equal(directSelect.value, 'direct')
  const directHelp = findDescendants(sec, (n) => n.type === 'Text' && n.props?.paragraph)[0]
  assert.ok(directHelp)
  assert.match(directHelp.children, /em dobro/)
  const directTitle = findDescendants(sec, (n) => n.type === 'Text' && n.props?.bold)[0]
  assert.match(directTitle.children, /Atenção/)

  // Volta para Health Connect
  directSelect.onChange('health-connect')
  assert.equal(m.get('sensorMode'), 'health-connect')
  sec = getSection()
  const revertedHelp = findDescendants(sec, (n) => n.type === 'Text' && n.props?.paragraph)[0]
  assert.match(revertedHelp.children, /docs\/health-connect\.md/)
  const hcTitle = findDescendants(sec, (n) => n.type === 'Text' && n.props?.bold)[0]
  assert.match(hcTitle.children, /Recomendado/)
})

test('estética do tema escuro: cartões estilizados, cabeçalho e dicas', async () => {
  const Z = reset()
  const m = new Map([['server', 'https://sparky.io'], ['apiKey', 'sec-123'], ['sensorMode', 'direct']])
  const settingsStorage = { getItem: (k) => m.get(k) || '', setItem: (k, v) => m.set(k, v) }
  await load('setting/index.js')
  const root = Z.setting.build({ settingsStorage })

  // Exercita callbacks do último load para cobertura completa de funções e branches
  const inputs = findDescendants(root, (n) => n.type === 'TextInput').map((n) => n.props)
  inputs[0].onChange(' https://sparky.io/new ')
  inputs[1].onChange(' key-456 ')
  const select = findDescendants(root, (n) => n.type === 'Select')[0].props
  select.onChange('health-connect')
  Z.setting.build({ settingsStorage }) // cobre o ramo health-connect nesta instância

  // Página raiz com fundo escuro e padding confortável
  assert.equal(root.props.style.backgroundColor, '#0f172a')
  assert.ok(Array.isArray(root.children))
  assert.equal(root.children.length, 4)

  // 1. Header Card
  const headerCard = root.children[0]
  assert.equal(headerCard.props.style.backgroundColor, '#1e293b')
  assert.equal(headerCard.props.style.borderRadius, '14px')
  assert.equal(headerCard.props.style.border, '1px solid #334155')
  const headerTexts = findDescendants(headerCard, (n) => n.type === 'Text')
  assert.ok(headerTexts.some((t) => typeof t.children === 'string' && t.children.includes('SparkyFitness')))
  assert.ok(headerTexts.some((t) => typeof t.children === 'string' && t.children.includes('Zepp OS Companion')))

  // 2. Server Card
  const serverCard = root.children[1]
  assert.equal(serverCard.props.style.backgroundColor, '#1e293b')
  assert.equal(serverCard.props.style.borderRadius, '14px')

  // 3. Sensor Section
  const sensorSection = root.children[2]
  assert.equal(sensorSection.props.style.backgroundColor, '#1e293b')

  // 4. Tips Card
  const tipsCard = root.children[3]
  assert.equal(tipsCard.props.style.backgroundColor, '#1e293b')
  const tipsTexts = findDescendants(tipsCard, (n) => n.type === 'Text')
  assert.ok(tipsTexts.some((t) => typeof t.children === 'string' && t.children.includes('Configurações Móveis')))
})

test('paridade: versão legada legacy/setting/index.js possui os mesmos campos e estilos', async () => {
  const Z = reset()
  const m = new Map([['server', 'https://legacy.server'], ['sensorMode', 'direct']])
  const settingsStorage = { getItem: (k) => m.get(k), setItem: (k, v) => m.set(k, v) }
  await load('legacy/setting/index.js')
  const root = Z.setting.build({ settingsStorage })
  assert.equal(root.props.style.backgroundColor, '#0f172a')

  const inputs = findDescendants(root, (n) => n.type === 'TextInput').map((n) => n.props)
  assert.equal(inputs.length, 2)
  assert.equal(inputs[0].value, 'https://legacy.server')
  assert.equal(inputs[0].style.backgroundColor, '#0f172a')
  assert.equal(inputs[0].style.borderRadius, '10px')

  const select = findDescendants(root, (n) => n.type === 'Select')[0].props
  assert.equal(select.value, 'direct')
})
