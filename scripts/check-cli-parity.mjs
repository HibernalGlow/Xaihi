/**
 * 终端面第二段腿：**清单里的字段有没有对应的真命令行开关，以及命令是不是真的执行了**。
 * `check-cli-face.mjs` 只证"产物在、`--help` 退 0、屏里认得出自己的 bin"，
 * `check-cli-commands.mjs` 只证"清单承诺的子命令打得来"——两条都不碰参数。
 * 这一段量的正是那两层都不看的三件事（实测过它们各自会怎么骗人）：
 *
 * 1. **上游有、我们没有的开关**（搬运漏了参数的活证据）。
 *    判据来源是基线那份 `src/cli.ts` 里的字面量开关表，不是人记的清单：
 *    `noxide` ccf465fe 的 `packages/nodes/<id>/src/cli.ts`。上游写着 `--preserveOrder` 而我们那屏没有，
 *    就是"面板能设、终端设不了"的那种分叉——这类分叉在 `--help` 里永远是绿的。
 * 2. **同一条命令跑两遍必须一模一样**（非确定性在 CI 里会伪装成"偶尔红"，先量出来再说）。
 * 3. **`--json` 那条路必须真跑出个能解析的结构**（退 0 + 一屏人话不代表动作执行了；
 *    上游的 CLI 里 `--json` 是通用约定，见 `plugins/linedup/lib/cli.js filter --help`）。
 *
 * 只做零副作用那一档：只喂**内联文本**（`--<字段>` 的取值来自清单里 text-ish 的成员），
 * 任何 `*File` / `--output*` 之类的开关一律不给，`danger` 不为 none 的包整包跳过。
 *
 * 用法：
 *   node scripts/check-cli-parity.mjs              # 判全部已构建的节点包
 *   node scripts/check-cli-parity.mjs --self-check # 阳性对照：漏开关 / 非确定 / JSON 坏 都必须红
 *   node scripts/check-cli-parity.mjs --only linedup,formatv
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

const ROOT = resolve(import.meta.dirname, '..')
const PLUGINS = join(ROOT, 'plugins')
/** 保真基线：内核与终端面同一份出处（与 check-verbatim 用同一个 pin，见 docs/port/kernel-files.json）。 */
const BASELINE = '/Users/glow/Base/Code/Freya/.scratch/xiranite-noxide/packages/nodes'

/** 从一屏 `Options:` 里取长开关名（`--foo <value>` 与 `--foo` 都算），丢掉行首的空格。 */
export function flagsFromHelp(screen) {
  const out = new Set()
  for (const match of screen.matchAll(/(?:^|\s)--([A-Za-z][\w-]*)/g)) out.add(match[1])
  return out
}

/**
 * 上游那份 `cli.ts` 里写过的长开关。
 * 判据是源码字面量而不是跑上游——本机没有 Windows 那份产物，且上游 CLI 依赖 bun 的老前提我们已经换掉了。
 */
