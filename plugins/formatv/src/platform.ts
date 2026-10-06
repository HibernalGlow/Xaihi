/**
 * formatv 的 `FormatvRuntime` 落地实现：逐字搬 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/formatv/src/platform.ts` 里除剪贴板之外的全部（`:1-16` 的工厂与
 * `:55-83` 的 `pathInfo` / `listDir` / `renamePath` / `writeText`），只改了 import 说明符
 * （`./core.js` → `./core.ts`，本仓 ESM 用 `.ts` 源扩展名，与 `dissolvef` / `samea` 同写法）。
 *
 * 为什么这里还是 `node:fs` 而不是 DSH 的 `ctx.fs`：与
 * `docs/adr/0003-migrated-node-file-state.md` 决定 1 判的是同一件事——`ctx.fs` 面向
 * **模型发起的工具调用**，要求路径收成不透明 `FsTarget`、禁止解析、禁止假设本地绝对路径，
 * 而这个内核的 `recursive-enumeration` 要 `join`/`dirname` 的路径算术、要按 `size` 比较、
 * 要 `rename`。权限边界靠动作分级：`add_nov` / `remove_nov` + `dryRun=false` 在
 * `package.json#xaihi.node.danger`（`all` 两条谓词）里被判为危险，经 `defineNode` 变成
 * DSH 的 `ask`，审批与审计全在宿主。
 *
 * 这里也**不引 `ctx.subprocess`**：内核全程不调用外部程序。上游那份
 * `readClipboardText()`（`:18-53`，走 `node:child_process` 的 `execFile`）**没搬**，
 * 因为它不属于 `FormatvRuntime` 那 7 个方法，而它唯一的上游消费者是终端的 `guided` 腿
 * （`cli.ts:467`）——那条腿在本包是响亮拒绝的未接面（见 `src/cli.ts` 文件头）。
 * 缺口记为 `G-clipboard-guided`：真要把 guided 接上，走 `ctx.subprocess`
 * （`docs/service-mapping.md` 的 subprocess 那一行），不在这里自己 spawn。
 *
 * 枚举/改动语义与上游一致，逐条写着是因为它们都会被"顺手优化"改掉：
 * - `pathInfo` 先 **`resolve(path)`** 再 `stat`，返回的是**解析后的路径**，并且带
 *   `size`（`:55-63`）——`check_duplicates` 的 `prefixedLarger` 就吃这个 `size`，
 *   `stat` 失败时 `size` 是 **0** 而不是 `undefined`。`samea` 那份既不 resolve 也没有
 *   size，两份不同，别统一。
 * - `listDir` 用 `readdir(withFileTypes)`：`Dirent` 不跟随符号链接 ⇒ 软链既不 isFile
 *   也不 isDirectory，内核的 `visit` 因此**既不分类也不下钻**；顺序 = OS 返回顺序
 *   （内核在三个桶末尾各排一次序）。
 * - `renamePath` 只有 `mkdir(dirname(target), {recursive:true})` + `rename`，
 *   **没有** crashu 那份 `cp`+`rm` 兜底（`:75-78`）⇒ 跨卷时 EXDEV 直接抛，
 *   内核把它记成一条 `error` 操作，不改退出码之外的行为。
 * - `writeText` 先 `mkdir(dirname(path))` 再 `writeFile`：重复报告因此不需要调用方建目录。
 *
 * @module xaihi-formatv/platform
 */

import { mkdir, readdir, rename, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import type { FormatvDirEntry, FormatvPathInfo, FormatvRuntime } from "./core.ts"

export function createNodeFormatvRuntime(): FormatvRuntime {
  return {
    pathInfo,
    listDir,
    renamePath,
    writeText,
    join,
    dirname,
    basename,
  }
}

async function pathInfo(path: string): Promise<FormatvPathInfo> {
  const resolved = resolve(path)
  try {
    const info = await stat(resolved)
    return { path: resolved, exists: true, isFile: info.isFile(), isDirectory: info.isDirectory(), size: info.size }
  } catch {
    return { path: resolved, exists: false, isFile: false, isDirectory: false, size: 0 }
  }
}

async function listDir(path: string): Promise<FormatvDirEntry[]> {
  const entries = await readdir(path, { withFileTypes: true })
  return entries.map((entry) => ({
    name: entry.name,
    path: join(path, entry.name),
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
  }))
}

async function renamePath(source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  await rename(source, target)
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, "utf8")
}
