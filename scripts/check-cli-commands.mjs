/**
 * 承诺兑现尺：清单里 `workflows.cli` 那几条**人对外的说法**，必须能在 CLI 自己的子命令表里查到，
 * 而且那条子命令的 `--help` 要真的打得开。
 *
 * 为什么在 `scripts/check-cli-face.mjs` 之外还要这一把：
 * - `check-cli-face.mjs` 证的是三件事：`plugins/<id>/lib/cli.js` 在、`<cli> --help` 退码 0、
 *   输出里带着自己的 bin 名。那是**最弱的证明**——它只说"这屏帮助印得出来"，
 *   一个字都不涉及清单有没有承诺过某条命令、以及那条命令是否真被派发。
 *   一个包可以 `--help` 全绿、而 `xaihi.node.help.workflows.cli` 里写着 `xfoo deploy` 却根本没有 `deploy`。
 *   本仓已经有过这个形状的前科（`gen-cli-registry.mjs` 脚本头：上游带来 46 条假承诺，
 *   压到 21 条；剩下的**是否接线**以前没人量）。这把尺量的就是"剩下的是否接线"。
 * - 读的是**现在的** manifest（`plugins/<id>/package.json`），不是任何硬编码清单。
 *   bin 与资格判据（`name` + `bin` + `exports["./cli"]` + `exports["./help"]` + 非空 description）
 *   照抄 `scripts/gen-cli-registry.mjs:28-45` 的 `registryEntries`，不另立第二套读法；
 *   承诺的规范键是 `xaihi.node.help.workflows.cli`（`packages/contract/src/index.ts:179`、
 *   `packages/cli-runtime/src/help.ts:10` 都写 `workflows`），任务里说的 `xaihi.node.workflows.cli`
 *   在本仓现读**不存在**（实测：26 个包零命中），所以两处都试、以 `help.` 为准。
 *
 * 判据（每条被承诺的命令一个判决）：
 * - `dispatched`：子命令在 `<cli> --help` 的子命令表里，且 `<cli> <sub> --help` rc=0
 *   **并且那一屏确实是这条子命令自己的**（首行/Usage 里带着 `<bin> <sub>`）。
 *   最后这半不是装饰：本仓的派发器 `runCommand`（`plugins/linedup/src/cli-support.ts:305-337`）
 *   在 `wantsHelp` 为真时会跳过 "Unknown command" 那条出口，**退码 0 印父屏**，
 *   实测 `node plugins/linedup/lib/cli.js zznotasub --help` rc=0 ⇒ 只看 rc 会把臆造的命令判成兑现。
 * - `absent`：清单承诺了，CLI 的子命令表里没有 ⇒ 红（假承诺）。
 * - `refused-help`：表里有这条子命令，但 `<cli> <sub> --help` 退码非 0（或超时）⇒ 红（真 bug，值得点名）。
 * - `help-not-scoped`：表里有、rc=0，但打印的还是父屏 ⇒ 红（被 rc 兜底骗过的那种）。
 * - `skipped-danger`：包 manifest 声明了 danger（`xaihi.node.danger.type !== "none"`）⇒ 不跑任何东西，
 *   连 `--help` 都不跑，只记账。
 * - `no-command`：这条 `cli` 文案里没有可解析的 `<bin|nodeId> <sub>` 命令对（纯说明文字，
 *   或只给了 `--help`）⇒ 不判红，只报数：把散文判成违规等于逼包把说明改写成命令。
 * - `unmeasured`：读不到子命令表（`--help` 退码非 0、缺产物）或承诺写在非规范键下 ⇒ 红
 *   （没有输入的尺不许报绿，与 `check-cli-face.mjs` 的 `no-artifact` 同一条纪律）。
 *
 * 安全（不可协商）：只允许**无副作用**的调用形式——`<cli> --help`、`<cli> <sub> --help`、
 * 以及 CLI 自己在帮助里 documented 的 introspection flag（`--list` / `--commands` / `--subcommands`，
 * 只这三个名字，且必须出现在帮助文本里才允许跑）。不传真实路径、不跑不带 `--help` 的子命令、
 * danger 包一律不跑。每次 spawn 的 `cwd` 都是 `.scratch/` 下现开的空目录：
 * 就算某个 CLI 无视 `--help` 去读相对路径，那里也什么都没有。stdin 走 `ignore`，
 * 不给任何包"等管道输入"的机会；超时默认 20 秒。
 *
 * 这把尺**不证明**的事（下一段腿再补）：命令真的产出正确输出。它只证明
 * "承诺的那条命令被认出来、并且自己的帮助屏打得来"。参数是否被吃、结果是否正确、
 * 与宿主面（`ctx.*`）的接线，都不在这条判据里。
 *
 * 用法：
 *   node scripts/check-cli-commands.mjs                     # 量 plugins/ 全部
 *   node scripts/check-cli-commands.mjs --only linedup,logx  # 复量单包
 *   node scripts/check-cli-commands.mjs --self-check         # 阳性对照：坏承诺必须被抓到
 *   node scripts/check-cli-commands.mjs --plugins-dir <dir>  # 只给夹具/诊断用；与 --only 互斥
 *   node scripts/check-cli-commands.mjs --timeout 5000
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const PLUGINS = join(ROOT, 'plugins')
const SCRATCH = join(ROOT, '.scratch')
const DEFAULT_TIMEOUT_MS = 20_000

/** 只有这三个名字的 introspection flag 允许被跑，而且必须帮助里自己写了。 */
const LIST_FLAGS = ['--list', '--commands', '--subcommands']

