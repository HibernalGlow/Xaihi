/**
 * cleanf 的 `CleanfRuntime` 落地实现：从 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/cleanf/src/platform.ts` 搬，**逐调用**决定落到哪条缝，
 * 没有缝的那一条响亮拒绝（台账里这个节点的 hostRequirements 是
 * `os-native` + `recursive-enumeration` + `file-io`）。
 *
 * 逐调用清单（行号指基线那份文件）：
 *
 * | 上游那一格 | 上游用什么做 | 本仓落点 | 判据 |
 * |---|---|---|---|
 * | `scanPath` / `walkDirectory`（`:89-125`） | `node:fs/promises` 的 `lstat` + `readdir(withFileTypes)` 递归 | **继续 `node:fs`**，逐字搬 | `docs/adr/0003-migrated-node-file-state.md` 决定 1 判的是同一件事：DSH 的 `ctx.fs`（`desktop/dsh/docs/subsystems/filesystem.md:5`）自述是"原子文本操作 + 可选守卫"，已发布 `.d.ts` 的成员只有 `resolve/processPath/fileUrl/contains/stat/lstat/readText/streamText/readBytes/readByteRange/listDir/writeText/editText/watch`——**一个删除/改名/建目录的动词都没有**，而且路径要收成不透明 `FsTarget`、明令"不得解析、不得假设本地绝对路径"（`filesystem.md:13,296`）。这个内核要的是深度、`parentPath` 算术、以及"某一层的 `readdir` 失败就跳过该层继续走"那条容错（`:103-107`），换成 `FsTarget` 就是反向工作。 |
 * | `removeTargets`（`:127-162`） | `@xiranite/file-operations` 的 `FileOperationService` + `PlatformFileMutationProvider`，`kind: "trash"` + 撤销批次 | **可见拒绝**（今天没有这条缝） | 见下面"为什么是拒绝不是替代"。 |
 * | `undoLatest` / `undoState`（`:33-44`） | 同上那份 `FileOperationService` | **不给这两个方法** ⇒ 由内核自己说 `Cleanf undo is unavailable in this runtime.`（`core.ts:321-323`） | 拒绝那句用内核原本就有的那句，不在这里另编。 |
 * | `readClipboardText`（`:48-73`） | `node:child_process` 的 `execFile`（`pbpaste` / `powershell` / `xclip`…） | **没搬** | 它不属于 `CleanfRuntime` 那 4 个方法，唯一消费者是终端的 `guided` 腿（上游 `cli.ts:307`），而那条腿在本包是响亮拒绝的未接面。与 G5（`plugins/crashu/src/platform.ts`）同一个处置：不搬、不伪造；真要接走 `ctx.subprocess`，不在这里自己 spawn。 |
 *
 * 为什么 `removeTargets` 是**拒绝**而不是"找个替代先跑起来"：
 * - `ctx.fs` 没有删除动词（成员名单就在上面那格，实测自 0.2.0-rc.2 发布物
 *   `@deepseek-ai/dsh-fs/lib/types/index.d.ts`）；
 * - `ctx.shell` 是 bash/PowerShell 那条**模型面**执行缝
 *   （`desktop/dsh/docs/subsystems/shell.md:5`：Service Definition 是 `dsh-shell`，
 *   Consumers 是 model-facing tools；managed-range 机制在 `subprocess.md`）。
 *   拿它去拼一条"移到回收站"的系统命令，等于自己发明一份跨平台 trash 实现
 *   （macOS 走 `osascript`、Windows 走 PowerShell 的 `Microsoft.VisualBasic.FileIO`、
 *   Linux 走 `gio trash`），而上游那份是**一个有撤销账本的领域服务**，不是一句命令；
 * - `docs/service-mapping.md`「搬（DSH 没有，且工作台/节点直接依赖）」那张表里
 *   "可恢复删除 + 删除历史（`file-operations` 的 recoverable 部分）"本来就判的是"要搬"，
 *   批注是"批次 C 之前落，v1 不做"——那份东西到今天没落地（本仓 `plugins/**` 里
 *   `file-operations` / `FileOperationService` 零命中，实测）。
 *
 * 于是今天的形状是：**上游那句拒绝被原样保留**。基线 `:131-134` 本来就写着
 * "撤销不可用时不许动手"：
 *
 * > `throw Object.assign(new Error("Recycle-bin restore is unavailable; Cleanf refused to run without undo support."), { code: "ENOTSUP" })`
 *
 * 本仓没有可恢复删除的提供方，所以 `undoState()` 交上来的就是
 * `{ trashRestore: false }`，上面那一刀在**一个文件都没碰之前**落下。
 * 这句话与这个 `ENOTSUP` 都不是我们编的文案，是上游代码里的原话（`tests/core.spec.ts` 钉住它）。
 * 这一格缺口是新发现的，报告里记作 **G10**（`docs/service-mapping.md` 的 G1–G9 里没有它）。
 *
 * 预演那一条腿是**真能跑的**：`core.ts` 在 `preview` 为真时只走 `scanPath`，
 * 一次 `removeTargets` 都不调（`core.ts:289-296`），所以节点不是"整体不可用"，
 * 而是"计划可用、执行可见地不可用"——这条差别在界面上读得回来（AGENTS.md 的降级铁律）。
 *
 * 枚举语义一条都不"改进"（这些都会被顺手改掉）：
 * - `scanPath` 先 `resolve(path)` 再 `lstat`，**不是目录就抛** `Path is not a directory: <root>`
 *   （`:90-94`）；这一句是 platform 说的话，不是内核的，别挪。
 * - `walkDirectory` 从 **depth 1** 起算（`:97`），根目录自己**不进** items；
 *   某一层的 `readdir` 抛错 ⇒ **吞掉并返回**，那一层以下的子树就此缺失（`:103-107`）。
 *   这是上游的容错选择，不是 bug，不在这里改成上抛或重试。
 * - `Dirent` 不跟随符号链接 ⇒ 既不是 file 也不是 directory 的条目被**静默跳过**（`:111`），
 *   软链目录也不会下钻；顺序 = OS 返回顺序，不排序。
 *
 * @module xaihi-cleanf/platform
 */

