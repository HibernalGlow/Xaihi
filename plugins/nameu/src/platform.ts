/**
 * nameu 的 `NameuRuntime` 落地实现：逐字搬 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/nameu/src/platform.ts`（39 行），只改了 import 说明符
 * （`./core.js` → `./core.ts`，本仓 ESM 用 `.ts` 源扩展名，与 `dissolvef` / `samea` 同写法）。
 *
 * 为什么这里还是 `node:fs` 而不是 DSH 的 `ctx.fs`：与 `docs/adr/0003-migrated-node-file-state.md`
 * 决定 1 判的是同一件事——`ctx.fs` 面向**模型发起的工具调用**，要求路径收成不透明
 * `FsTarget`、禁止解析、禁止假设本地绝对路径，而这个内核要 `dirname`/`join` 的路径算术和
 * `rename`。权限边界因此不靠 fs 层，而靠动作分级：`rename` + `dryRun=false` 在
 * `package.json#xaihi.node.danger`（`all` 两条谓词）里被判为危险，经 `defineNode` 变成
 * DSH 的 `ask`，审批与审计全在宿主（`approval` 缝在隔离宿主实测存在）。
 *
 * 会被"顺手优化"改掉的枚举语义，逐条写着：
 * - `pathInfo` 用 **`stat`**（跟随符号链接），且**不 `resolve()`**：返回的就是传进来的路径。
 *   rawfilter 那份会 resolve，两份不一样，别统一。
 * - `listDir` 用 `readdir(withFileTypes)`：`Dirent` 不跟随符号链接 ⇒ 目录里的软链既不是
 *   file 也不是 directory，内核那里既不归档也不下钻；顺序 = OS 返回顺序，不排序。
 * - `rename` 是 `node:fs/promises.rename` 本体，**没有跨卷兜底**：EXDEV 会抛出来，
 *   内核把它记成一条 `status: "error"` 的条目（`core.ts:125-127`），这里不加 cp+rm
 *   （加了就和上游行为不同；rawfilter 那份有兜底，是它自己的内核）。
 * - `setTimes` 用 `utimes(new Date(ms), new Date(ms))`：亚毫秒部分被 `Date` 截掉，
 *   上游如此，不在这里换成 `utimes(path, ms, ms)`。
 *
 * 这里也**不引 `ctx.subprocess`**：nameu 全程不调用外部程序（对照 `plugins/sleept/src/exec.ts`
 * 那种"必须走宿主子进程缝"的情形）。
 *
 * @module xaihi-nameu/platform
 */

import { readdir, rename, stat, utimes } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import type { NameuRuntime } from "./core.ts"

export function createNodeNameuRuntime(): NameuRuntime {
  return {
    pathInfo: async (path) => {
      try {
        const info = await stat(path)
        return {
          path,
          exists: true,
          isFile: info.isFile(),
          isDirectory: info.isDirectory(),
          atimeMs: info.atimeMs,
          mtimeMs: info.mtimeMs,
        }
      } catch {
        return { path, exists: false, isFile: false, isDirectory: false, atimeMs: 0, mtimeMs: 0 }
      }
    },
    listDir: async (path) => {
      const entries = await readdir(path, { withFileTypes: true })
      return entries.map((entry) => ({
        name: entry.name,
        path: join(path, entry.name),
        isFile: entry.isFile(),
        isDirectory: entry.isDirectory(),
      }))
    },
    rename,
    setTimes: async (path, atimeMs, mtimeMs) => {
      await utimes(path, new Date(atimeMs), new Date(mtimeMs))
    },
    join,
    dirname,
    basename,
  }
}