/** 承诺文案里紧跟着 bin 的这些词不是子命令。 */
const HELP_WORDS = new Set(['help'])

/** 散文里常跟在命令名后面的词；抽出来会变成假命令，所以先过一遍。`run` / `undo` 这类是真 action id，不在表里。 */
const STOPWORDS = new Set(['for', 'to', 'with', 'and', 'the', 'a', 'an', 'of', 'is', 'in', 'or', 'if', 'it', 'not', 'then', 'this', 'that', 'will', 'please', 'you'])

const esc = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 一个节点包"有没有终端面"的资格判据 + bin 名。
 * 语义逐条照抄 `scripts/gen-cli-registry.mjs:28-45`（`registryEntries`）：
 * `Object.keys(pkg.bin)[0]` 当 bin、`exports["./cli"]` 与 `exports["./help"]` 都必须在、
 * description 取 `node.description.en ?? node.title.en` 且非空。缺一样就不是 CLI 面（不是回退成猜测）。
 */
export function nodeCliFace(pkg) {
  const bin = Object.keys(pkg.bin ?? {})[0]
  const binTarget = Object.values(pkg.bin ?? {})[0]
  if (typeof bin !== 'string' || typeof binTarget !== 'string' || typeof pkg.name !== 'string') return null
  const exports_ = pkg.exports ?? {}
  if (exports_['./cli'] === undefined || exports_['./help'] === undefined) return null
  const node = pkg.xaihi?.node ?? {}
  const description = node?.description?.en ?? node?.title?.en ?? ''
  if (`${description}`.trim().length === 0) return null
  return { bin, binTarget, packageName: pkg.name, nodeId: node.nodeId, cliName: binTarget }
}

/** danger 只在 `xaihi.node.danger.type !== "none"` 时算"声明了 danger"。 */
export function dangerOf(node) {
  const danger = node?.danger
  if (danger === undefined || danger === null || danger.type === 'none') return { declared: false, reason: null }
  const parts = [`type=${danger.type}`]
  if (Array.isArray(danger.dangerous)) parts.push(`dangerous=[${danger.dangerous.join(',')}]`)
  if (danger.exportName) parts.push(`export=${danger.exportName}`)
  if (Array.isArray(danger.predicates)) parts.push(`predicates=${danger.predicates.length}`)
  return { declared: true, reason: parts.join(' ') }
}

/**
 * 现读承诺清单：规范位是 `xaihi.node.help.workflows.cli`，兼容 `xaihi.node.workflows.cli`
 * （任务描述里写的那一位，本仓现读零命中，留着是为改名往回挪时尺不瞎）。
 * 两处都没有、但 `help` 下某个键里藏着 `cli: []` ⇒ `offKey`：承诺框架读不到，
 * 那是 manifest 的病，必须红，不许当成"这个包没承诺"。
 */
export function declaredCliPromises(node) {
  const help = node?.help ?? {}
  const canonical = [
    ['help.workflows.cli', help.workflows?.cli],
    ['node.workflows.cli', node?.workflows?.cli],
  ].find(([, value]) => Array.isArray(value))
  if (canonical !== undefined) return { promises: canonical[1].map(String), key: canonical[0], offKey: false }
  for (const [key, value] of Object.entries(help)) {
    if (value !== null && typeof value === 'object' && Array.isArray(value.cli)) {
      return { promises: value.cli.map(String), key: `help.${key}.cli`, offKey: true }
    }
  }
  return { promises: [], key: null, offKey: false }
}

/**
 * 从一条承诺文案里抽子命令。
 * 规则：命令对要么写成裸的 `linedup filter`，要么写在反引号里（``Run `xlogx query --level warn` ``）；
 * 所以候选片段 = 反引号内容（有反引号时）或整条文案，别名 = bin / nodeId / 目录名。
 * 片段里别名后面第一个既不是 flag、也不是 `help` 动词、也不在停用词表里的 token 就是子命令。
 * 只给到 `--help`（`Run \`xrecycleu --help\` for …`）⇒ 没承诺任何子命令，交回 `no-command`。
 */