import { lstat, readdir } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { CleanfItem, CleanfRemovalResult, CleanfRuntime, CleanfTarget } from './core.ts'
import { sortTargetsForRemoval } from './core.ts'

/** 基线 `:15` 那份批大小，一条不改（撤销批次的粒度就是它）。 */
const FILE_OPERATION_BATCH_SIZE = 256

/**
 * `@xiranite/file-operations` 的词表镜像（**子集**）：本包不许真的依赖那个包
 * （`workspace:*`，见 `docs/adr/0002-self-contained-plugin-packages.md`）。
 * 形状逐条抄自基线 `packages/file-operations/src/types.ts:146-192` 与
 * `executor.ts:3-5`；只留 cleanf 用得到的那几格。
 * 这一层将来由 Xaihi 侧的可恢复删除提供方（G10）来填实现，填的时候**不要**改这份词表的名字。
 */
export interface CleanfFileMutation {
  kind: 'trash'
  sourcePath: string
}

/** 基线 `types.ts:146-150` 的 `FileOperationRequest`（本包只用到前两格）。 */
export interface CleanfFileOperationRequest {
  operations: readonly CleanfFileMutation[]
  concurrency?: number | undefined
}

/** 基线 `types.ts:163-172` 的 `FileOperationBatchResult`（本包只读这五格）。 */
export interface CleanfFileOperationBatchResult {
  succeeded: number
  failed: number
  cancelled: number
  undoable: number
  undoId?: string
}

/** 基线 `types.ts:185-192` 的 `FileUndoResult`（本包只读那两格）。 */
export interface CleanfFileUndoResult {
  succeeded: number
  failed: number
}

