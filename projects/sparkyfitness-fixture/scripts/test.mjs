// Roda a suíte e exige cobertura mínima POR ARQUIVO. O "all files" do Node soma todas as instâncias de
// módulo carregadas pelos testes (páginas são recarregadas a cada load) e não serve de limite.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'

const MIN_LINES = 90, MIN_BRANCHES = 80
const files = readdirSync('test').filter((f) => f.endsWith('.test.mjs')).map((f) => `test/${f}`)
const r = spawnSync(process.execPath, ['--test', '--experimental-test-coverage',
  ...['app-side', 'app-service', 'page', 'utils', 'setting'].map((d) => `--test-coverage-include=${d}/**`), ...files],
{ encoding: 'utf8' })
process.stdout.write(r.stdout)
process.stderr.write(r.stderr)

const low = [...r.stdout.matchAll(/^# +(\S+\.js) +\| +([\d.]+) +\| +([\d.]+)/gm)]
  .filter(([, , l, b]) => +l < MIN_LINES || +b < MIN_BRANCHES)
  .map(([, f, l, b]) => `${f}: ${l}% linhas, ${b}% branches`)
if (low.length) console.error(`\nCobertura abaixo de ${MIN_LINES}%/${MIN_BRANCHES}%:\n  ${low.join('\n  ')}`)
process.exit(r.status || (low.length ? 1 : 0))