export function extractCommands(entry, aliases) {
  const spans = [...entry.matchAll(/`([^`]+)`/g)].map((match) => match[1])
  const candidates = spans.length > 0 ? spans : [entry]
  const subs = []
  let mentionsAlias = false
  let flagsOnly = false
  for (const span of candidates) {
    for (const alias of aliases) {
      if (!alias) continue
      const re = new RegExp(`(?:^|[^\\w.-])${esc(alias)}(?=$|[\\s])`, 'g')
      let match
      while ((match = re.exec(span)) !== null) {
        mentionsAlias = true
        const tokens = span.slice(match.index + match[0].length).trim().split(/\s+/).filter(Boolean)
        let took = false
        for (const token of tokens) {
          if (token.startsWith('-')) { flagsOnly = true; break }
          if (HELP_WORDS.has(token.toLowerCase()) || STOPWORDS.has(token.toLowerCase()) || aliases.includes(token)) continue
          if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(token)) break
          subs.push(token)
          took = true
          break
        }
        if (!took && tokens.length > 0 && !tokens[0].startsWith('-')) flagsOnly = flagsOnly || tokens.length === 0
      }
    }
  }
  return { subs: [...new Set(subs)], mentionsAlias, flagsOnly }
}

/**
 * 从 `<cli> --help` 的输出里抽子命令表。认两种渲染器：
 * 1. `plugins/<id>/src/cli-support.ts` 的 `formatCommandHelp`：`Subcommands:` 之后每行两个空格缩进的
 *    `名字  描述`，空行结束该段（`--help, -h` 那行以 `-` 开头，天然不进来）；
 * 2. `packages/cli-runtime/src/help.ts` 的 `formatTerminalNodeHelp`：`Commands` / `命令` 之后
 *    两空格缩进的是命令行、六空格缩进的是描述/示例。
 */
export function parseVocabulary(text) {
  const names = new Set()
  const lines = `${text}`.split(/\r?\n/)
  let inBlock = false
  for (const line of lines) {
    if (/^\s*(Subcommands|Commands|命令)\s*:?\s*$/i.test(line)) { inBlock = true; continue }
    if (!inBlock) continue
    if (line.trim() === '') { inBlock = false; continue }
    const indent = /^(\s*)/.exec(line)[1].length
    if (indent < 2 || indent > 4) continue
    const token = /^ {2,4}([^\s]+)/.exec(line)?.[1]
    if (token === undefined || token.startsWith('-') || token.startsWith('$')) continue
    names.add(token)
  }
  return names
}

/** 帮助里自己 documented 的 introspection flag（只认 LIST_FLAGS 那三个名字）。 */
export function documentedListFlag(text) {
  for (const flag of LIST_FLAGS) {
    if (new RegExp(`^ {2,6}${esc(flag)}\\b`, 'm').test(`${text}`)) return flag
  }
  return null
}

/** introspection flag 那屏的解析：行首那个 token 就是命令名。 */
export function parseListOutput(text) {
  const names = new Set()
  for (const line of `${text}`.split(/\r?\n/)) {
    const match = /^\s*(?:[-*•]\s+)?([A-Za-z][A-Za-z0-9_-]*)(?=$|[\s:,—-])/.exec(line)
    if (match === null) continue
    if (/^(usage|options?|subcommands?|commands|help|error)$/i.test(match[1])) continue
    names.add(match[1])
  }
  return names
}

/**
 * 唯一被允许的 spawn 形态：`[--help]`、`[-h]`、`[<sub>, --help]`、`[<sub>, -h]`、
 * 以及帮助里自己写了的 introspection flag（`[--list]` / `[--commands]` / `[--subcommands]`，只这三个名字）。
 * 其它一律 `rejected: true`，进程根本不起——包括裸 `[<sub>]`，那才是会碰文件系统/网络/电源的形状。
 * `cwd` 一定指到 `.scratch/` 下的空目录，stdin 是 `ignore`（不给"等管道输入"的机会），超时算失败。
 */
export function runHelpOnly(binPath, args, { cwd, timeoutMs }) {
  const [first, second, third] = args
  const rootHelp = second === undefined && (first === '--help' || first === '-h')
  const subHelp = third === undefined && first !== undefined && !first.startsWith('-') && (second === '--help' || second === '-h')
  const introspection = second === undefined && LIST_FLAGS.includes(first)
  if (!(rootHelp || subHelp || introspection)) return { rejected: true, status: null, output: '' }
  const run = spawnSync(process.execPath, [binPath, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
  if (run.error && run.error.code === 'ETIMEDOUT') return { rejected: false, timedOut: true, status: run.status, output }
  return { rejected: false, timedOut: false, status: run.status, output }
}

/** 那一屏是不是子命令自己的：首行或 `Usage` 行要带着 `<bin> <sub>`。 */
export function helpIsScoped(text, bin, sub) {
  return new RegExp(`^\\s*(?:Usage\\s+)?${esc(bin)}\\s+${esc(sub)}\\b`, 'm').test(`${text}`)
    || new RegExp(`^\\s*Usage:\\s*${esc(sub)}\\b`, 'm').test(`${text}`)
}

/** 一个承诺条目的判决（`command === null` 时是 `no-command`）。 */
export function judgeCommand({ bin, binPath, command, entry, vocabulary, danger, probeCwd, timeoutMs }) {
  const label = entry.length > 78 ? `${entry.slice(0, 75)}…` : entry
  if (danger.declared) {
    return { command, state: 'skipped-danger', rc: null, note: `清单声明 danger（${danger.reason}）⇒ 连 --help 都没跑`, entry: label }
  }
  if (command === null) {
    return { command, state: 'no-command', rc: null, note: '文案里没有 `<bin> <子命令>` 形状的命令对', entry: label }
  }
  if (!vocabulary.has(command)) {
    return { command, state: 'absent', rc: null, note: `子命令表里没有它（表：${[...vocabulary].join(' ') || '空'}）`, entry: label }
  }
  const run = runHelpOnly(binPath, [command, '--help'], { cwd: probeCwd, timeoutMs })
  if (run.rejected) return { command, state: 'unmeasured', rc: null, note: '内部闸门拒绝执行', entry: label }
  if (run.timedOut) return { command, state: 'refused-help', rc: null, note: `${timeoutMs}ms 内没返回`, entry: label }
  if (run.status !== 0) {
    return { command, state: 'refused-help', rc: run.status, note: `rc=${run.status}；首行 ${run.output.split('\n')[0]?.slice(0, 60) ?? '(空)'}`, entry: label }
  }
  if (!helpIsScoped(run.output, bin, command)) {
    return { command, state: 'help-not-scoped', rc: run.status, note: `rc=0 但打印的还是父屏（${bin} ${command} 自己的帮助没出来）`, entry: label }
  }
  return { command, state: 'dispatched', rc: run.status, note: '', entry: label }
}

/** 一个包：现读 manifest → 跑 `--help` 拿子命令表 → 逐条承诺判决。 */
export function judgePackage({ pluginsDir, id, probeCwd, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const pkgDir = join(pluginsDir, id)
  const pkgPath = join(pkgDir, 'package.json')
  if (!existsSync(pkgPath)) return { id, rows: [], skip: '没有 package.json', skipKind: 'no-package' }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const face = nodeCliFace(pkg)
  if (face === null) return { id, rows: [], skip: '没有 bin/./cli/./help（gen-cli-registry 的资格判据）', skipKind: 'no-cli-face' }
  const node = pkg.xaihi?.node ?? {}
  const danger = dangerOf(node)
  const { promises, key, offKey } = declaredCliPromises(node)
  const aliases = [...new Set([face.bin, face.nodeId, id].filter(Boolean))]
  const binPath = join(pkgDir, face.binTarget)

  const shortEntry = (entry) => (entry.length > 78 ? `${entry.slice(0, 75)}…` : entry)

  // 承诺写在非规范键下：框架读不到它，尺也不许把它当"没承诺"——那是没有输入的尺，必须红。
  if (offKey) {
    return {
      id,
      bin: face.bin,
      danger,
      vocabulary: null,
      rows: promises.map((entry) => ({
        command: null,
        state: 'unmeasured',
        rc: null,
        note: `承诺写在 ${key}，规范键是 help.workflows.cli ⇒ 框架读不到，尺也读不到`,
        entry: shortEntry(entry),
      })),
    }
  }

  if (danger.declared) {
    // 连 `<cli> --help` 都不跑：判据只看清单，一个进程都不动。
    if (promises.length === 0) {
      return { id, bin: face.bin, danger, vocabulary: null, rows: [], skip: `没承诺 cli 命令；danger（${danger.reason}）⇒ 一条命令都没跑`, skipKind: 'no-promises' }
    }
    const rows = []
    for (const entry of promises) {
      const { subs } = extractCommands(entry, aliases)
      const note = `清单声明 danger（${danger.reason}）⇒ --help 都没跑`
      if (subs.length === 0) rows.push({ command: null, state: 'skipped-danger', rc: null, note: `${note}；文案里也没解析出 \`<bin> <子命令>\``, entry: shortEntry(entry) })
      for (const command of subs) rows.push({ command, state: 'skipped-danger', rc: null, note, entry: shortEntry(entry) })
    }
    return { id, bin: face.bin, danger, vocabulary: null, rows }
  }

  // 非 danger 的包一律先拿子命令表（只跑 `--help`）：清单没承诺、而 CLI 有子命令，是另一半天。
  if (!existsSync(binPath)) {
    if (promises.length === 0) {
      return { id, bin: face.bin, danger, vocabulary: null, rows: [], skip: `清单没承诺任何 cli 命令（产物也不在，缺产物归 check-cli-face）`, skipKind: 'no-promises' }
    }
    return {
      id,
      bin: face.bin,
      danger,
      vocabulary: null,
      rows: promises.map((entry) => ({
        command: extractCommands(entry, aliases).subs[0] ?? null,
        state: 'unmeasured',
        rc: null,
        note: `bin 指向 ${face.binTarget}，产物不在 ⇒ 拿不到子命令表`,
        entry: shortEntry(entry),
      })),
    }
  }

  const help = runHelpOnly(binPath, ['--help'], { cwd: probeCwd, timeoutMs })
  if (help.rejected || help.timedOut || help.status !== 0) {
    const reason = help.rejected ? '内部闸门拒绝执行' : help.timedOut ? `${timeoutMs}ms 内没返回` : `rc=${help.status}`
    return {
      id,
      bin: face.bin,
      danger,
      vocabulary: null,
      helpRc: help.status,
      rows: promises.length === 0
        ? []
        : promises.map((entry) => ({
          command: extractCommands(entry, aliases).subs[0] ?? null,
          state: 'unmeasured',
          rc: help.status,
          note: `<cli> --help ${reason} ⇒ 拿不到子命令表`,
          entry: shortEntry(entry),
        })),
      skip: promises.length === 0 ? `清单没承诺任何 cli 命令，且 <cli> --help ${reason}` : undefined,
      skipKind: promises.length === 0 ? 'no-promises' : undefined,
    }
  }
  const vocabulary = parseVocabulary(help.output)
  const listFlag = documentedListFlag(help.output)
  let listRc = null
  if (listFlag !== null) {
    const listed = runHelpOnly(binPath, [listFlag], { cwd: probeCwd, timeoutMs })
    listRc = listed.status
    if (!listed.rejected && !listed.timedOut && listed.status === 0) {
      for (const name of parseListOutput(listed.output)) vocabulary.add(name)
    }
  }

  const rows = []
  for (const entry of promises) {
    const { subs, mentionsAlias, flagsOnly } = extractCommands(entry, aliases)
    if (subs.length === 0) {
      rows.push(judgeCommand({
        bin: face.bin, binPath, command: null, entry, vocabulary, danger, probeCwd, timeoutMs,
      }))
      if (!mentionsAlias) rows[rows.length - 1].note = '文案没提自己的 bin/nodeId'
      else if (flagsOnly) rows[rows.length - 1].note = `只给了 ${face.bin} --help 这种根帮助，没承诺子命令`
    } else {
      for (const command of subs) rows.push(judgeCommand({ bin: face.bin, binPath, command, entry, vocabulary, danger, probeCwd, timeoutMs }))
    }
  }
  const promised = new Set(rows.map((row) => row.command).filter(Boolean))
  const unpromised = [...vocabulary].filter((name) => !promised.has(name))
  return {
    id,
    bin: face.bin,
    danger,
    vocabulary,
    key,
    helpRc: help.status,
    listFlag,
    listRc,
    unpromised,
    rows,
    skip: promises.length === 0 ? `清单没承诺任何 cli 命令（CLI 自己有 ${vocabulary.size} 条子命令）` : undefined,
    skipKind: promises.length === 0 ? 'no-promises' : undefined,
  }
}