/**
 * 基线 `types.ts:174-183` 的 `FileUndoState`（本包只读这两格）。
 * `trashRestore` 就是基线 `:131-134` 那一刀看的值：假 ⇒ 不许动手。
 */
export interface CleanfFileUndoState {
  available: boolean
  count: number
  persistent: boolean
  trashRestore: boolean
}

/** 基线 `executor.ts:3-5` 那条 `FileOperationExecutor`，外加 `:17-19` 那两个可选方法。 */
export interface CleanfFileOperations {
  execute(request: CleanfFileOperationRequest): Promise<CleanfFileOperationBatchResult>
  undoLatest?(): Promise<CleanfFileUndoResult>
  undoState?(): CleanfFileUndoState
}

/** 基线 `:22-24` 那个注入点的等价物：提供方从外面给，本包自己长不出第二条通路。 */
export interface CleanfRuntimeContext {
  fileOperations?: CleanfFileOperations
}

/**
 * 本仓今天的默认提供方：**报告"回收站恢复不可用"，并在动手之前拒掉整次移除**。
 *
 * `execute()` 在当前的 `removeTargets` 里是**走不到**的（`undoState().trashRestore === false`
 * 那一刀在它前面）。留着它是为了让"万一那刀被改掉"变成一次响亮失败，而不是一次静默删除——
 * 这一层没有任何东西可以把文件放进回收站。
 */
export function refusingFileOperations (): CleanfFileOperations {
  return {
    execute: () => {
      throw cleanfTrashUnavailableError()
    },
    undoState: () => ({ available: false, count: 0, persistent: false, trashRestore: false }),
  }
}

/**
 * 基线 `:28-46` 那份工厂，形状不动：没有 `fileOperations` 时**不再**去长一份
 * standalone（基线 `:164-178` 的 `getStandaloneFileOperations()` 依赖
 * `createMemoryFileOperationStore` + `PlatformFileMutationProvider`，那是被删掉的
 * `os-native` 那一半）。留 `undoLatest` / `undoState` 的条件分支原样：
 * 提供方没给这两个方法时，`CleanfRuntime` 上它们就是 `undefined`，
 * 内核因此回它自己的那句 `Cleanf undo is unavailable in this runtime.`（`core.ts:322`）。
 *
 * @param context - 注入的撤销提供方；本仓今天没有，缺省即"拒绝"。
 */
export function createNodeCleanfRuntime (context: CleanfRuntimeContext = {}): CleanfRuntime {
  const fileOperations = context.fileOperations ?? refusingFileOperations()
  const providedUndoLatest = fileOperations.undoLatest
  const providedUndoState = fileOperations.undoState
  return {
    scanPath,
    removeTargets: (targets) => removeTargets(targets, fileOperations),
    // 基线 `:33-44` 那两个 `? ... : undefined` 在这里改成条件展开：`tsconfig.base.json` 开了
    // `exactOptionalPropertyTypes`，而 `CleanfRuntime`（`core.ts:147-148`，逐字抄上游）那两格是
    // `undoLatest?:` —— "显式给 undefined" 与 "没有这个键" 在 EOPT 下是两件事，前者过不了类型。
    // 读侧语义一个字都没变：内核判的就是 `!runtime.undoLatest`（`core.ts:378`）与
    // `runtime.undoState?.()`（`core.ts:384`），键缺失读出来同样是 `undefined`。
    ...(providedUndoLatest ? {
      undoLatest: async () => {
        const result = await providedUndoLatest()
        return { succeeded: result.succeeded, failed: result.failed }
      },
    } : {}),
    ...(providedUndoState ? {
      undoState: () => {
        const state = providedUndoState()
        return { available: state.available, count: state.count, persistent: state.persistent }
      },
    } : {}),
  }
}

