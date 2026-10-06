/**
 * 内核保真尺：搬进来的 `core.ts` 与 noxide 基线那份，**剥掉空白与注释之后**只许差在申报过的东西上。
 *
 * 为什么不能只看行数或 `diff -u`：上游那份文件里有几条 200+ 字符的单行（接口成员清单），
 * 搬过来换行之后 `diff` 会把整行算成"删了又加"，看起来像改了 24 行逻辑。
 * 反过来，"看起来只改了 import"也不等于没改逻辑。所以这把尺做的是**归一化比较**：
 * 去注释、把空白压成单个空格，再看剩下的差异落在哪几个字符上。
 *
 * 自动放行的差异只有这几类（都是本仓的形状，不是行为）：
 *  1. import 说明符的**文本**（`@xiranite/...` → 相对路径、`.js` → `.ts`），条数与顺序不许动；
 *  2. `| undefined`（本仓 `tsconfig.base.json` 开了 `exactOptionalPropertyTypes`，
 *     上游 `tsconfig.app.json` 只有 `strict`）；
 *  3. 未用到形参的 `_` 前缀（本仓开了 `noUnusedParameters`）；
 *  4. 非空断言 `!`（上游自己也写了若干条，所以两侧一起抹才是对称比较）；
 *  5. 注释与空白（归一化掉的）。
 *
 * 其余差异一律红，**除非**它在 `docs/port/verbatim-deltas.json` 里逐条申报过：
 * 申报条目记的是**本仓那份文件的 sha256**，所以"申报"不是买一张长期通行证——
 * 文件之后再动一个字符（哪怕只是注释），指纹就对不上，这条重新变红，必须重新读差异再申报。
 * 这一档和 `docs/port/xaihi-deltas.json` 对 UI 搬运文件做的是同一件事，只是判据换成了"两侧比对结果"。
 * 典型该申报的形状：`Required<T>` 在 `exactOptionalPropertyTypes` 下仍然允许 `undefined`，
 * 于是本仓写成 `{ [K in keyof Required<T>]: NonNullable<T[K]> }`——它是类型层的让步，不是逻辑改动。
 *
 * 用法：
 *   node scripts/check-verbatim.mjs                     # 全部已迁包
 *   node scripts/check-verbatim.mjs --only logx,sleept  # 只量几个
 *   node scripts/check-verbatim.mjs --declare gifu --reason "…为什么这处差异是本仓形状…"
 *                                                       # 读过半截文本之后才许申报；不读就申报是本尺最坏的用法
 *   node scripts/check-verbatim.mjs --self-check        # 阳性对照：改一个字符必须红、申报必须可失效
 *
 * 这把尺**同时管覆盖**：基线有 `src/core.ts` 而本仓没有 ⇒ 红（"内核没搬"），
 * 而不是像早先那样按"两侧都存在"过滤掉，让一个没搬内核的包安静地从统计里消失。
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = resolve(import.meta.dirname, '..')
const BASELINE = '/Users/glow/Base/Code/Freya/.scratch/xiranite-noxide/packages/nodes'
const LEDGER_PATH = join(ROOT, 'docs', 'port', 'verbatim-deltas.json')

const strip = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/.*$/gm, ' ')
const squash = (text) => strip(text).replace(/\s+/g, ' ').trim()

/** 差异是否只落在自动放行的几类上：拿掉它们之后两侧必须完全相等。 */
function canonical(text) {
  return text
    .replace(/\s*\|\s*undefined/g, '')
    // 说明符的**文本**不是判据（本仓把它换成相对路径与 `.ts` 后缀是形状），
    // 但它的**存在与位置**是：一律抹成 `from ""`，改不动 import 的条数与顺序。
    .replace(/from[ \t]*["'][^"']*["']/g, 'from ""')
    .replace(/(?:import|require)\([ \t]*["'][^"']*["']\)/g, 'import("")')
    // 上游没开的 `noUnusedParameters` 逼出来的让步：本仓把**没用到**的形参加 `_` 前缀。
    // 这不是"随便改名都放行"——改到一个**用得到**的标识符上就编译不过，所以这条洞的另一半由 tsc 守。
    .replace(/\b_(?=[A-Za-z])/g, '')
    // 非空断言 `x!` / `f(a)!` / `arr[i]!`。上游自己就写了若干条（见 `plugins/mvz` 的文件头），
    // 所以两侧一起抹掉才是对称比较，而不是只放行本仓新增的那几个。`!==` 不受影响。
    .replace(/([A-Za-z0-9_$)\]])!(?!=)/g, '$1')
    .replace(/\s+/g, ' ')
}

