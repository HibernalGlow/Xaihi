/**
 * migratef 的 `MigratefRuntime` 落地实现：逐字搬 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/migratef/src/platform.ts` 里除剪贴板之外的全部（`:1-33` 的工厂与
 * `:76-117` 的 `pathInfo` / `listDir` / `movePath` / `readText` / `writeText`），
 * 改动只有两处，都在下面点名：
 *
 * 1. `defaultHistoryPath`（上游 `:31`）不再从 `@xiranite/config` 推路径，而是**响亮拒绝**。
 *    上游那一行是 `join(dirname(resolveXiraniteConfigPath()), "artifacts", "undo",
 *    "migratef.undo.json")`，前提是"配置住在后端一个 toml 里"，那条通路整块不搬
 *    （`docs/adr/0013-config-goes-through-dsh-settings.md`）。`docs/adr/0003-migrated-node-file-state.md`
 *    决定 2 给的替代是：**账本路径必须由使用者显式给出**（本包 `Config.historyPath`，
 *    默认空串 = 没给），没给就不许动手。为什么这里选"抛"而不是"回落到某个默认目录"：
 *    内核取路径的式子是 `input.historyPath || runtime.defaultHistoryPath()`
 *    （`core.ts:362-364`，逐字未改），回落就等于把撤销账本写进一个没人知道的地方；
 *    而 `executePlan` 是**先搬完文件再记账本**（`core.ts:269`），所以只靠这一层还不够——
 *    `src/index.ts` 与 `src/cli.ts` 都在动第一条文件之前就闸门（`requireHistoryPath`）。
 *    这一层是兜底：那道闸门哪天被删掉，这里仍然拒绝，不静默。
 * 2. import 说明符 `./core.js` → `./core.ts`（本仓 ESM 用 `.ts` 源扩展名，与
 *    `crashu` / `formatv` / `dissolvef` 同写法）。
 *
 * 这里也**不引 `ctx.subprocess`**、不搬 `readClipboardText()`（上游 `:35-74`，走
 * `node:child_process` 的 `execFile`）：它不属于 `MigratefRuntime` 那 17 个方法，
 * 唯一的上游消费者是终端的 `guided` 腿（`cli.ts:394` `pathsFromClipboard`），而那条腿在
 * 本包是响亮拒绝的未接面（见 `src/cli.ts` 文件头）。缺口同 `docs/service-mapping.md` 的
 * **G5**（`crashu/src/platform.ts` 那条），不另立一个新号。
 *
 * 为什么这里还是 `node:fs` 而不是 DSH 的 `ctx.fs`：ADR-0003 决定 1，与 `crashu` /
 * `formatv` 判的是同一件事——`ctx.fs` 面向**模型发起的工具调用**，要求路径收成不透明
 * `FsTarget`、禁止解析、禁止假设本地绝对路径，而这个内核要 `resolve`/`dirname`/`isAbsolute`
 * 的路径算术、要 `rename`、要 `cp -r`、要 `rm -r`。权限边界因此靠**动作分级**：
 * `danger.type` 是上游那份 `pluginExport`（`is_dangerous`），经 `defineNode` 的
 * `dangerCheck` 变成 DSH 的 `ask`，审批与审计全在宿主（判定面的落差见 `src/index.ts`）。
 *
 * 枚举/改动语义与上游一致，逐条写着是因为它们都会被"顺手优化"改掉：
 * - `pathInfo` 先 **`resolve(path)`** 再 **`lstat`**（上游用的是 `lstat`，不是 `stat`）：
 *   符号链接本身会被读成"既不是 file 也不是 directory"，返回的是解析后的路径。
 *   `crashu` 那份用的是 `stat`（跟随软链），两份不同，别统一。
 * - `listDir` 用 `readdir(withFileTypes)`：`Dirent` 不跟随符号链接 ⇒ 目录里的软链既不是
 *   file 也不是 directory，内核 `collectFiles` 那里被静默跳过；顺序 = OS 返回顺序，不排序。
 * - `copyFile` 是 `cp(force: true)`（**覆盖**），先 `mkdir(dirname(target))`；
 *   `copyDir` 是 `cp(recursive, force: false, errorOnExist: true)` ⇒ 目标已存在就抛，
 *   这一条与 `mergeExistingDirectories` 的"合并而不是覆盖"判据是配对的。
 * - `movePath` 先 `mkdir(dirname(target), {recursive:true})` 再 `rename`，
 *   **`rename` 抛错时兜一条 `cp(recursive, force:false, errorOnExist:true)` + `rm(source)`**
 *   （上游 `:96-104`）——跨卷与"目标已存在"就在这条兜底上分出成败；与 `crashu` 同款。
 * - `deletePath` 是 `rm(recursive:true, force:true)`：`force` 意味着"不存在也不报错"。
 *   undo 回放 copy 批次走它，所以"删一个已经不存在的复制目标"不会失败。
 * - `readText` 把任何读取失败咽成 **`null`**（上游 `:106-112`）：内核
 *   `parseMigratefHistory(null)` 回空数组 ⇒ 账本文件不存在时 `history` 是"0 条记录"，
 *   `undo` 是 `No undoable batch found.`，而不是抛。
 * - `writeText` 先 `mkdir(dirname(path))` 再 `writeFile` ⇒ 账本目录不需要调用方建。
 * - `randomId` 是 `crypto.randomUUID().slice(0, 8)`（全局 WebCrypto，Node 22 起自带，
 *   不引 `node:crypto`）；`now` 是 `() => new Date()`。
 *
 * @module xaihi-migratef/platform
 */