/** 基线 `:89-99`：`resolve` → `lstat` → 不是目录就抛，然后从 depth 1 开始递归。 */
async function scanPath (path: string): Promise<CleanfItem[]> {
  const root = resolve(path)
  const stat = await lstat(root)
  if (!stat.isDirectory()) {
    throw new Error(`Path is not a directory: ${root}`)
  }

  const items: CleanfItem[] = []
  await walkDirectory(root, 1, items)
  return items
}

/** 基线 `:101-125`：见文件头那三条枚举语义（吞错、跳过非 file/dir、不下钻软链、不排序）。 */
async function walkDirectory (path: string, depth: number, items: CleanfItem[]): Promise<void> {
  let entries
  try {
    entries = await readdir(path, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const childPath = join(path, entry.name)
    if (!entry.isDirectory() && !entry.isFile()) continue

    items.push({
      path: childPath,
      name: entry.name,
      type: entry.isDirectory() ? 'dir' : 'file',
      parentPath: path,
      depth,
    })

    if (entry.isDirectory()) {
      await walkDirectory(childPath, depth + 1, items)
    }
  }
}

/**
 * 基线 `:127-162` 逐字，**包括那一刀拒绝**：`undoState()` 报"回收站恢复不可用"时，
 * 在排批次、在碰任何一个文件之前抛 `ENOTSUP`。
 * 今天本仓没有可恢复删除的提供方（G10），所以每一条非预演的路都停在这里。
 */
async function removeTargets (
  targets: CleanfTarget[],
  fileOperations: CleanfFileOperations,
): Promise<CleanfRemovalResult> {
  const initialUndoState = fileOperations.undoState?.()
  if (initialUndoState && !initialUndoState.trashRestore) {
    throw cleanfTrashUnavailableError()
  }

  let removed = 0
  let skipped = 0
  let undoable = 0
  let undoBatchCount = 0

  const ordered = sortTargetsForRemoval(targets)
  for (let offset = 0; offset < ordered.length; offset += FILE_OPERATION_BATCH_SIZE) {
    const batch = ordered.slice(offset, offset + FILE_OPERATION_BATCH_SIZE)
    const result = await fileOperations.execute({
      operations: batch.map((target) => ({ kind: 'trash' as const, sourcePath: target.path })),
      concurrency: 1,
    })
    removed += result.succeeded
    skipped += result.failed + result.cancelled
    undoable += result.undoable
    if (result.undoId) undoBatchCount += 1
  }

  const finalUndoState = fileOperations.undoState?.()
  return {
    removed,
    skipped,
    undoable,
    undoBatchCount,
    // 基线 `:154-161` 那句 `undoPersistent: undoState?.persistent` 在 EOPT 下要把"没有状态"
    // 写成"没有这个键"（`CleanfRemovalResult.undoPersistent?: boolean` 逐字抄上游 `core.ts`）。
    // 内核读的是 `removed.undoPersistent`（`core.ts:369`），键缺失读出来同样是 `undefined`。
    ...(finalUndoState === undefined ? {} : { undoPersistent: finalUndoState.persistent }),
  }
}

/**
 * 基线 `:133` 那句原话与那个 `code`（一条字都不改，包括分号位置）。
 * `:132` 的判据是 `initialUndoState && !initialUndoState.trashRestore`，本仓的缺省提供方
 * 报的正是 `trashRestore: false`，所以这一刀必然落下。
 */
function cleanfTrashUnavailableError (): Error {
  return Object.assign(
    new Error('Recycle-bin restore is unavailable; Cleanf refused to run without undo support.'),
    { code: 'ENOTSUP' },
  )
}

/** 基线 `:180-189`：测试夹具用的构造器，原样留着（`resolve` + `basename` + `dirname`）。 */
export function makeCleanfItem (path: string, type: 'file' | 'dir', depth = 1): CleanfItem {
  const resolved = resolve(path)
  return {
    path: resolved,
    name: basename(resolved),
    type,
    parentPath: dirname(resolved),
    depth,
  }
}