export function compareFiles(baselineText, oursText) {
  const a = squash(baselineText)
  const b = squash(oursText)
  if (canonical(a) === canonical(b)) return { ok: true, a, b, residue: '' }
  const ca = canonical(a)
  const cb = canonical(b)
  // 找出第一个不相等的位置，两侧各给一段上下文，便于人直接读。
  let at = 0
  while (at < Math.min(ca.length, cb.length) && ca[at] === cb[at]) at += 1
  return {
    ok: false,
    a,
    b,
    residue: `第 ${at} 个字符起不等\n    上游 …${ca.slice(Math.max(0, at - 50), at + 90)}…\n    本仓 …${cb.slice(Math.max(0, at - 50), at + 90)}…`,
  }
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex')

/** 台账：`"plugins/<id>/src/core.ts" → { reason, ours }`；文件不在就当空表（首建）。 */
export function readLedger() {
  try {
    const json = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))
    return json.deltas ?? {}
  } catch {
    return {}
  }
}

/**
 * 一份内核的判决。`kind` 四档：
 * - `ok` 只差在自动放行的形状上；
 * - `declared` 有差异，但台账里那条申报的 `ours` 指纹与这份文件**当前内容**对上了；
 * - `stale` 申报还在、差异却已经消失（或文件被改过）⇒ 这条申报是张空通行证，判红逼人来收；
 * - `red` 没申报的差异，或"基线有内核而本仓没有"这一类覆盖缺口。
 */
export function verdict({ baselineText, oursText, entry, label = 'core.ts' }) {
  const key = label
  const compared = oursText === undefined || baselineText === undefined
    ? null
    : compareFiles(baselineText ?? '', oursText ?? '')

  if (compared && compared.ok) {
    // 差异不存在却还留着申报 ⇒ 台账里那条已经不起作用了；留着它就等于给下一次改动预先放行。
    if (entry) return { kind: 'stale', residue: `申报还在台账里，但这份已与基线等价 ⇒ 请把那条申报删掉（否则它是一张空通行证）` }
    return { kind: 'ok', residue: '' }
  }

  if (entry) {
    const oursSha = sha256(oursText ?? '')
    if (oursSha === entry.ours) {
      return { kind: 'declared', residue: `${key}：申报过的差量（${entry.reason}）` }
    }
    return {
      kind: 'red',
      residue: `${key}：申报的指纹对不上（台账记 ${entry.ours?.slice(0, 12)}…，现读 ${oursSha.slice(0, 12)}…）`
        + `⇒ 文件在申报之后又改过，必须重新读差异再申报\n    ${(compared?.residue ?? '').replace('\n', '\n    ')}`,
    }
  }

  if (compared) return { kind: 'red', residue: `${key} 与基线不止差在自动放行的形状上：\n    ${compared.residue}` }
  return { kind: 'red', residue: `${key}：基线有这一份，本仓没有 ⇒ 没搬` }
}