export function judgeAll({ pluginsDir = PLUGINS, probeCwd, only = null, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const ids = readdirSync(pluginsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((id) => only === null || only.includes(id))
    .sort()
  return ids.map((id) => judgePackage({ pluginsDir, id, probeCwd, timeoutMs }))
}

export const RED_STATES = ['absent', 'refused-help', 'help-not-scoped', 'unmeasured']

function makeProbeDir(prefix) {
  mkdirSync(SCRATCH, { recursive: true })
  return mkdtempSync(join(SCRATCH, `${prefix}-`))
}

// --- 参数与互斥：正控与现量共用一套，且互斥判定在跑任何东西之前 -------------------------------

const argOf = (flag) => {
  const at = process.argv.indexOf(flag)
  return at >= 0 ? process.argv[at + 1] : undefined
}

const onlyArg = argOf('--only')
const dirArg = argOf('--plugins-dir')
const timeoutArg = argOf('--timeout')
const isSelfCheck = process.argv.includes('--self-check')

if (onlyArg !== undefined && dirArg !== undefined) {
  console.error('  × --only 与 --plugins-dir 不许同时给：夹具目录里的 id 与仓内包同名时，筛出来的到底是哪一批读不出来')
  process.exit(2)
}
if (isSelfCheck && (onlyArg !== undefined || dirArg !== undefined)) {
  console.error('  × --self-check 自带夹具目录，不接受 --only / --plugins-dir：正控的期望值是按夹具写死的')
  process.exit(2)
}

// --- 阳性对照：夹具不落进 plugins/（那会被别的尺当成真节点包），走临时目录 + 显式传参。 ---------

if (isSelfCheck) {
  const dir = mkdtempSync(join(tmpdir(), 'xaihi-cli-commands-'))
  const probeCwd = makeProbeDir('check-cli-commands-selfcheck')

  /** 父屏：与 `plugins/<id>/src/cli-support.ts` 的 `formatCommandHelp` 同形（Subcommands 段 + 收尾 --help 行）。 */
  const parentScreen = (name, subs, extraOptions = '') => `${name} — ${name} fixture node.

Usage ${name} <subcommand> [options...]

Subcommands:
${subs.map(([sub, text]) => `  ${sub.padEnd(9)}  ${text}`).join('\n')}
${extraOptions}
  --help, -h  Display this message.`

  /**
   * 夹具的 cli.js。`guard`（写了才算真跑了命令）刻意放在 `--help` 处理**之后**：
   * 帮助形态的调用是被允许的、不写痕迹；任何裸子命令一旦执行就会留下 `cli.js.SENTINEL`。
   */
  const guard = `import { writeFileSync } from 'node:fs'
writeFileSync(new URL('./cli.js.SENTINEL', import.meta.url), 'ran')
`
  const mk = (id, { bin, nodeId, danger, workflows, cliBody, helpKey = 'workflows', offKey = false, withBin = true }) => {
    const at = join(dir, id, 'lib')
    mkdirSync(at, { recursive: true })
    if (cliBody !== null) writeFileSync(join(at, 'cli.js'), cliBody)
    const help = offKey ? { whenToUse: ['x'], [helpKey]: { cli: workflows } } : { whenToUse: ['x'], workflows: { cli: workflows } }
    writeFileSync(join(dir, id, 'package.json'), JSON.stringify({
      name: `@fixture/${id}`,
      type: 'module',
      ...(withBin ? { bin: { [bin]: './lib/cli.js' } } : {}),
      exports: { './cli': './lib/cli.js', './help': './lib/help.js' },
      xaihi: { node: { nodeId, description: { en: `${id} fixture node.` }, danger, help } },
    }))
  }
  /**
   * 一条只会以 `--help` 形态被调用的派发器。
   * `subHelp: 'scoped'` 复刻 `cli-support.ts` 的真行为（子命令有自己的屏）；
   * `subHelp: 'parent'` 复刻它 `wantsHelp` 那条兜底（未知/已知子命令都退码 0 印父屏）。
   */
  const dispatcher = ({ name, subs, subHelp, extraOptions = '', beforeHelp = '' }) => `const FACE = ${JSON.stringify(parentScreen(name, subs, extraOptions))}
${beforeHelp}if (process.argv.includes('--help') || process.argv.includes('-h')) {
  const sub = process.argv[2]
  if (sub !== undefined && !sub.startsWith('-') && ${subHelp === 'scoped' ? 'true' : 'false'}) {
    process.stdout.write('${name} ' + sub + ' — scoped help.\\n\\nUsage ${name} ' + sub + ' [options...]\\n')
    process.exit(0)
  }
  process.stdout.write(FACE)
  process.exit(0)
}
${guard}process.stdout.write('executed for real: ' + process.argv.slice(2).join(' ') + '\\n')
process.exit(0)
`

  // 1) 承诺的命令真被派发；同包再放一条反引号写法与一条散文。
  mk('ok', {
    bin: 'xok', nodeId: 'okpkg', danger: { type: 'none' },
    workflows: ['xok filter', 'Run `xok filter --json` for scripts.', 'This leg is prose, not a command.'],
    cliBody: dispatcher({ name: 'xok', subs: [['filter', 'Filter things.']], subHelp: 'scoped' }),
  })
  // 2) 臆造的命令：派发器 rc=0 印父屏，尺必须判 absent（不许被 rc=0 骗成 dispatched）。
  mk('absent', {
    bin: 'xap', nodeId: 'absent', danger: { type: 'none' }, workflows: ['xap zzz'],
    cliBody: dispatcher({ name: 'xap', subs: [['filter', 'Filter things.']], subHelp: 'parent' }),
  })
  // 3) 表里有这条子命令，但 `--help` 退码 2。
  mk('refuse', {
    bin: 'xrf', nodeId: 'refuse', danger: { type: 'none' }, workflows: ['xrf run'],
    cliBody: `const FACE = ${JSON.stringify(parentScreen('xrf', [['run', 'Run things.']]))}
if (process.argv[2] === 'run') { process.stderr.write('xrf run: not reachable\\n'); process.exit(2) }
process.stdout.write(FACE)
process.exit(0)
${guard}process.stdout.write('executed for real\\n')
`,
  })
  // 4) 表里有、rc=0，但打印的还是父屏（rc 与"自己的帮助"是两件事）。
  mk('liar', {
    bin: 'xlp', nodeId: 'liar', danger: { type: 'none' }, workflows: ['xlp filter'],
    cliBody: dispatcher({ name: 'xlp', subs: [['filter', 'Filter things.']], subHelp: 'parent' }),
  })
  // 5) danger：连 `--help` 都不许跑（跑了也不该留痕；裸跑一定留痕）。
  mk('dgr', {
    bin: 'xdg', nodeId: 'dgr', danger: { type: 'actionIn', actionField: 'action', dangerous: ['go'] },
    workflows: ['xdg go', 'Run `xdg go --force` to do it.'],
    cliBody: dispatcher({ name: 'xdg', subs: [['go', 'Go.']], subHelp: 'scoped' }),
  })
  // 6) `--help` 自己就 rc=1 ⇒ 拿不到子命令表 ⇒ unmeasured（没有输入的尺不报绿）。
  mk('novocab', {
    bin: 'xnk', nodeId: 'novocab', danger: { type: 'none' }, workflows: ['xnk thing'],
    cliBody: `process.stderr.write('xnk --help crashed\\n')\nprocess.exit(1)\n${guard}process.stdout.write('executed for real\\n')\n`,
  })
  // 7) 帮助里 documented 的 `--commands` 把表补全：beta 只出现在那一屏。
  mk('listf', {
    bin: 'xlf', nodeId: 'listf', danger: { type: 'none' }, workflows: ['xlf alpha', 'xlf beta'],
    cliBody: dispatcher({
      name: 'xlf',
      subs: [['alpha', 'Does alpha.']],
      subHelp: 'scoped',
      extraOptions: '\nOptions:\n  --commands  List available subcommands.',
      beforeHelp: `if (process.argv[2] === '--commands') { process.stdout.write('alpha  Does alpha.\\nbeta  Does beta.\\n'); process.exit(0) }\n`,
    }),
  })
  // 8) 承诺写在非规范键下：框架读不到，尺必须红，不许当成"这个包没承诺"。
  mk('offkey', {
    bin: 'xoff', nodeId: 'offkey', danger: { type: 'none' }, workflows: ['xoff go'], helpKey: 'wf', offKey: true,
    cliBody: dispatcher({ name: 'xoff', subs: [['go', 'Go.']], subHelp: 'scoped' }),
  })
  // 9) bin 声明了但产物不在。
  mk('noart', {
    bin: 'xna', nodeId: 'noart', danger: { type: 'none' }, workflows: ['xna go'], cliBody: null,
  })
  // 10) 没 bin：按 gen-cli-registry 的资格判据不算 CLI 面（不跑、不判红）。
  mk('nobin', {
    nodeId: 'nobin', danger: { type: 'none' }, workflows: [], withBin: false,
    cliBody: dispatcher({ name: 'xnb', subs: [['go', 'Go.']], subHelp: 'scoped' }),
  })

  const rows = judgeAll({ pluginsDir: dir, probeCwd, timeoutMs: 8_000 })
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
  const stateOf = (id, command) => byId[id]?.rows?.find((row) => row.command === command)?.state ?? '(无该判决)'
  const rcOf = (id, command) => byId[id]?.rows?.find((row) => row.command === command)?.rc
  const sentinelsBefore = readdirSync(dir, { recursive: true }).filter((name) => `${name}`.endsWith('cli.js.SENTINEL'))

  // 期望值全部写死在这里，不通过再调一次被测函数得到。
  const expectations = [
    ['ok/裸写法承诺', stateOf('ok', 'filter'), 'dispatched'],
    ['ok/散文文案', stateOf('ok', null), 'no-command'],
    ['absent/臆造命令', stateOf('absent', 'zzz'), 'absent'],
    ['refuse/子命令拒绝帮助', stateOf('refuse', 'run'), 'refused-help'],
    ['liar/rc0 印父屏', stateOf('liar', 'filter'), 'help-not-scoped'],
    ['dgr/danger 跳过', stateOf('dgr', 'go'), 'skipped-danger'],
    ['novocab/--help 崩', stateOf('novocab', 'thing'), 'unmeasured'],
    ['listf/表内命令', stateOf('listf', 'alpha'), 'dispatched'],
    ['listf/仅 --commands 出现的命令', stateOf('listf', 'beta'), 'dispatched'],
    ['offkey/非规范键', stateOf('offkey', null), 'unmeasured'],
    ['noart/缺产物', stateOf('noart', 'go'), 'unmeasured'],
  ]
  const problems = []
  for (const [name, actual, expected] of expectations) {
    if (actual !== expected) problems.push(`夹具 ${name} 期望 ${expected}，实际 ${actual}`)
  }
  if (byId.ok?.rows?.filter((row) => row.state === 'dispatched').length !== 2) {
    problems.push(`夹具 ok 的两条写法（裸 \`xok filter\` 与反引号里的 \`xok filter --json\`）没都判成 dispatched ⇒ 文案解析器认不出其中一种`)
  }
  if (rcOf('refuse', 'run') !== 2) problems.push(`refuse 的 rc 没被记下来（实际 ${String(rcOf('refuse', 'run'))}）⇒ 判决里读不到退码`)
  if (byId.nobin?.skipKind !== 'no-cli-face') problems.push(`没有 bin 的夹具 skipKind=${String(byId.nobin?.skipKind)}，期望 no-cli-face ⇒ 尺会去跑一个没有终端面的包`)
  if (byId.listf?.listFlag !== '--commands') problems.push(`documented 的 --commands 没被认出来（实际 ${String(byId.listf?.listFlag)}）⇒ 那条 introspection 通路是死代码`)
  if (rows.length !== 10) problems.push(`读了 ${rows.length} 个夹具包，期望 10 个 ⇒ 有条目没被 manifest 解析到`)

  // spawn 层自己的闸门：不带 --help 的调用必须在起进程之前被拒（拒了才不会有 SENTINEL）。
  const gate = runHelpOnly(join(dir, 'ok', 'lib', 'cli.js'), ['filter'], { cwd: probeCwd, timeoutMs: 8_000 })
  if (gate.rejected !== true) problems.push('runHelpOnly 放跑了一次不带 --help 的裸子命令调用 ⇒ 唯一允许的调用形式没被钉住')
  const gateFlags = runHelpOnly(join(dir, 'ok', 'lib', 'cli.js'), ['--yes', '--help'], { cwd: probeCwd, timeoutMs: 8_000 })
  if (gateFlags.rejected !== true) problems.push('runHelpOnly 放跑了 `[<flag>, --help]` 这种带额外参数的调用 ⇒ 闸门按位置算，不按"包含"算')
  const gateOk = runHelpOnly(join(dir, 'ok', 'lib', 'cli.js'), ['--help'], { cwd: probeCwd, timeoutMs: 8_000 })
  if (gateOk.rejected !== false || gateOk.status !== 0) problems.push(`runHelpOnly 把合法的 \`--help\` 形态也拒了（rejected=${String(gateOk.rejected)} rc=${String(gateOk.status)}）⇒ 尺没有输入`)

  const sentinelsAfter = readdirSync(dir, { recursive: true }).filter((name) => `${name}`.endsWith('cli.js.SENTINEL'))
  if (sentinelsBefore.length > 0 || sentinelsAfter.length > 0) {
    problems.push(`夹具留下 SENTINEL（判前 ${sentinelsBefore.length}、判后 ${sentinelsAfter.length}）⇒ 尺真跑了没带 --help 的命令（danger 包或裸子命令被放行）`)
  }

  rmSync(dir, { recursive: true, force: true })
  rmSync(probeCwd, { recursive: true, force: true })
  for (const problem of problems) console.error(`  × ${problem}`)
  if (problems.length > 0) process.exit(1)
  console.log(`check-cli-commands --self-check OK（10 个夹具包、${expectations.length} 条判决断言 + SENTINEL 探针与 spawn 闸门的正反两面：兑现 / 臆造命令 / 子命令拒帮助 / rc0 印父屏 / danger 跳过 / 拿不到表 / --commands 补表 / 非规范键 / 缺产物 / 没 bin 各判各的；每个夹具包都在"被真跑"时留下 SENTINEL，跑完 0 个 ⇒ 一次没带 --help 的命令都没执行）`)
  process.exit(0)
}


// --- 现量 -------------------------------------------------------------------

const pluginsDir = dirArg === undefined ? PLUGINS : resolve(dirArg)
const probeCwd = makeProbeDir('check-cli-commands')
let results
try {
  results = judgeAll({
    pluginsDir,
    probeCwd,
    only: onlyArg === undefined ? null : onlyArg.split(',').map((name) => name.trim()).filter(Boolean),
    timeoutMs: timeoutArg === undefined ? DEFAULT_TIMEOUT_MS : Number(timeoutArg),
  })
} finally {
  rmSync(probeCwd, { recursive: true, force: true })
}
if (onlyArg !== undefined && results.length === 0) {
  console.error(`  × --only ${onlyArg} 一个包都没筛到 ⇒ 筛空了不该报绿`)
  process.exit(1)
}

const counts = { dispatched: 0, absent: 0, 'refused-help': 0, 'skipped-danger': 0, 'help-not-scoped': 0, 'no-command': 0, unmeasured: 0 }
let entries = 0
let noPromise = 0
let notCli = 0
let unpromisedSubs = 0
const marks = { dispatched: '✓', 'skipped-danger': '·', 'no-command': '·' }
for (const result of results) {
  if (result.skipKind === 'no-cli-face' || result.skipKind === 'no-package') {
    notCli += 1
    continue
  }
  if (result.skipKind === 'no-promises') {
    noPromise += 1
    unpromisedSubs += result.unpromised?.length ?? 0
    continue
  }
  entries += result.rows.length
  unpromisedSubs += result.unpromised?.length ?? 0
  const tableNote = result.vocabulary !== null
    ? `<cli> --help rc=${result.helpRc} · 子命令表 ${result.vocabulary.size} 条${result.listFlag ? `（+ documented ${result.listFlag} rc=${result.listRc}）` : ''}`
    : result.danger?.declared ? 'danger ⇒ 一个进程都没起' : `<cli> --help rc=${result.helpRc ?? '未取到'} · 没拿到子命令表`
  console.log(`${result.id} ${result.bin} [${result.key ?? '-'}] · ${tableNote}`)
  for (const row of result.rows) {
    counts[row.state] = (counts[row.state] ?? 0) + 1
    console.log(`  ${marks[row.state] ?? '×'} ${row.command ?? '(无命令)'} · ${row.state}${row.rc === null || row.rc === undefined ? '' : ` rc=${row.rc}`}${row.note ? ` — ${row.note}` : ''}`)
  }
  if (result.unpromised?.length > 0) {
    console.log(`  · CLI 有而清单没承诺的子命令（只报数，不判红）：${result.unpromised.join(' ')}`)
  }
}
const red = RED_STATES.reduce((sum, state) => sum + (counts[state] ?? 0), 0)
console.log(`check-cli-commands: ${results.length} 个包 = ${notCli} 个没有终端面（无 bin/./cli/./help）+ ${noPromise} 个有终端面但清单里一条 cli 承诺都没写 + ${results.length - notCli - noPromise} 个承诺了东西；被判决的承诺文案 ${entries} 条`)
console.log(`  dispatched ${counts.dispatched} / absent ${counts.absent} / refused-help ${counts['refused-help']} / skipped-danger ${counts['skipped-danger']} / help-not-scoped ${counts['help-not-scoped']} / no-command ${counts['no-command']} / unmeasured ${counts.unmeasured}`)
console.log(`  CLI 侧有、清单没承诺的子命令合计 ${unpromisedSubs} 条（不判红；danger 的包一条都没跑，所以那个数只覆盖非 danger 的包）`)
console.log('  判据：承诺的 `<bin> <子命令>` 必须在 `<cli> --help` 的子命令表里，且 `<cli> <子命令> --help` rc=0 并打印自己的屏')
console.log('  不证明：命令产出正确输出、参数被吃、与宿主面（ctx.*）的接线（那是下一段腿）')
if (red > 0) {
  console.error(`check-cli-commands: FAIL（假承诺 ${counts.absent}、拒帮助 ${counts['refused-help']}、父屏兜底 ${counts['help-not-scoped']}、读不到 ${counts.unmeasured}）`)
  process.exit(1)
}
console.log('清单承诺的每条命令都在 CLI 自己的子命令表里、且 --help 打得来')
