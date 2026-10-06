/**
 * classf 的 `ClassfRuntime` 落地实现：六个文件系统方法逐字搬 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/classf/src/platform.ts:17-19`，另外四条（三个兄弟内核 + 剪贴板）
 * **响亮拒绝**。每一次调用都单独判过，判据在下面的表里。
 *
 * 逐条决定（DSH 给什么 / 为什么不用它）：
 * - `pathInfo` → `node:fs/promises` 的 `stat`；`listDir` → `readdir(withFileTypes)`；
 *   `join` / `dirname` / `basename` / `relative` → `node:path`。
 *   **不接 `ctx.fs`**：那条缝面向模型发起的工具调用，要求把路径收成不透明 `FsTarget`、
 *   禁止解析、禁止假设本地绝对路径，而本内核要的是 `runtime.relative(owner, file)` 这类
 *   路径算术（`core.ts:278-284`）与"分类目录名"比较。判据与出处见
 *   `docs/adr/0003-migrated-node-file-state.md` 决定 1（`crashu` / `formatv` / `migratef`
 *   四包同一处理）。
 *   上游 `pathInfo` 用的是 **`stat`（跟随符号链接）**且不 `resolve`：返回的 `path` 就是传进去
 *   那一串。`crashu` 那份 resolve、`migratef` 那份用 `lstat`，三份不一样，这里照 classf 自己
 *   那份，不统一。
 *   `listDir` 的 `Dirent` 不跟随符号链接 ⇒ 目录里的软链既不是 file 也不是 directory，
 *   `collectInputItems` 那里被静默跳过；顺序 = OS 返回顺序（`files` 那一支），
 *   `folders` / `mixed` 那一支才由 repacku 的比较器排序。
 * - `runSamea` / `runCrashu` / `runMigratef` → **没有缝**，抛 `SIBLING_KERNEL_UNWIRED`。
 *   上游那三行是把 sibling 节点的 `run*` 与它们的 runtime 工厂直接 import 进来
 *   （`platform.ts:3-8`）。本包不能那样做，两条理由都要写出来：
 *   1. 装进 profile 的包必须自包含（`docs/adr/0002-self-contained-plugin-packages.md`），
 *      sibling 包是仓内 `workspace:*`；而且它们的 `package.json#exports` 只发
 *      `.` / `./cli` / `./help`，`.` 那份会连带把 cordis 与 SDK 拉进 classf。
 *   2. DSH 侧也没有"插件调用另一个插件的内核"这条缝：`ctx.tools` 只有注册，
 *      `NodeCall` 只把参数交给**本节点**的 handler（`packages/node-sdk/src/define-node.ts:50-54`），
 *      跨节点执行要走到模型或宿主那条路上，那不是本包能自己长的通路（AGENTS.md「不碰 DSH」）。
 *      缺口记为 **G10**（本次报出，见 `docs/service-mapping.md` §缺口台账的口径）。
 *   **为什么不"自己实现一份简化版"**：那三条内核就是节点的全部价值
 *   （SameA 的画师抽取、CrashU 的相似度匹配、MigrateF 的移动与撤销账本），
 *   重写等于把四份已经钉过保真度的实现变成第二真源。
 * - `readClipboardPaths` → 同样抛，理由是台账里已有的 **G5**（`crashu/src/platform.ts` 那条）：
 *   上游走的是 `@xiranite/node-migratef/platform` 的 `readClipboardText()`
 *   （`node:child_process` 的 `pbpaste` / `powershell Get-Clipboard`），DSH 侧最近的是
 *   `ctx.subprocess`，而"读剪贴板该归哪个服务"这件事本身还没定。
 *   本节点连 `ctx.subprocess` 都没 `inject`，所以这里既不搬也不伪造。
 *   落点区别：内核在 `paths` 为空时才走剪贴板（`core.ts:87`），所以**给了路径的调用不受这一条影响**
 *   ——它挡的是"从剪贴板猜根目录"那一条腿。
 *
 * 因此 classf 今天真实能跑的部分 = 内核的纯逻辑（有测试）+ 六个文件系统方法；
 * 一旦走到兄弟内核就是**一声点名服务的失败**（`success:false` + 上面那句），
 * 不是空计划，也不是半套分类结果。宿主面与终端面都用同一个常量，文案只有一份。
 *
 * @module xaihi-classf/platform
 */

import { readdir, stat } from 'node:fs/promises'
import { basename, dirname, join, relative } from 'node:path'
import type { CrashuInput, CrashuResult } from './crashu-core.ts'
import type { MigratefInput, MigratefResult } from './migratef-core.ts'
import type { SameaInput, SameaResult } from './samea-core.ts'
import type { NodeRunEvent } from './contract.ts'
import type { ClassfRuntime } from './core.ts'

/**
 * 三条兄弟内核调用共用的拒绝文案。
 *
 * 名字里要点齐三件事：**缺的是哪条缝**（节点之间复用内核）、**三个兄弟节点是谁**
 * （使用者要去看的对象是 samea / crashu / migratef 那三个包）、**G10**（这条落进台账的编号）。
 * 只说"不支持"的话，界面读到的是"这个节点坏了"，而不是"缺这一格"。
 */
export const SIBLING_KERNEL_UNWIRED = 'classf 的三条内核调用（runSamea / runCrashu / runMigratef）没有缝：'
  + '本包必须自包含（ADR-0002），不能依赖 @hibernalglow/xaihi-{samea,crashu,migratef}，'
  + 'DSH 也没有"插件调插件内核"的入口 ⇒ 缺口 G10。'
  + '替代归属：在同一条会话里分别调用 samea / crashu / migratef 三个节点（各自的动作已注册为工具），'
  + '或等 G10 有被批准的通路。本包不重写那三块内核，也不伪造它们的结果。'

/** 剪贴板那条腿的拒绝文案（缺口台账 **G5**，与 crashu / formatv 报的是同一条）。 */
export const CLIPBOARD_UNWIRED = 'classf: 读剪贴板没有缝（缺口 G5）——上游用的是 node:child_process 的'
  + ' pbpaste / powershell Get-Clipboard，DSH 侧最近的是 ctx.subprocess，而本包不 inject 它。'
  + '请把归档根目录显式传给 paths / pathsText（内核只在 paths 为空时才去读剪贴板）。'

/** 兄弟内核没接上 ⇒ 这三个方法一律不走"返回空结果"那一步（空结果会被内核读成"0 条待处理"）。 */
function refuseSibling(): never {
  throw new Error(SIBLING_KERNEL_UNWIRED)
}

export function createNodeClassfRuntime(): ClassfRuntime {
  return {
    runSamea: async (_input: SameaInput, _onEvent: (event: NodeRunEvent) => void): Promise<SameaResult> => refuseSibling(),
    runCrashu: async (_input: CrashuInput, _onEvent: (event: NodeRunEvent) => void): Promise<CrashuResult> => refuseSibling(),
    runMigratef: async (_input: MigratefInput, _onEvent: (event: NodeRunEvent) => void): Promise<MigratefResult> => refuseSibling(),
    readClipboardPaths: async () => { throw new Error(CLIPBOARD_UNWIRED) },
    pathInfo: async (path) => { try { const info = await stat(path); return { path, exists: true, isFile: info.isFile(), isDirectory: info.isDirectory() } } catch { return { path, exists: false, isFile: false, isDirectory: false } } },
    listDir: async (path) => (await readdir(path, { withFileTypes: true })).map((entry) => ({ name: entry.name, path: join(path, entry.name), isFile: entry.isFile(), isDirectory: entry.isDirectory() })),
    join, dirname, basename, relative,
  }
}
