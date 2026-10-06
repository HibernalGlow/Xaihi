/**
 * crashu 的 `CrashuRuntime` 落地实现：逐字搬 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/crashu/src/platform.ts` 里除剪贴板之外的全部（`:1-21` 的工厂与
 * `:64-92` 的 `pathInfo` / `listDir` / `movePath`），只改了 import 说明符
 * （`./core.js` → `./core.ts`，本仓 ESM 用 `.ts` 源扩展名，与 `dissolvef` / `samea` 同写法）。
 *
 * 为什么这里还是 `node:fs` 而不是 DSH 的 `ctx.fs`：与
 * `docs/adr/0003-migrated-node-file-state.md` 决定 1 判的是同一件事——`ctx.fs` 面向
 * **模型发起的工具调用**，要求路径收成不透明 `FsTarget`、禁止解析、禁止假设本地绝对路径，
 * 而这个内核要 `join`/`dirname` 的路径算术、要 `rename`、要 `rm -r`。权限边界靠动作分级：
 * `move` + `dryRun=false` 在 `package.json#xaihi.node.danger`（`all` 两条谓词）里被判为危险，
 * 经 `defineNode` 变成 DSH 的 `ask`，审批与审计全在宿主。
 *
 * 这里也**不引 `ctx.subprocess`**：内核全程不调用外部程序。上游那份
 * `readClipboardText()`（`:23-62`，走 `node:child_process` 的 `execFile`）**没搬**，
 * 因为它不属于 `CrashuRuntime` 那 9 个方法，而它唯一的上游消费者是终端的 `guided` 腿
 * （`cli.ts:440`）——那条腿在本包是响亮拒绝的未接面（见 `src/cli.ts` 文件头），
 * 于是搬它就等于为了一个不存在的调用者把 `pbpaste` / `powershell` / `xclip` 拉进依赖图。
 * 缺口记为 `G-clipboard-guided`：真要把 guided 接上，走 `ctx.subprocess`
 * （`docs/service-mapping.md` 的 subprocess 那一行），不在这里自己 spawn。
 *
 * 枚举/改动语义与上游一致，逐条写着是因为它们都会被"顺手优化"改掉：
 * - `pathInfo` 先 **`resolve(path)`** 再 `stat`，返回的是**解析后的路径**（`:64-72`）。
 *   `samea` 那份不 resolve，两份不同，别统一。内核的 `validSourceRoots` 收的正是
 *   `info.path`，所以来源根会被绝对化后再列目录。
 * - `listDir` 用 `readdir(withFileTypes)`：`Dirent` 不跟随符号链接 ⇒ 目录里的软链既不是
 *   file 也不是 directory，内核那里被静默跳过；顺序 = OS 返回顺序，不排序
 *   （排序在内核 `collectSourceFolders` 里按名字做）。
 * - `movePath` 先 `mkdir(dirname(target), {recursive:true})` 再 `rename`，
 *   **`rename` 抛错时兜一条 `cp(recursive, force:false, errorOnExist:true)` + `rm(source)`**
 *   （`:84-92`）——跨卷与"目标已存在"就在这条兜底上分出成败；这是 crashu 独有的，
 *   `samea` 那份没有兜底。
 * - `deletePath` 是 `rm(recursive:true, force:true)`：`conflictPolicy: "overwrite"` 走它，
 *   `force` 意味着"不存在也不报错"，与内核的执行顺序（先删后 move）配套。
 * - `writeText` 先 `mkdir(dirname(path))` 再 `writeFile`：配对文件因此不需要调用方建目录。
 *
 * @module xaihi-crashu/platform
 */

import { cp, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import type { CrashuDirEntry, CrashuPathInfo, CrashuRuntime } from "./core.ts"

export function createNodeCrashuRuntime(): CrashuRuntime {
  return {
    pathInfo,
    listDir,
    ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    movePath,
    deletePath: (path) => rm(path, { recursive: true, force: true }),
    writeText: async (path, content) => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, content, "utf8")
    },
    join,
    dirname,
    basename,
  }
}

async function pathInfo(path: string): Promise<CrashuPathInfo> {
  const resolved = resolve(path)
  try {
    const info = await stat(resolved)
    return { path: resolved, exists: true, isFile: info.isFile(), isDirectory: info.isDirectory() }
  } catch {
    return { path: resolved, exists: false, isFile: false, isDirectory: false }
  }
}

async function listDir(path: string): Promise<CrashuDirEntry[]> {
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
