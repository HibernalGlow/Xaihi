/**
 * mvz 的 `MvzRuntime` 落地实现。两条运行时，对应两个面：
 *
 * 1. `createNodeMvzRuntime(seam, cwd)` —— **宿主半边**（`src/index.ts`）。外部程序这一格
 *    从上游的 `node:child_process.execFile`（基线 `packages/nodes/mvz/src/platform.ts:72-85`）
 *    换成 **DSH 的 `ctx.subprocess`**：`docs/service-mapping.md`「子进程 / 命令执行 ⇒ 不搬」那一行
 *    定的就是这条（先例 `plugins/sleept/src/exec.ts`、`plugins/recycleu/src/exec.ts`），
 *    `core.ts` 一行都不碰机器，所以"不在内核里 shell out"这条由类型系统保证：内核只认
 *    `MvzRuntime` 那 8 个方法（`core.ts:32-41`，本文件行号以下均指基线那份 platform.ts）。
 * 2. `createMvzPlanRuntime()` —— **终端半边**（`src/cli.ts`）。独立 bin 不在宿主进程里，
 *    拿不到 `ctx.subprocess` ⇒ 碰外部程序的两个方法**当场抛拒答**（缺口 G1/G6 那一类：
 *    缝活在插件进程里，能装进 `$PATH` 的那一面活在它外面）。`cli.ts` 在调内核**之前**就先拒绝
 *    非预演的动作，所以这两个 throw 是第二道兜底：万一将来内核让 `dryRun` 也能走到这儿，
 *    炸的是这一句，不是偷偷 spawn。
 *
 * DI 缝 → 出处（逐条）：
 * - `find7z` → `ctx.subprocess.resolveExecutable(name)`（`dsh-subprocess/lib/types/index.d.ts:88`；
 *   `desktop/dsh/docs/subsystems/subprocess.md:11` 那段 "Executable lookup"：裸名走 provider
 *   洗过的 `PATH`，绝对路径做校验）。上游用 `which` / `where.exe` **起进程**去找
 *   （`:65-70`），这里换成缝自带的查找回合，**候选名单与顺序逐字保留**
 *   （`SEVEN_ZIP_NAMES` 六条 + 三条 Windows 固定路径），少起的正是那条定位进程。
 *   查不到 ⇒ 试下一个，六个都没有再落三条固定路径，全空 ⇒ `null`，由 `core.ts:113` 那句
 *   "7-Zip executable was not found…" 出面（不在这里另写一句失败）。
 * - `runCommand` → `ctx.subprocess.spawn(spec)`（同一份 `.d.ts:102`）。`argv` 永不经 shell 解释，
 *   这条缝 applies no defaults：`stdio` 三根都要显式给。`maxBuffer: 16 MiB`（`:75`）换成
 *   `stdout`/`stderr` 各自的 `maxBytes: 16 MiB` 收集上限；差别写明：execFile 超限是**报错**，
 *   缝是**留尾**（`CollectedOutput.truncated`），所以超限时 stdout 会短、`code` 仍是真退出码。
 * - `exists` / `ensureDir` → `node:fs/promises` 的 `access` / `mkdir`（`:1-3`、`:14`）：
 *   与 `docs/adr/0003-migrated-node-file-state.md` 决定 1 判的是同一件事——`ctx.fs`
 *   （`dsh-fs`）只有 `resolve/stat/lstat/readText/listDir/writeText/editText` 这一族**读文本与
 *   原子写**动词，装不下"要 `join`/`dirname` 的路径算术 + 建目录"，硬套等于把可审计的 DI 缝
 *   换成禁止解析的不透明 `FsTarget`。
 * - `dirname` / `basename` / `extname` / `join` → `node:path`（`:4`），纯函数。
 * - 上游的 `readClipboardText()`（`:22-38`）**没搬**：它不属于 `MvzRuntime`，唯一的消费者是
 *   终端的 `guided` 腿（上游 `cli.ts:395`），而那条腿在本包是响亮拒绝的未接面（见 `src/cli.ts`）。
 *   与 G5（`plugins/crashu/src/platform.ts` 记的同一条）同一个处置：不搬、不伪造。
 *
 * 类型层的两件事，都是**本仓的债**不是 DSH 的缺口：
 * - `MvzSubprocessSeam` 及伴生类型是 `@deepseek-ai/dsh-subprocess` 已发布 `.d.ts` 的
 *   **子集镜像**（照 `lib/types/index.d.ts:75-111` 与 `lib/types/types.d.ts` 的
 *   `SubprocessSpawnSpec` / `SubprocessHandle` / `SubprocessOutcome` / `SubprocessStdio` 抄），
 *   因为本包现在没声明那个依赖：装了 `findz` / `sleept` / `recycleu` 那份
 *   `@deepseek-ai/dsh-subprocess@0.2.0-rc.2` 需要一次 `pnpm install`，本批不许跑。
 *   取用时走 `ctx.get('subprocess')`（`docs/xaihi-migration` 那条口径：判服务在不在以运行时
 *   `ctx.get(name)` 为准），依赖补上之后应改回 `import type` + `ctx.subprocess`，届时删掉这份镜像。
 * - 退出码那格 `exitCode ?? 0` **照抄上游的怪**：上游是
 *   `error && typeof error.code === "number" ? error.code : 0`（`:76`），于是"被信号杀掉"与
 *   "根本没起起来"都回 **0**，也就是**成功**。这条不是我们加的，是上游的；这里保持不动并钉进
 *   `tests/core.spec.ts`，因为它会直接影响 `delete`/`move` 那条 `code === 0 || code === 1` 的宽判。
 *   真要改得先成为一条被点名的偏离，不在这里顺手改。
 *
 * @module xaihi-mvz/platform
 */