/** 现读 `plugins/*` 的内核覆盖情况；两侧都没有内核的包单列，不静默消失。 */
export function kernelCensus() {
  const plugins = join(ROOT, 'plugins')
  const ids = readdirSync(plugins, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
  return ids.map((id) => {
    const rel = `plugins/${id}/src/core.ts`
    const oursPath = join(ROOT, rel)
    const basePath = join(BASELINE, id, 'src/core.ts')
    return {
      id,
      rel,
      oursPath,
      basePath,
      oursExists: existsSync(oursPath),
      baseExists: existsSync(basePath),
      // 申报键允许带别的文件（如 `plugins/sleept/src/interaction.ts`），由 --declare 的 --file 决定。
      entry: readLedger()[rel],
    }
  })
}


/** 内核文件名单：默认比每包 `src/core.ts`（对 noxide），名单把它扩到界面叶子。 */
export const KERNEL_FILES_PATH = join(ROOT, 'docs', 'port', 'kernel-files.json')

export function readKernelFiles() {
  try {
    return JSON.parse(readFileSync(KERNEL_FILES_PATH, 'utf8'))
  } catch {
    return { baselines: {}, compared: [], authored: { names: [], files: {} } }
  }
}

/**
 * 名单里申报的每一份"要比的额外文件"变成判决行。
 * 三条判据都是会红的：本仓没有这份文件（申报了却没搬）、基线那一版没有这份文件
 * （申报错版了）、以及它出现在 authored 名单里（同一份文件不能既"逐字比"又"本仓自己的形状"）。
 */
export function rowsFromLedger({ ledger, root = ROOT, pluginsDir = join(root, 'plugins') }) {
  const rows = []
  const ledgerPath = join(pluginsDir, '..', 'docs')
  const authoredFiles = new Set(Object.keys(ledger.authored?.files ?? {}))
  for (const entry of ledger.compared ?? []) {
    const oursPath = join(root, entry.file)
    const baseDir = ledger.baselines?.[entry.baseline]
    const relParts = entry.file.split('/')
    const id = relParts[1]
    const name = relParts[relParts.length - 1]
    const basePath = baseDir ? join(baseDir, id, 'src', name) : undefined
    rows.push({
      id,
      name,
      rel: entry.file,
      oursPath,
      basePath,
      oursExists: existsSync(oursPath),
      baseExists: Boolean(basePath) && existsSync(basePath),
      declared: true,
      authored: authoredFiles.has(entry.file),
      entry: (ledger.deltasLookup ? ledger.deltasLookup(entry.file) : undefined) ?? undefined,
      ledgerPath,
    })
  }
  return rows
}

if (process.argv.includes('--self-check')) {
  const NL = '\n'
  const clean = 'export function f(x: string): string {\n  return x.trim()\n}\n'
  const dirtyOurs = clean.replace('x.trim()', 'x.toLowerCase()')
  const declaredEntry = { key: 'core.ts', reason: '夹具：本仓换成小写是形状（假设为真，只为测尺）', ours: sha256(dirtyOurs) }
  const cases = [
    { name: '原样', base: clean, ours: clean, entry: undefined, expect: 'ok' },
    { name: '只加 "| undefined"', base: clean, ours: clean.replace('x: string', 'x: string | undefined'), entry: undefined, expect: 'ok' },
    { name: '改了逻辑（trim → toLowerCase）且没申报', base: clean, ours: dirtyOurs, entry: undefined, expect: 'red' },
    { name: '改了逻辑但申报过、指纹对得上', base: clean, ours: dirtyOurs, entry: declaredEntry, expect: 'declared' },
    // 这条是台账的阳性对照：申报之后文件再动一个字符，必须重新变红。
    { name: '申报之后文件又改了', base: clean, ours: `${dirtyOurs} `, entry: declaredEntry, expect: 'red' },
    { name: '申报还在但差异已消失', base: clean, ours: clean, entry: declaredEntry, expect: 'stale' },
    { name: '本仓缺这份内核', base: clean, ours: undefined, entry: undefined, expect: 'red' },
    { name: '删了一条分支', base: clean, ours: clean.replace('  return x.trim()\n', ''), entry: undefined, expect: 'red' },
    { name: '换了 import 说明符', base: `import { z } from "@xiranite/shared"` + NL + clean, ours: `import { z } from "./contract.ts"` + NL + clean, entry: undefined, expect: 'ok' },
    { name: '多加一条 import', base: `import { z } from "@xiranite/shared"` + NL + clean, ours: `import { z } from "./contract.ts"` + NL + `import { q } from "./other.ts"` + NL + clean, entry: undefined, expect: 'red' },
    { name: '索引访问加非空断言', base: 'const a = arr[0].x\n', ours: 'const a = arr[0]!.x\n', entry: undefined, expect: 'ok' },
    { name: '把 !== 改成 !=（真改逻辑）', base: 'if (x !== y) f()\n', ours: 'if (x != y) f()\n', entry: undefined, expect: 'red' },
    { name: '未用到的形参加下划线', base: clean, ours: clean.replace('x: string', '_x: string').replace('x.trim()', '_x.trim()'), entry: undefined, expect: 'ok' },
  ]
  const problems = []
  for (const c of cases) {
    const got = verdict({ baselineText: c.base, oursText: c.ours, entry: c.entry }).kind
    if (got !== c.expect) problems.push(`夹具 "${c.name}" 期望 ${c.expect}，实际 ${got} ⇒ 这把尺看不见它声称的东西`)
  }
  // 覆盖 census 的那半：一个只造出来的目录形状不该被读成"绿"。
  if (kernelCensus().length === 0) problems.push('kernelCensus() 数为 0 ⇒ 本仓 plugins/ 读空，这把尺没有输入')
  {
    // 内核文件名单那一族的阳性对照：三种"申报与树不符"都必须在行级被拦下。
    // 少比一份文件的症状是"全绿"，比一条红更难发现，所以这三条不是锦上添花。
    const dir = mkdtempSync(join(tmpdir(), 'xaihi-kernel-rows-'))
    const pluginsDir = join(dir, 'plugins')
    const baseDir = join(dir, 'base-ui')
    mkdirSync(join(pluginsDir, 'kp', 'src'), { recursive: true })
    mkdirSync(join(baseDir, 'kp', 'src'), { recursive: true })
    writeFileSync(join(baseDir, 'kp', 'src', 'leaf.ts'), clean)
    writeFileSync(join(pluginsDir, 'kp', 'src', 'leaf.ts'), dirtyOurs)
    writeFileSync(join(pluginsDir, 'kp', 'src', 'gone.ts'), clean)
    const fakeLedger = {
      baselines: { ui: baseDir },
      compared: [
        { file: 'plugins/kp/src/leaf.ts', baseline: 'ui' },
        { file: 'plugins/kp/src/missing.ts', baseline: 'ui' },
        { file: 'plugins/kp/src/notinbase.ts', baseline: 'ui' },
        { file: 'plugins/kp/src/authored.ts', baseline: 'ui' },
      ],
      authored: { names: [], files: { 'plugins/kp/src/authored.ts': '两份名单都写了' } },
    }
    const rrows = rowsFromLedger({ ledger: fakeLedger, root: dir, pluginsDir })
    if (rrows.length !== 4) problems.push(`rowsFromLedger 造了 ${rrows.length} 行，期望 4 行`)
    const byFile = Object.fromEntries(rrows.map((row) => [row.rel.split('/').pop(), row]))
    if (byFile['leaf.ts']?.oursExists !== true || byFile['leaf.ts']?.baseExists !== true) problems.push('leaf.ts 没被认成"两侧都在" ⇒ 名单行根本没进比较')
    if (byFile['missing.ts']?.oursExists !== false) problems.push('本仓缺的那份没被标 oursExists=false ⇒ "申报了却没搬"看不见')
    if (byFile['notinbase.ts']?.baseExists !== false) problems.push('基线缺的那份没被标 baseExists=false ⇒ 版本记错了看不见')
    if (byFile['authored.ts']?.authored !== true) problems.push('同时挂在 authored 里的份没被标出来 ⇒ compared 与 authored 打架无人管')
    const lrow = byFile['leaf.ts']
    const lverdict = verdict({ baselineText: readFileSync(lrow.basePath, 'utf8'), oursText: readFileSync(lrow.oursPath, 'utf8'), label: lrow.rel })
    if (lverdict.kind !== 'red') problems.push(`叶子差异被判成 ${lverdict.kind} ⇒ 名单行没有真的在比`)
    if (!lverdict.residue.includes('plugins/kp/src/leaf.ts')) problems.push('叶子的红没点名是哪份文件 ⇒ 读数无法归位')
    rmSync(dir, { recursive: true, force: true })
  }
  for (const problem of problems) console.error(`  × ${problem}`)
  if (problems.length > 0) process.exit(1)
  console.log(`check-verbatim --self-check OK（${cases.length} 条夹具：改逻辑必须红、申报可失效、申报过时也算红）`)
  process.exit(0)
}

const argOf = (flag) => {
  const at = process.argv.indexOf(flag)
  return at >= 0 ? process.argv[at + 1] : undefined
}

if (!existsSync(BASELINE)) {
  console.error(`  × check-verbatim: 基线不在 ${BASELINE}（noxide worktree）⇒ 一把没有输入的尺不该报绿。`
    + `先 \`git -C <Xiranite> worktree add ${BASELINE} ccf465fe\` 再来跑这条。`)
  process.exit(1)
}

// `--declare` 是**人读了半截文本之后**才该敲的一步：它打印将要写进台账的 residue，并要求 --reason 非空。
const declareId = argOf('--declare')
if (declareId) {
  const reason = argOf('--reason')
  if (!reason || reason.trim() === '') {
    console.error('  × --declare 必须带 --reason "为什么这处差异是本仓形状而不是逻辑改动"；没有理由的申报等于白名单。')
    process.exit(1)
  }
  const rel = argOf('--file') ?? `plugins/${declareId}/src/core.ts`
  const oursPath = join(ROOT, rel)
  const basePath = join(BASELINE, declareId, 'src', rel.split('/src/')[1] ?? 'core.ts')
  if (!existsSync(oursPath) || !existsSync(basePath)) {
    console.error(`  × --declare 要两侧都在：本仓 ${rel}=${existsSync(oursPath)}，基线 ${basePath}=${existsSync(basePath)}`)
    process.exit(1)
  }
  const oursText = readFileSync(oursPath, 'utf8')
  const compared = compareFiles(readFileSync(basePath, 'utf8'), oursText)
  if (compared.ok) {
    console.error(`  × ${rel} 与基线本来就等价，申报它是给自己留一张空通行证。`)
    process.exit(1)
  }
  console.log(`将申报的差异（读它，别跳过）：\n    ${compared.residue.replace(/\n/g, '\n    ')}`)
  const json = { schemaVersion: 1, note: '', deltas: {} }
  if (existsSync(LEDGER_PATH)) Object.assign(json, JSON.parse(readFileSync(LEDGER_PATH, 'utf8')))
  json.deltas[rel] = { reason, ours: sha256(oursText), declaredAt: new Date().toISOString().slice(0, 16) }
  writeFileSync(LEDGER_PATH, `${JSON.stringify(json, null, 2)}\n`)
  console.log(`已写台账：${rel} → sha256 ${sha256(oursText).slice(0, 16)}…（文件再动一个字符就重新变红）`)
  process.exit(0)
}

const onlyFlag = argOf('--only')
const only = onlyFlag === undefined ? null : onlyFlag.split(',')
const kernelLedger = readKernelFiles()
const ledger = readLedger()
// 名单行共用同一份差异台账：申报的键就是仓库相对路径，与 core.ts 那条同一机制。
for (const row of rowsFromLedger({ ledger: kernelLedger })) {
  if (row.declared) row.entry = ledger[row.rel]
}
const census = [...kernelCensus(), ...rowsFromLedger({ ledger: kernelLedger })]
  .filter((row) => only === null || only.includes(row.id))

const counts = { ok: 0, declared: 0, red: 0, stale: 0, none: 0 }
const failures = []
for (const row of census) {
  if (!row.baseExists && !row.oursExists) {
    counts.none += 1
    continue
  }
  if (row.declared && row.authored) {
    failures.push(`${row.rel}：同时出现在 compared 与 authored 两份名单里 ⇒ 同一文件不能既"逐字比"又"本仓自己的形状"`)
    counts.red += 1
    continue
  }
  if (row.declared && !row.oursExists) {
    failures.push(`${row.rel}：名单申报了要比，但本仓没有这份文件 ⇒ 申报与树不符（搬了就该在，没搬就不该申报）`)
    counts.red += 1
    continue
  }
  if (row.declared && !row.baseExists) {
    failures.push(`${row.rel}：名单申报了要比，但申报的那一版基线里没有这份（${row.basePath ?? '?'}）⇒ 版本记错了`)
    counts.red += 1
    continue
  }
  const baselineText = row.baseExists ? readFileSync(row.basePath, 'utf8') : undefined
  const oursText = row.oursExists ? readFileSync(row.oursPath, 'utf8') : undefined
  // 键按"实际比的那份文件"取，申报可以指到同包别的内核文件（sleept 的 interaction.ts 之类）。
  const entry = row.entry ?? ledger[row.rel]
  const result = verdict({ baselineText, oursText, entry, label: row.rel })
  counts[result.kind] += 1
  if (result.kind === 'red' || result.kind === 'stale') failures.push(result.residue)
  if (result.kind === 'declared') console.log(`  · ${result.residue}`)
}

console.log(`check-verbatim: 覆盖 ${census.length} 份文件（跨 ${new Set(census.map((row) => row.id)).size} 个包）——`
  + `绿 ${counts.ok}、申报 ${counts.declared}、两侧都空 ${counts.none}、红 ${counts.red + counts.stale}`
  + `；基线 = noxide ccf465fe 加名单申报的那一版`)
if (counts.none > 0) console.log(`  · 两侧都没有对应物的条目 ${counts.none} 份（空 ≠ 漏搬，但这条要看得见）`)
if (failures.length > 0) {
  for (const failure of failures) console.error(`  × ${failure}`)
  process.exit(1)
}
console.log('所有内核与基线的差异，要么只在自动放行的形状上，要么逐条申报过且指纹仍然对得上')
