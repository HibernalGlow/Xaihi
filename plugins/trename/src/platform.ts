/**
 * trename 的 `TrenameRuntime` 落地实现：逐字搬基线 tag `noxide` 的
 * `packages/nodes/trename/src/platform.ts`（127 行）里 `createNodeTrenameRuntime` 与
 * 那四个内部函数（`:36-86`），只改了 import 说明符（`./core.js` → `./core.ts`，本仓 ESM
 * 用 `.ts` 源扩展名，与 `crashu` / `dissolvef` 同写法），**外加一处有意的实质差异**：
 * `defaultUndoPath` 的来源。
 *
 * 上游把撤销账本算在自己的配置目录旁边：`defaultTrenameUndoPath()`（`:26-34`）=
 * `dirname(resolveXiraniteConfigPath())/artifacts/undo/trename.undo.json`。按
 * `docs/adr/0013-config-goes-through-dsh-settings.md`，"配置文件住在磁盘上"那条通路整块不搬；
 * 而 DSH 没有"每插件数据目录"这个 API（`ctx.path` / `ctx.home` 全仓零命中）。所以这里
 * **不猜一个路径**，改成要调用方显式给：`createNodeTrenameRuntime({ undoPath })`，
 * 没给就抛一句点名的拒绝（症状是"要求设置 undoPath"，不是"撤销记录写进了一个没人知道的地方"）。
 * 这条与 `docs/adr/0003-migrated-node-file-state.md` 决定 2 判的是同一件事，
 * `dissolvef` 的 `historyPath` 是先例；措辞照 `findz` 的 `indexDir` 那条纪律。
 *
 * 为什么这里还是 `node:fs` 而不是 DSH 的 `ctx.fs`：ADR-0003 决定 1（dissolvef 先例）。
 * `ctx.fs` 面向**模型发起的工具调用**，要求路径收成不透明 `FsTarget`、禁止解析、禁止假设
 * 本地绝对路径，而这个内核要 `resolve`/`join`/`dirname` 的路径算术、要 `rename`、
 * 还要按 `size` 读数（`listDir` 那份 `safeStat`）。权限边界因此靠**动作分级**：
 * `rename` + `dryRun=false` 在 `package.json#xaihi.node.danger`（`all` 两条谓词）里被判为危险，
 * 经 `defineNode` 变成 DSH 的 `ask`，审批与审计全在宿主。
 *
 * 这里也**不引 `ctx.subprocess`**：内核全程不调用外部程序。上游那份 `readClipboardText()`
 * （`:88-127`，走 `node:child_process` 的 `execFile`）**没搬**——它不属于 `TrenameRuntime`
 * 那 13 个方法，唯一的上游消费者是终端的 `guided` 腿（`cli.ts:547`），而那条腿在本包是响亮
 * 拒绝的未接面（见 `src/cli.ts`）。缺口即台账 `G-clipboard-guided`，真接 guided 走
 * `ctx.subprocess`，不在这里自己 spawn。
 *
 * 与上游一致、且会被"顺手优化"改掉的实现细节：
 * - `pathInfo` 先 **`resolve(path)`** 再 `stat`，返回的是**解析后的路径**，并带
 *   `size` / `createdMs`(`birthtimeMs`) / `modifiedMs`(`mtimeMs`)；失败那条全零（`:36-52`）。
 *   `samePath` / `pathKey` 吃的就是这份 resolve，别换成不 resolve 的写法。
 * - `listDir` 也先 `resolve`，`readdir(withFileTypes)` 之后**逐条 `safeStat`** 才拿 size，
 *   且 `size` 只在 `isFile()` 时才写数字（目录与打不开的是 0，`:54-68`）。
 *   `Dirent.isDirectory()` 不跟随符号链接，所以目录里的软链在内核那侧既不是 file 也不是 directory。
 * - `movePath` 先 `mkdir(dirname(target), {recursive:true})` 再 `rename`，
 *   `rename` 抛错时兜一条 `cp(recursive, force:false, errorOnExist:true)` + `rm(source)`
 *   （`:70-78`）——跨卷与"目标已存在"就在这条兜底上分出成败。
 * - `writeText` **不**建父目录（`:13`）：内核的 `writeUndoStore` 自己先 `ensureDir(dirname(...))`。
 *   把它"顺手"改成 crashu 那种带 mkdir 的形状，会让两侧的差异消失在一次编译里，没人看得见。
 * - `now()` 是 ISO 字符串（不是 Date 对象，与 dissolvef 那份不同），`randomId()` 是完整 UUID，
 *   截 8 位是内核的事（`core.ts:708`）。
 *
 * @module xaihi-trename/platform
 */

import { randomUUID } from "node:crypto"
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import type { TrenameDirEntry, TrenamePathInfo, TrenameRuntime } from "./core.ts"

/**
 * @param options.undoPath - 撤销账本的文件路径。宿主半边来自 `Config.undoPath`
 * （`src/index.ts`），终端半边来自 `--undoPath` / `--undo-path`。**没给就拒绝**，理由见文件头。
 */
export function createNodeTrenameRuntime(options: { undoPath?: string } = {}): TrenameRuntime {
  const configured = options.undoPath?.trim() ?? ""
  return {
    pathInfo,
    listDir,
    readText: (path) => readFile(path, "utf8"),
    writeText: (path, content) => writeFile(path, content, "utf8").then(() => undefined),
    ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    movePath,
    join,
    dirname,
    basename,
    resolve,
    defaultUndoPath: () => {
      if (configured === "") {
        throw new Error('trename: no undoPath configured; set the node config "undoPath" (or pass --undoPath) — Xaihi 里没有"每插件数据目录"这个 API，撤销账本的位置必须显式给')
      }
      return configured
    },
    now: () => new Date().toISOString(),
    randomId: () => randomUUID(),
  }
}

async function pathInfo(path: string): Promise<TrenamePathInfo> {
  const resolved = resolve(path)
  try {
    const item = await stat(resolved)
    return {
      path: resolved,
      exists: true,
      isFile: item.isFile(),
      isDirectory: item.isDirectory(),
      size: item.size,
      createdMs: item.birthtimeMs,
      modifiedMs: item.mtimeMs,
    }
  } catch {
    return { path: resolved, exists: false, isFile: false, isDirectory: false, size: 0, createdMs: 0, modifiedMs: 0 }
  }
}

async function listDir(path: string): Promise<TrenameDirEntry[]> {
  const resolved = resolve(path)
  const entries = await readdir(resolved, { withFileTypes: true })
  return Promise.all(entries.map(async (entry) => {
    const entryPath = join(resolved, entry.name)
    const item = await safeStat(entryPath)
    return {
      name: entry.name,
      path: entryPath,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
      size: item?.isFile() ? item.size : 0,
    }
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

async function safeStat(path: string) {
  try {
    return await stat(path)
  } catch {
    return null
  }
}