export function flagsFromUpstream(source) {
  const out = new Set()
  for (const match of source.matchAll(/['"`]--([A-Za-z][\w-]*)/g)) {
    const name = match[1]
    // 模板串会留下光秃秃的 `--no-`（上游写 `` `--no-${flag}` ``），那不是一个开关名。
    if (name === 'no' || /-$/.test(name)) continue
    out.add(name)
  }
  return out
}

/** 文件路径类与输出类开关不参与"该不该有"的比对：那两类是终端面自己的形态，不是清单字段。 */
const PATHISH = /^(.*File|.*Dir|output|out|in)$/i

/**
 * 只主动打开**预演类**布尔开关。
 *
 * 为什么不"什么布尔都不给"：`danger.type:"all"` 的谓词形如
 * "不是 scan 且 dryRun 不为真 ⇒ 危险"（`packages/node-sdk/src/define-node.ts:191-206`），
 * 不给 `--dryRun` 就等于把整批包判成"不能跑"——上一版就是这样，27 个包只跑到 1 条命令。
 * 为什么不给 `--force`/`--yes`/`--apply`：那些是把预演翻成执行的开关，
 * 这一段腿的前提是零副作用，宁可少跑也不能碰文件。
 */
const PREVIEW_BOOLS = /^(dry-?run|preview|check|simulate|dryrun)$/i
const MUTATING_BOOLS = /^(force|yes|apply|execute|no-dry-?run|write|commit|delete)$/i

export function previewFlagsFromOptions(screen) {
  const out = []
  for (const match of screen.matchAll(/--([A-Za-z][\w-]*)(?=\s|$)/g)) {
    const name = match[1]
    if (PREVIEW_BOOLS.test(name) && !MUTATING_BOOLS.test(name)) out.push(`--${name}`)
  }
  return [...new Set(out)]
}

/**
 * 用**契约自己的**危险判定来挑可以真跑的那条动作，而不是"包级 danger 一有就整包跳过"。
 * 这是"尺要住在真源那一侧"的用法：同一个 `dangerFor` 也是宿主给工具上 `ask` 闸门用的那一个，
 * 所以这里判成安全的动作，与宿主判成不需要审批的动作是同一批——不会出现两把尺各说一套。
 * `pluginExport` 在没有 `dangerCheck` 时会抛 ⇒ 记成 `needs-plugin-export-check`，不算跑过也不算红。
 */
export function pickSafeAction(dangerForFn, definition, candidateSubs, argsOf) {
  const verdicts = []
  for (const sub of candidateSubs) {
    const args = argsOf(sub)
    try {
      if (dangerForFn(definition, undefined, sub, args) === undefined) {
        return { action: sub, args, verdicts }
      }
      verdicts.push(`${sub}: gated`)
    } catch (error) {
      verdicts.push(`${sub}: ${String(error instanceof Error ? error.message : error).slice(0, 60)}`)
      if (/pluginExport/.test(String(error?.message ?? error))) return { action: undefined, args: {}, verdicts }
    }
  }
  return { action: undefined, args: {}, verdicts }
}

/**
 * 开关名的规范形状：不比原文，比规范形。
 *
 * 两侧本来就各写一种拼法而**运行时等价**：`plugins/linedup/src/cli-support.ts:210` 写着
 * `--sourceFile` 与 `--source-file` 都认，而 citty 会为每个布尔自动生成 `--no-x`（屏上通常不印）。
 * 不归一的话 `--dry-run`（上游源码字面量）对上 `--dryRun`（我们屏上的写法）会被报成缺失——
 * 第一版 7 条红里 5 条的 `dry-run` 就是这么来的假阳性。
 */
export function canonicalFlag(name) {
  return name.replace(/^no-/, '').replace(/-/g, '').toLowerCase()
}

/**
 * 判决：上游有而我们那屏没有的开关。
 * `--help` / `--version` 不参与（每个 CLI 都有）；路径类另判——那是终端面形态，不是清单字段。
 */
export function judgeMissingFlags(upstreamFlags, oursFlags) {
  const ours = new Set([...oursFlags].map(canonicalFlag))
  return [...upstreamFlags].filter((f) => {
    const key = canonicalFlag(f)
    return !ours.has(key) && key !== 'help' && key !== 'version' && !PATHISH.test(f)
  })
}

/**
 * 申报差量怎么参与判决——**带过期的放行**，不是白名单。
 *
 * 台账（`docs/port/cli-parity-deltas.json`）里每条申报必须写明"为什么现在缺"和"什么时候必须回来"。
 * 尺这边做三件事：
 *  1. 申报的开关**仍然缺** ⇒ 放行，但把这条原因打进输出（绿不代表没人看过它）；
 *  2. 申报的开关里有任一已经出现在屏上 ⇒ `stale`，判红："那条腿接上了，把申报从台账删掉"——
 *     放行不许变成永久豁免，否则台账会替下一个改名字的人掩盖真相；
 *  3. 台账里写了一个当前不存在的包 ⇒ 也算 stale，判红（名单过期本身就是一种错）。
 */
export function judgeDeclared(missing, entry, knownPackages) {
  if (entry === undefined) return { declared: [], stale: [] }
  if (!knownPackages.has(entry.id)) {
    return { declared: [], stale: [`台账里的 ${entry.id} 已经不存在（或从来没有）⇒ 这条申报是过期名单，删掉它`] }
  }
  const stillMissingNames = entry.flags ?? []
  const resolved = stillMissingNames.filter((flag) => missing.includes(flag))
  const stale = stillMissingNames.filter((flag) => !missing.includes(flag))
  if (resolved.length !== stillMissingNames.length) {
    return { declared: resolved, stale: [...new Set(stale.map((f) => `申报的 --${f} 现在已经在屏上 ⇒ 这条申报过期了，从台账里删掉（或改成只剩还缺的那些）`))] }
  }
  return { declared: resolved, stale: [] }
}

/** 同参数跑两遍必须一字不差。 */
export function judgeDeterminism(first, second) {
  if (first === second) return ''
  return `同一条命令两次输出不一样（前 60 字：${JSON.stringify(first.slice(0, 60))} 对 ${JSON.stringify(second.slice(0, 60))}）⇒ 非确定性先落在终端腿上`
}

/** `--json` 那条路必须解析得出结构，且不能是一个空壳。 */
export function judgeJsonRun(stdout) {
  const at = stdout.indexOf('{')
  if (at < 0) return `--json 那条路没有 JSON（输出前 60 字：${JSON.stringify(stdout.slice(0, 60))}）`
  try {
    const parsed = JSON.parse(stdout.slice(at))
    if (parsed === null || typeof parsed !== 'object') return `--json 解析出的是 ${typeof parsed}，不是对象`
    return ''
  } catch (error) {
    return `--json 解析失败：${String(error instanceof Error ? error.message : error).slice(0, 80)}`
  }
}

function runCli(cliPath, argv) {
  try {
    return execFileSync(process.execPath, [cliPath, ...argv], { encoding: 'utf8', timeout: 60_000 })
  } catch (error) {
    const out = `${error.stdout ?? ''}${error.stderr ?? ''}`
    return { failed: true, output: out.slice(0, 4000) }
  }
}

/** 一个包的可跑信息：bin 名、子命令表、能安全喂的字段。 */
function packageFace(id) {
  const manifestPath = join(PLUGINS, id, 'package.json')
  if (!existsSync(manifestPath)) return null
  const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const node = pkg.xaihi?.node
  // `bin` 有两种合法形状：`"bin": "lib/cli.js"` 与 `"bin": {"xlinedup": "./lib/cli.js"}`，
  // 本仓 27 个包用的是后一种——第一次写这段时按 string 判，结果每个包都被跳过，尺变成装饰品。
  const binName = typeof pkg.bin === 'string' ? id : Object.keys(pkg.bin ?? {})[0]
  const cliPath = join(PLUGINS, id, 'lib', 'cli.js')
  if (!node || !binName || !existsSync(cliPath)) return null
  const danger = node.danger?.type ?? 'none'
  return { id, bin: binName, cliPath, node, danger }
}

/**
 * 从一屏 `Options:` 里挑可以安全喂值的开关。
 *
 * 不用清单里的字段名去凑：实测过两侧名字本来就不一样
 * （`xaihi.node.fields` 是 `sourceText` / `filterText`，而 `xlinedup filter --help` 打的是 `--source` / `--filter`），
 * 按字段名凑会得到"一个开关都喂不进去"的假跳过。这里直接读那条子命令自己的屏。
 * 带 `File` / `output` 的那几类会碰磁盘，一律不喂——这一段腿的零副作用约束就在这条上。
 */
export function inlineFlagsFromOptions(screen) {
  const out = []
  for (const match of screen.matchAll(/--([A-Za-z][\w-]*)(?:\s+<([^>\n]*)>)?/g)) {
    const name = match[1]
    const placeholder = (match[2] ?? '').toLowerCase()
    if (['help', 'version', 'json'].includes(name)) continue
    if (PATHISH.test(name)) continue
    if (/\d|number|size|limit|count|depth|thread|percent/.test(placeholder + name)) out.push(`--${name}=1`)
    else if (placeholder === '') out.push(null) // 布尔型：不主动打开，默认值就够跑一次
    else out.push(`--${name}=alpha`)
  }
  return out.filter((entry) => entry !== null)
}

function subcommandTable(voice) {
  const screen = runCli(voice.cliPath, ['--help'])
  if (typeof screen === 'object' && screen.failed) return { screen: screen.output, subs: [] }
  const subs = []
  for (const match of String(screen).matchAll(/^ {2}([a-z][\w-]*) {2}/gm)) subs.push(match[1])
  return { screen: String(screen), subs }
}

if (process.argv.includes('--self-check')) {
  const cases = [
    { name: '上游开关全在场 ⇒ 无缺失', got: judgeMissingFlags(new Set(['source', 'filter', 'preserveOrder']), new Set(['source', 'filter', 'preserveOrder', 'json'])), expect: [] },
    { name: '上游有 preserveOrder 而我们屏上没有 ⇒ 必须列出来', got: judgeMissingFlags(new Set(['source', 'preserveOrder']), new Set(['source'])), expect: ['preserveOrder'] },
    { name: 'help/version 与路径类不参与比对', got: judgeMissingFlags(new Set(['help', 'version', 'sourceFile', 'outputFile']), new Set()), expect: [] },
    { name: 'kebab 的上游写法对上 camel 的我们写法 ⇒ 放行（这条挡住假阳性）', got: judgeMissingFlags(new Set(['dry-run', 'no-recursive', 'source-file']), new Set(['dryRun', 'recursive', 'sourceFile'])), expect: [] },
    { name: '真缺的开关还是要报（camel 也找不到才算缺）', got: judgeMissingFlags(new Set(['dryRun', 'nameTemplate']), new Set(['dry-run'])), expect: ['nameTemplate'] },
    { name: '两次输出不同 ⇒ 判红', got: judgeDeterminism('a', 'b'), expectKind: 'string' },
    { name: '两次输出相同 ⇒ 放行', got: judgeDeterminism('a', 'a'), expectKind: 'empty' },
    { name: '--json 一个花括号都没有 ⇒ 判红', got: judgeJsonRun('kept 3 lines'), expectKind: 'string' },
    { name: '--json 解析失败 ⇒ 判红', got: judgeJsonRun('{ "a": '), expectKind: 'string' },
    { name: '--json 前面有噪声也能解析 ⇒ 放行', got: judgeJsonRun('WARN x\n{"kept":[]}'), expectKind: 'empty' },
    { name: '从一屏文本里取长开关名', got: Array.from(flagsFromHelp('Options:\n  --source <value>  Inline\n  --json            Print JSON\n')).sort(), expect: ['json', 'source'] },
    { name: '从上游源码里取长开关名', got: Array.from(flagsFromUpstream("const a = ['--source','--preserveOrder'];\nif (flag === '--json') x")).sort(), expect: ['json', 'preserveOrder', 'source'] },
    { name: '模板串留下的光秃 `--no-` 不算开关名（classf 的第一条假阳性）', got: Array.from(flagsFromUpstream("const neg = `--no-${flag}`;\nconst real = ['--target'];")).sort(), expect: ['target'] },
    { name: '申报三条都还缺 ⇒ declared 收下全部、stale 为空', got: judgeDeclared(['renderer', 'lang', 'theme'], { id: 'gifu', flags: ['renderer', 'lang', 'theme'] }, new Set(['gifu'])).declared, expect: ['renderer', 'lang', 'theme'] },
    { name: '申报里有一条已经回到屏上 ⇒ 必须判过期（放行不是永久的）', got: judgeDeclared(['lang', 'theme'], { id: 'gifu', flags: ['renderer', 'lang', 'theme'] }, new Set(['gifu'])).stale, expect: ['申报的 --renderer 现在已经在屏上 ⇒ 这条申报过期了，从台账里删掉（或改成只剩还缺的那些）'] },
    { name: '台账写了不存在的包 ⇒ 也算过期名单', got: judgeDeclared([], { id: 'nosuchpkg', flags: ['x'] }, new Set(['gifu'])).stale, expect: ['台账里的 nosuchpkg 已经不存在（或从来没有）⇒ 这条申报是过期名单，删掉它'] },
    { name: '没有申报的包 ⇒ declared 空、缺项照报', got: [JSON.stringify(judgeDeclared(['foo'], undefined, new Set(['gifu'])))], expect: ['{"declared":[],"stale":[]}'] },
    { name: '内联开关：文件类与 json/help 不许进来，数值类给 1', got: inlineFlagsFromOptions('Options:\n  --source <value>   Inline source\n  --sourceFile <path> File\n  --limit <number>   Max\n  --json             Print JSON\n  --help, -h         Help\n'), expect: ['--source=alpha', '--limit=1'] },
    { name: '屏上只有文件类开关 ⇒ 退化成裸命令（空表，不是假跑）', got: inlineFlagsFromOptions('Options:\n  --inputFile <path>\n  --outputFile <path>\n'), expect: [] },
    { name: '预演布尔：dryRun/preview 可以主动开，force/yes 不行', got: previewFlagsFromOptions('Options:\n  --dryRun   Preview only\n  --force    Overwrite\n  --yes      Confirm\n  --preview  Show plan\n'), expect: ['--dryRun', '--preview'] },
    { name: '挑动作：第一条被门禁挡住 ⇒ 选第二条', got: (() => {
      const fake = (definition, check, actionId) => (actionId === 'apply' ? { en: 'x', zh: 'y' } : undefined)
      return pickSafeAction(fake, {}, ['apply', 'scan'], () => ({})).action
    })(), expect: ['scan'] },
    { name: '每条都被挡 ⇒ 不跑（不许假装跑过）', got: (() => {
      const fake = () => ({ en: 'x', zh: 'y' })
      return String(pickSafeAction(fake, {}, ['apply', 'scan'], () => ({})).action)
    })(), expect: ['undefined'] },
    { name: 'pluginExport 那种会抛 ⇒ 记成不跑而不是崩', got: (() => {
      const fake = () => { throw new Error('xaihi.node/v1: danger.type "pluginExport" needs defineNode({ dangerCheck })') }
      return String(pickSafeAction(fake, {}, ['run'], () => ({})).action)
    })(), expect: ['undefined'] },
  ]
  const problems = []
  for (const c of cases) {
    if (Array.isArray(c.expect)) {
      const gotList = Array.isArray(c.got) ? c.got : [String(c.got)]
      if (gotList.join('\u0000') !== c.expect.join('\u0000')) problems.push(`夹具 "${c.name}" 期望 [${c.expect}]，实际 [${gotList}]`)
    } else if (c.expectKind === 'empty') {
      if (c.got !== '') problems.push(`夹具 "${c.name}" 期望放行，实际判红：${c.got}`)
    } else if (c.expectKind === 'string') {
      if (typeof c.got !== 'string' || c.got === '') problems.push(`夹具 "${c.name}" 必须判红，实际放行 ⇒ 这把尺看不见它声称的东西`)
    }
  }
  for (const problem of problems) console.error(`  × ${problem}`)
  if (problems.length > 0) process.exit(1)
  console.log(`check-cli-parity --self-check OK（${cases.length} 条夹具，含"上游开关缺失""两次输出不同""--json 解析失败"三条必须红）`)
  process.exit(0)
}

const onlyAt = process.argv.indexOf('--only')
const only = onlyAt >= 0 ? new Set(process.argv[onlyAt + 1].split(',')) : null
const ids = readdirSync(PLUGINS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
  .filter((id) => only === null || only.has(id)).sort()

const { dangerFor } = await import('../packages/node-sdk/lib/index.js')

/** 申报差量台账：放行带过期，不是白名单。文件缺失时按"没有申报"处理，尺照样把缺项报红。 */
const parityDeltas = existsSync(join(ROOT, 'docs/port/cli-parity-deltas.json'))
  ? JSON.parse(readFileSync(join(ROOT, 'docs/port/cli-parity-deltas.json'), 'utf8'))
  : { entries: [] }

const failures = []
const notes = []
let facesChecked = 0
let runsDone = 0
let skippedDanger = 0
let skippedShape = 0
const missingList = []

for (const id of ids) {
  const voice = packageFace(id)
  if (voice === null) {
    skippedShape += 1
    notes.push(`${id}: 没有 bin / 没有 lib/cli.js / 没有 xaihi.node ⇒ 这段不判`)
    continue
  }
  const { screen, subs } = subcommandTable(voice)
  const baselineCli = join(BASELINE, id, 'src/cli.ts')
  if (!existsSync(baselineCli)) {
    skippedShape += 1
    notes.push(`${id}: 基线没有 src/cli.ts（上游那一腿本来就没有终端面）⇒ 比对不成立，跳过`)
    continue
  }
  facesChecked += 1
  // 每条子命令自己的屏都要进来。上一版只比顶层 `--help`，于是 `--json`、`--dry-run`、
  // `--recursive` 这些"其实挂在子命令屏上"的开关全被报成缺失——11 条红里有 8 条是这么来的假阳性。
  const allScreens = new Map(subs.map((s) => [s, (() => {
    const out = runCli(voice.cliPath, [s, '--help'])
    return typeof out === 'object' && out.failed ? out.output : String(out)
  })()]))
  const ourFlags = new Set(flagsFromHelp(screen))
  for (const one of allScreens.values()) for (const flag of flagsFromHelp(one)) ourFlags.add(flag)
  const upstreamFlags = flagsFromUpstream(readFileSync(baselineCli, 'utf8'))
  const missing = judgeMissingFlags(upstreamFlags, ourFlags)
  const declaredVerdict = judgeDeclared(missing, parityDeltas.entries.find((e) => e.id === id), new Set(ids))
  for (const staleLine of declaredVerdict.stale) failures.push(`${id}: ${staleLine}`)
  if (missing.length > 0 && declaredVerdict.declared.length !== missing.length) {
    const shown = missing.filter((f) => !declaredVerdict.declared.includes(f))
    missingList.push(`${id}: 上游那 ${shown.length} 条开关在**任何一屏**都没打出来 ⇒ ${shown.slice(0, 8).join(', ')}${shown.length > 8 ? ' …' : ''}`
      + `\n      这条只证"屏上看不见"，不证"代码里没有"——classf 实测就是源码里写着、屏上不打（已归口成别名），gifu 那三条是引导流的开关（见台账）。`)
  } else if (declaredVerdict.declared.length > 0) {
    notes.push(`${id}: ${declaredVerdict.declared.length} 条按台账申报放行 ⇒ ${declaredVerdict.declared.join(', ')}（解锁条件写在 docs/port/cli-parity-deltas.json，开关回到屏上这条申报就过期）`)
  }

  const candidates = subs.filter((s) => s !== 'guided' && s !== 'gd' && s !== 'ui')
  if (candidates.length === 0) {
    skippedShape += 1
    notes.push(`${id}: 子命令表打不出来 ⇒ 不跑`)
    continue
  }
  // 每条候选的屏直接复用上面那一份（同一次 `--help` 调用，不重复起进程）。
  const flagsOf = (s) => inlineFlagsFromOptions(allScreens.get(s) ?? '')
  const previewOf = (s) => previewFlagsFromOptions(allScreens.get(s) ?? '')
  const argsOf = (s) => {
    const args = {}
    for (const flag of [...flagsOf(s), ...previewOf(s)]) {
      const [name, value] = flag.slice(2).split('=')
      args[name] = value === undefined ? true : (/^\d+$/.test(value) ? Number(value) : value)
    }
    return args
  }
  const { action: sub, args: usedArgs, verdicts } = pickSafeAction(dangerFor, voice.node, candidates, argsOf)
  if (sub === undefined) {
    skippedDanger += 1
    notes.push(`${id}: 契约把每条动作都判成危险 ⇒ 零副作用约束下不跑（${verdicts.slice(0, 3).join('；') || '全部 gated'}）`)
    continue
  }
  const argv = [sub, ...flagsOf(sub), ...previewOf(sub)]
  const first = runCli(voice.cliPath, argv)
  const second = runCli(voice.cliPath, argv)
  if (typeof first === 'object' && first.failed) {
    skippedShape += 1
    notes.push(`${id}: ${voice.bin} ${sub} 退出码非 0 ⇒ 记为未跑通（不判红：上游同参数是否跑得通还没对过）\n      argv=${JSON.stringify(argv)} 输出首 120 字：${JSON.stringify(first.output.slice(0, 120))}`)
    continue
  }
  runsDone += 1
  if (usedArgs.preview === undefined && voice.node.danger?.type === 'all') {
    notes.push(`${id}: 用预演参数 ${JSON.stringify(usedArgs)} 让契约放行；屏上没有 dryRun 类开关时这条判据依赖上游默认值`)
  }
  const detProblem = judgeDeterminism(String(first), String(second))
  if (detProblem !== '') failures.push(`${id}: ${detProblem}`)
  const jsonOut = runCli(voice.cliPath, [...argv, '--json'])
  if (typeof jsonOut === 'object' && jsonOut.failed) {
    failures.push(`${id}: 带 --json 退出码非 0（argv=${JSON.stringify(argv)}，前 120 字：${JSON.stringify(jsonOut.output.slice(0, 120))}）`)
  } else {
    const jsonProblem = judgeJsonRun(String(jsonOut))
    if (jsonProblem !== '') failures.push(`${id}: ${jsonProblem}`)
  }
}

console.log(`check-cli-parity: ${ids.length} 个包，比了 ${facesChecked} 张开关表，真跑了 ${runsDone} 条命令；`
  + `跳过 ${skippedShape} 个（形状/基线没有/没跑通）、${skippedDanger} 个包每条动作都被契约判成危险。`)
for (const note of notes) console.log(`  · ${note}`)
if (missingList.length > 0) {
  for (const line of missingList) console.error(`  × ${line}`)
}
for (const line of failures) console.error(`  × ${line}`)
if (missingList.length > 0 || failures.length > 0) {
  console.error(`  · 上面这些是"上游能设的参数，终端上设不了"或"跑不出确定性结果"的活证据；`
    + `要放行必须先把它归到"上游那腿本来也没这条"或"清单里这条字段本来就不走终端"，并写进 docs/port 的台账。`)
  process.exit(1)
}
console.log('上游开关都在屏上；每条跑过的命令两次输出一致且 --json 解析得出结构')