import { access, mkdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { MvzCommandResult, MvzRuntime } from './core.ts'

/** 基线 `:7` 那份名单，一条不减、顺序不改（先 `7z` 再 `7za` 再 `7zz`，各带 `.exe` 变体）。 */
const SEVEN_ZIP_NAMES = ['7z', '7z.exe', '7za', '7za.exe', '7zz', '7zz.exe']

/** 收集上限：对齐基线 `:75` 那个 `maxBuffer: 1024 * 1024 * 16`。 */
const MAX_OUTPUT_BYTES = 1024 * 1024 * 16

/**
 * `SubprocessSpawnSpec.graceMs` 要求的正有限宽限期（`types.d.ts` 的 spec 段：本缝不给默认值）。
 * 本包从不主动 `terminate()`——取消信号到不了节点调用（缺口 G3），所以这个数字今天唯一的作用是
 * 满足 spec 的"必须显式给"。5 秒与 `plugins/sleept/src/exec.ts` 那份默认宽限期同一量级。
 */
const SPAWN_GRACE_MS = 5000

/**
 * 拒答那句：终端面与运行时抛的是**同一句**（一份真源，别处不许再抄）。
 * `src/cli.ts` 把它写进 stderr 与 `--json` 的 `refused` 字段。
 */
export const MVZ_PROCESS_SEAM_REFUSAL =
  'mvz 执行 7-Zip 一律走 DSH 的 `ctx.subprocess`（`src/platform.ts`），独立 bin 不在宿主进程里，'
  + '拿不到那条缝（缺口 G1/G6 那一类：缝活在插件进程里，`$PATH` 上那一面活在它外面）。'
  + '这里只出预演计划；要真跑请用宿主侧的工具 `mvz_extract` / `mvz_move` / `mvz_delete` / `mvz_rename`'
  + '（`danger` 会把非预演那次变成 DSH 的 `ask`）。'

/** `SubprocessOutcome`（`dsh-subprocess/lib/types/types.d.ts`）里本包用到的那一格。 */
export interface MvzSubprocessOutcome {
  /** 退出码；被信号杀掉时是 `null`。 */
  exitCode: number | null
}

/** `SubprocessOutputRead`（`dsh-subprocess/lib/types/types.d.ts`）里本包用到的那一格。 */
export interface MvzSubprocessOutputRead {
  text: string
}

/** `SubprocessOutputReader.readFrom(0)`：退出之后仍可读到全文（offset 式、非消费式）。 */
export interface MvzSubprocessOutputReader {
  readFrom(fromByte: number): MvzSubprocessOutputRead
}

/** `SubprocessHandle` 里本包用到的两格（其余流式能力本节点用不上）。 */
export interface MvzSubprocessHandle {
  /** 收集到的 stdout/stderr，退出之后仍然可读。 */
  readonly collected: {
    readonly stdout?: MvzSubprocessOutputReader
    readonly stderr?: MvzSubprocessOutputReader
  }
  /** 退出事实；spawn 或 provider 失败时 reject。 */
  readonly done: Promise<MvzSubprocessOutcome>
}

/**
 * `SubprocessSpawnSpec` 中本包给得到的那几格（`index.d.ts:102` 要求"全部显式"：
 * `argv`、`cwd`、`stdio`、`graceMs` 一个都不给默认）。
 */
export interface MvzSubprocessSpawnSpec {
  readonly argv: readonly string[]
  readonly cwd: string
  readonly stdio: {
    readonly stdin: 'ignore' | 'pipe' | { readonly data: string }
    readonly stdout: 'pipe' | 'inherit' | { readonly maxBytes: number }
    readonly stderr: 'pipe' | 'inherit' | { readonly maxBytes: number }
  }
  readonly graceMs: number
}

/**
 * `SubprocessRuntime`（`dsh-subprocess/lib/types/index.d.ts:75-111`）里本包用到的两个方法。
 * 装进宿主时 `ctx.subprocess` 的真实实现结构上比这份宽，所以按子集取用是安全的。
 */
export interface MvzSubprocessSeam {
  /** 裸名走 provider 洗过的 `PATH`；绝对路径做校验。找不到就抛。 */
  resolveExecutable(command: string, env?: Readonly<Record<string, string>>, signal?: AbortSignal): Promise<string>
  /** 同步拿到活句柄；失败经 `done` reject。 */
  spawn(spec: MvzSubprocessSpawnSpec): MvzSubprocessHandle
}

/**
 * 宿主半边的运行时。
 * @param subprocess - DSH 的 `ctx.subprocess`（`index.ts` 用 `ctx.get('subprocess')` 取）。
 * @param cwd - 子进程工作目录：基线那侧是 `execFile` 的隐式默认（进程自己的 cwd），
 *   这条缝要求显式给，所以调用方把 `process.cwd()` 交进来，行为与基线同一格。
 */
export function createNodeMvzRuntime(subprocess: MvzSubprocessSeam, cwd: string = process.cwd()): MvzRuntime {
  return {
    find7z: () => find7z(subprocess),
    runCommand: (command, args) => runCommand(subprocess, cwd, command, args),
    exists,
    ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    dirname,
    basename,
    extname,
    join,
  }
}

/**
 * 终端半边的运行时：只够出计划。`core.ts` 在 `dryRun` 为真时**不会**碰这四格里的
 * `find7z` / `runCommand`（`core.ts:112,144,218`），`exists` / `ensureDir` 同样只在非预演那
 * 一条路上出现，所以带进来的 `node:fs` 在今天这条路上也是零次调用——留着是为了让
 * "预演"这一步与宿主面用的是同一份内核，而不是终端面另写一个假内核。
 */
export function createMvzPlanRuntime(): MvzRuntime {
  const refuse = (): never => {
    throw new Error(MVZ_PROCESS_SEAM_REFUSAL)
  }
  return {
    find7z: async () => refuse(),
    runCommand: () => refuse(),
    exists,
    ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    dirname,
    basename,
    extname,
    join,
  }
}

/** 基线 `:40-54` 的查找顺序：六个 PATH 名 → 三条 Windows 固定路径 → `null`。 */
async function find7z(subprocess: MvzSubprocessSeam): Promise<string | null> {
  for (const name of SEVEN_ZIP_NAMES) {
    const found = await resolveOnPath(subprocess, name)
    if (found) return found
  }

  for (const candidate of [
    'C:\\Program Files\\7-Zip\\7z.exe',
    'C:\\Program Files (x86)\\7-Zip\\7z.exe',
    join(process.env.LOCALAPPDATA ?? '', '7-Zip', '7z.exe'),
  ]) {
    if (candidate && await exists(candidate)) return candidate
  }
  return null
}

/**
 * 一次查找。缝是"抛错式"的（`SubprocessExecutableNotFoundError`），基线是"`which` 退出码非 0"，
 * 两者在这里落到同一个 `null`，好让 `find7z` 继续试下一个候选。
 */
async function resolveOnPath(subprocess: MvzSubprocessSeam, command: string): Promise<string | null> {
  try {
    return await subprocess.resolveExecutable(command)
  } catch {
    return null
  }
}

/**
 * 一次外部命令。
 *
 * `options.cwd` **不接**：基线那份也没接（`platform.ts:72` 的实现签名里只有 `command, args`），
 * 内核也从没给过第三个参；这里不替它长一条上游没有的能力。
 */
async function runCommand(
  subprocess: MvzSubprocessSeam,
  cwd: string,
  command: string,
  args: string[],
): Promise<MvzCommandResult> {
  const started = Date.now()
  try {
    const handle = subprocess.spawn({
      argv: [command, ...args],
      cwd,
      graceMs: SPAWN_GRACE_MS,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: MAX_OUTPUT_BYTES },
        stderr: { maxBytes: MAX_OUTPUT_BYTES },
      },
    })
    const outcome = await handle.done
    return {
      // 上游的怪：非数字退出码一律折成 0（见文件头最后一条）。信号杀掉的 `null` 因此也是"成功"。
      code: outcome.exitCode ?? 0,
      stdout: handle.collected.stdout?.readFrom(0).text ?? '',
      stderr: handle.collected.stderr?.readFrom(0).text ?? '',
      durationMs: Date.now() - started,
    }
  } catch (error) {
    // 基线那侧 spawn 失败进的是 `execFile` 的 error 回调：`error.code` 是字符串 ⇒ 折成 0，
    // `stderr` 取 `error.message`（`:77-81`）。同一条折法留在这里。
    return {
      code: 0,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    }
  }
}

/** 基线 `:56-63`：`access(path, F_OK)`，读不到就算不存在。 */
async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}