import { cp, lstat, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import type { MigratefAction, MigratefDirEntry, MigratefInput, MigratefPathInfo, MigratefRuntime } from "./core.ts"

/**
 * 账本路径没给时的那句拒绝。**名字要点名到 `Config.historyPath`**，
 * 因为它是唯一能被使用者改到的出口（`docs/adr/0013-config-goes-through-dsh-settings.md`）。
 * `src/index.ts` / `src/cli.ts` 的前置闸门与 `src/platform.ts` 的兜底共用这一份文案，
 * 抄两份就会漂；测试也读这一个常量。
 */
export const HISTORY_PATH_UNSET = 'migratef: no undo journal path configured. Set Config.historyPath (DSH settings面) or pass historyPath explicitly. 撤销账本的位置必须由使用者给出（ADR-0003 决定 2）：本包不从配置文件位置推默认目录。'

/**
 * 哪些动作会碰撤销账本。`plan` 与预演下的 `move` / `copy` **不碰**：内核在计划分支就
 * return 了（`core.ts:123-129`），`recordUndoIfNeeded` 只在执行分支被调（`core.ts:269`）。
 * 这条判据决定了"没配 `historyPath` 时这个节点还剩什么能用"，所以它必须只有一份。
 */
export function needsHistoryPath(action: MigratefAction, dryRun: boolean): boolean {
  if (action === "history" || action === "undo") return true
  return (action === "move" || action === "copy") && !dryRun
}

/**
 * 动手之前的账本闸门（ADR-0003 决定 2）：**没给出处就不搬第一条文件**。
 *
 * 为什么不能只靠下面 `defaultHistoryPath()` 那句抛：内核 `executePlan` 是
 * **先搬文件、后记账本**（`core.ts:269`），等它走到那一格已经太晚。
 * 宿主半边（`src/index.ts`）与独立 bin（`src/cli.ts`）都调这一颗，所以判据与文案都只有一份；
 * 它住在 `platform.ts` 而不是 `index.ts`，是因为 bin 不许 import `index.ts`
 * （那会把 cordis 与 SDK 拉进一个只跑 Node 的可执行文件，`formatv/src/report-defaults.ts`
 * 记的是同一条约束）。
 */
export function requireHistoryPath(action: MigratefAction, input: MigratefInput): void {
  if (!needsHistoryPath(action, input.dryRun === true)) return
  if ((input.historyPath ?? "") !== "") return
  throw new Error(`migratef ${action}: ${HISTORY_PATH_UNSET}`)
}

export function createNodeMigratefRuntime(): MigratefRuntime {
  return {
    pathInfo,
    listDir,
    ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    copyFile: async (source, target) => {
      await mkdir(dirname(target), { recursive: true })
      await cp(source, target, { force: true })
    },
    copyDir: async (source, target) => {
      await mkdir(dirname(target), { recursive: true })
      await cp(source, target, { recursive: true, force: false, errorOnExist: true })
    },
    movePath,
    deletePath: (path) => rm(path, { recursive: true, force: true }),
    readText,
    writeText,
    join,
    dirname,
    basename,
    isAbsolute,
    resolve,
    now: () => new Date(),
    randomId: () => crypto.randomUUID().slice(0, 8),
    // 上游这里是 `join(dirname(resolveXiraniteConfigPath()), "artifacts", "undo", "migratef.undo.json")`。
    // 见文件头第 1 条：那是"没给路径时唯一不许静默发生的事"，所以是一声拒绝而不是一个默认目录。
    defaultHistoryPath: () => {
      throw new Error(HISTORY_PATH_UNSET)
    },
  }
}

async function pathInfo(path: string): Promise<MigratefPathInfo> {
  const resolved = resolve(path)
  try {
    const stat = await lstat(resolved)
    return { path: resolved, exists: true, isFile: stat.isFile(), isDirectory: stat.isDirectory() }
  } catch {
    return { path: resolved, exists: false, isFile: false, isDirectory: false }
  }
}

async function listDir(path: string): Promise<MigratefDirEntry[]> {
  const entries = await readdir(path, { withFileTypes: true })
  return entries.map((entry) => ({
    name: entry.name,
    path: join(path, entry.name),
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
  }))
}

async function movePath(source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  try {
    await rename(source, target)
  } catch {
    await cp(source, target, { recursive: true, force: false, errorOnExist: true })
    await rm(source, { recursive: true, force: true })
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, "utf8")
}
