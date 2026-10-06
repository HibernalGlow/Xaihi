/**
 * timeu 的 `TimeuRuntime` 落地实现：逐字搬 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/timeu/src/platform.ts`（57 行），只改了 import 说明符
 * （`./core.js` → `./core.ts`，本仓 ESM 用 `.ts` 源扩展名，与 `dissolvef` 同写法）。
 *
 * 为什么这里还是 `node:fs` 而不是 DSH 的 `ctx.fs`：`docs/adr/0003-migrated-node-file-state.md`
 * 决定 1 已经判过同一件事——`ctx.fs` 的设计对象是**模型发起的工具调用**（裸缝"complete,
 * unconstrained"，并要求路径收成不透明 `FsTarget`、不得解析、不得假设本地绝对路径），
 * 而这个内核要 `dirname`/`join`/`rename`/`utimes` 这套带路径算术的进程内操作，硬套等于
 * 重写内核。权限边界不靠 fs 层，靠动作分级：`backup` / `restore` 在
 * `package.json#xaihi.node.danger` 里被 `all`（动作非 scan 且 dryRun 非真）判为危险，
 * 经 `defineNode` 变成 DSH 的 `ask`，审批与审计全在宿主。
 *
 * 这里也**不引 `ctx.subprocess`**：timeu 全程不调用外部程序（对照 `plugins/sleept/src/exec.ts`
 * 那种"必须走宿主子进程缝"的情形）。`docs/service-mapping.md` 的"子进程/命令执行"那一行
 * 对本包是空地，不需要绕，也不需要提 proposal。
 *
 * 枚举语义 = 上游，一条没动，写清楚是因为它们全是会随"顺手优化"漂掉的那种：
 * - `pathInfo` 用 **`stat`**（跟随符号链接）：给一个指向目录的软链，报的是 `isDirectory: true`；
 *   存在时路径要 `resolve()`，不存在时**原样返回**传入路径（下游 `buildRestorePlan` 的
 *   路径键与 `currentTimestampRecords` 都依赖这两种形状）。
 * - `listDir` 用 **`readdir(withFileTypes)`**：`Dirent` 不跟随符号链接，所以目录里的软链
 *   既不是 file 也不是 directory ⇒ 内核那里既不进目标也不下钻（不额外 stat 一次，上游没有）。
 * - `listDir` 不做任何排序：顺序 = OS 返回顺序，去重与排序只发生在
 *   `core.ts` 的 `collectTimeuTargets` 末尾那一次。
 * - `readText` 吞掉一切错误返回 `null`（记录文件不存在 = 空账本，不是失败）。
 * - `writeText` 先 `mkdir(dirname, {recursive:true})` 再写。
 *
 * @module xaihi-timeu/platform
 */

import { mkdir, readFile, readdir, stat, utimes, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import type { TimeuRuntime } from "./core.ts"

export function createNodeTimeuRuntime(): TimeuRuntime {
  return {
    pathInfo,
    listDir,
    readText,
    writeText: async (path, content) => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, content, "utf8")
    },
    ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    setTimes: (path, atimeMs, mtimeMs) => utimes(path, new Date(atimeMs), new Date(mtimeMs)),
    now: () => new Date(),
    join,
    dirname,
    basename,
  }
}

async function pathInfo(path: string) {
  try {
    const info = await stat(path)
    return {
      path: resolve(path),
      exists: true,
      isFile: info.isFile(),
      isDirectory: info.isDirectory(),
      atimeMs: info.atimeMs,
      mtimeMs: info.mtimeMs,
      ctimeMs: info.ctimeMs,
      birthtimeMs: info.birthtimeMs,
    }
  } catch {
    return { path, exists: false, isFile: false, isDirectory: false, atimeMs: 0, mtimeMs: 0, ctimeMs: 0, birthtimeMs: 0 }
  }
}

async function listDir(path: string) {
  const entries = await readdir(path, { withFileTypes: true })
  return entries.map((entry) => ({
    name: entry.name,
    path: join(path, entry.name),
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
  }))
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}
