/**
 * 终端面的通路尺：注册表里那 26 条**每一条都要真跑得起来**，不是"清单里有这个名字"。
 *
 * 为什么要有这把尺：`scripts/gen-cli-registry.mjs` 的 `--check` 只证一件事——
 * 表与 `plugins/<id>/package.json` 的四个字段（`bin` + `./cli` + `./help` + 描述）逐条对得上。
 * 那还是**静态**的账：一个包可以四个字段齐全、`lib/cli.js` 却是空文件或者直接不存在，
 * 表照样绿。本仓已经吃过一次这种形状（`marku` 那次：tsdown 报 `UNRESOLVED_IMPORT` 而 rc=0，
 * 产物一跑就 `ERR_MODULE_NOT_FOUND`），所以这条判据从"清单"换成"跑一次 `--help`"。
 *
 * 判据三条，缺一即红：
 *  1. `plugins/<id>/lib/cli.js` 存在（缺产物是红，不是跳过——跳过等于给没构建的包发绿）；
 *  2. `node lib/cli.js --help` 的 rc=0；
 *  3. 它**印了东西**，且那句里带着自己的 bin 名（空输出、或只会 `console.log('ok')` 的桩，都不算面）。
 *
 * 用法：
 *   node scripts/check-cli-face.mjs                 # 量生成表里的全部
 *   node scripts/check-cli-face.mjs --only gifu,logx
 *   node scripts/check-cli-face.mjs --self-check    # 阳性对照：坏 bin 必须被抓到
 *
 * 超时按 20 秒算（`--timeout <ms>` 可改）：这条量的是"起得来"，不是"跑得快"，
 * 卡住与失败同罪——一个永不返回的 `--help` 对使用者就是终端面不存在。
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const REGISTRY = join(ROOT, 'packages/cli/src/node-cli-registry.generated.ts')
const DEFAULT_TIMEOUT_MS = 20_000

/** 从生成物里读 `{ id, packageName, bin, description }` 那张表——尺量的是运行期真吃的那份。 */
export function readRegistry(text) {
  const rows = []
  for (const match of text.matchAll(/\{\s*id:\s*"([^"]+)",\s*packageName:\s*"([^"]+)",\s*bin:\s*"([^"]+)",\s*description:\s*"([^"]+)"/g)) {
    rows.push({ id: match[1], packageName: match[2], bin: match[3], description: match[4] })
  }
  return rows
}

/**
 * 一个 bin 的判决。`cwd` 指到包目录，让相对路径（`./lib/cli.js`）按包自己的形状解析。
 */
export function judgeBin({ pluginsDir, id, bin, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const cliPath = join(pluginsDir, id, 'lib', 'cli.js')
  if (!existsSync(cliPath)) return { id, bin, rc: null, state: 'no-artifact', note: `没有 ${cliPath.replace(`${ROOT}/`, '')}` }
  const run = spawnSync(process.execPath, [cliPath, '--help'], { cwd: join(pluginsDir, id), encoding: 'utf8', timeout: timeoutMs })
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`
  if (run.error && run.error.code === 'ETIMEDOUT') return { id, bin, rc: run.status, state: 'timeout', note: `${timeoutMs}ms 内没返回` }
  if (run.status !== 0) return { id, bin, rc: run.status, state: 'rc', note: `rc=${run.status}；输出首行 ${out.split('\n')[0]?.slice(0, 90) ?? '(空)'}` }
  if (!out.includes(bin)) {
    return { id, bin, rc: run.status, state: 'no-name', note: `rc=0 但输出里没有 bin 名 "${bin}"（首行：${out.split('\n')[0]?.slice(0, 90) ?? '(空)'}）` }
  }
  return { id, bin, rc: run.status, state: 'ok', note: '' }
}

export function judgeAll({ pluginsDir, registryText, timeoutMs = DEFAULT_TIMEOUT_MS, only = null }) {
  const rows = readRegistry(registryText).filter((row) => only === null || only.includes(row.id))
  return rows.map((row) => judgeBin({ pluginsDir, id: row.id, bin: row.bin, timeoutMs }))
}

if (process.argv.includes('--self-check')) {
  // 夹具不落进 plugins/（那会被别的尺当成真节点包），走临时目录 + 显式传参。
  const dir = mkdtempSync(join(tmpdir(), 'xaihi-cli-face-'))
  const write = (id, bin, body) => {
    const at = join(dir, id, 'lib')
    mkdirSync(at, { recursive: true })
    writeFileSync(join(at, 'cli.js'), body)
    writeFileSync(join(dir, id, 'package.json'), JSON.stringify({ name: `fixture-${id}`, bin: { [bin]: './lib/cli.js' } }))
  }
  const cases = [
    { id: 'good', bin: 'xgood', body: 'console.log("xgood — a face")\n' },
    { id: 'silent', bin: 'xsilent', body: 'console.log("ok")\n' },
    { id: 'crash', bin: 'xcrash', body: 'process.exit(3)\n' },
    { id: 'hang', bin: 'xhang', body: 'setTimeout(() => {}, 60_000)\n' },
  ]
  for (const c of cases) write(c.id, c.bin, c.body)
  const registry = `export const GENERATED_NODE_CLI_REGISTRY = [\n${cases
    .map((c) => `  { id: "${c.id}", packageName: "@fixture/${c.id}", bin: "${c.bin}", description: "d" },`)
    .join('\n')}\n  { id: "missing", packageName: "@fixture/missing", bin: "xmissing", description: "d" },\n]\n`
  const rows = judgeAll({ pluginsDir: dir, registryText: registry, timeoutMs: 3_000 })
  const byId = Object.fromEntries(rows.map((row) => [row.id, row.state]))
  const problems = []
  if (byId.good !== 'ok') problems.push(`夹具 good 期望 ok，实际 ${byId.good} ⇒ 真能跑的 bin 被判成坏`)
  if (byId.silent !== 'no-name') problems.push(`夹具 silent 期望 no-name，实际 ${byId.silent} ⇒ 只会印 "ok" 的桩被当成面`)
  if (byId.crash !== 'rc') problems.push(`夹具 crash 期望 rc，实际 ${byId.crash} ⇒ 退码非 0 的 bin 没被抓到`)
  if (byId.hang !== 'timeout') problems.push(`夹具 hang 期望 timeout，实际 ${byId.hang} ⇒ 卡住的 --help 会被放过去`)
  if (byId.missing !== 'no-artifact') problems.push(`夹具 missing 期望 no-artifact，实际 ${byId.missing} ⇒ 缺产物被静默跳过 = 没有输入的尺`)
  if (rows.length !== cases.length + 1) problems.push(`读了 ${rows.length} 条，期望 ${cases.length + 1} 条 ⇒ 生成物里有行没被解析到`)
  rmSync(dir, { recursive: true, force: true })
  for (const problem of problems) console.error(`  × ${problem}`)
  if (problems.length > 0) process.exit(1)
  console.log(`check-cli-face --self-check OK（${cases.length + 1} 条夹具：好的放行、桩的拦下、崩的拦下、卡住的拦下、缺产物的拦下）`)
  process.exit(0)
}

const argOf = (flag) => {
  const at = process.argv.indexOf(flag)
  return at >= 0 ? process.argv[at + 1] : undefined
}

if (!existsSync(REGISTRY)) {
  console.error(`  × 生成表不在 ${REGISTRY} ⇒ 先 \`node scripts/gen-cli-registry.mjs\`；没有输入的尺不报绿`)
  process.exit(1)
}
const onlyArg = argOf('--only')
const timeoutArg = argOf('--timeout')
const rows = judgeAll({
  pluginsDir: join(ROOT, 'plugins'),
  registryText: readFileSync(REGISTRY, 'utf8'),
  timeoutMs: timeoutArg === undefined ? DEFAULT_TIMEOUT_MS : Number(timeoutArg),
  only: onlyArg === undefined ? null : onlyArg.split(',').map((name) => name.trim()).filter(Boolean),
})
if (onlyArg !== undefined && rows.length === 0) {
  console.error(`  × --only ${onlyArg} 在生成表里一条都没筛到 ⇒ 筛空了不该报绿`)
  process.exit(1)
}
const bad = rows.filter((row) => row.state !== 'ok')
console.log(`check-cli-face: 逐条跑 --help，${rows.length} 个 bin（判据：产物在、rc=0、输出里有自己的 bin 名）`)
for (const row of rows) console.log(`  ${row.state === 'ok' ? '✓' : '×'} ${row.id.padEnd(10)} ${row.bin.padEnd(11)} ${row.state}${row.note ? ` — ${row.note}` : ''}`)
if (bad.length > 0) {
  console.error(`check-cli-face: FAIL（${bad.length} 条起不来或没有面）`)
  process.exit(1)
}
console.log('注册表里每一条都真跑得起来')
