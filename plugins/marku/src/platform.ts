/**
 * Marku 的 `MarkuRuntime` 落地实现：搬 `<Xiranite>` tag `noxide` 基线
 * `packages/nodes/marku/src/platform.ts`（**108 行**）里属于那 10 个方法的全部，
 * 只改了 import 说明符（`./core.js` → `./core.ts`，本仓 ESM 用 `.ts` 源扩展名，
 * 与 `dissolvef` / `crashu` / `samea` 同写法）。
 *
 * 两处**实质**偏离，都不是"顺手改"，而是基线那两个假设在 Xaihi 里不成立：
 *
 * 1. **`@xiranite/config` 那一层不搬，`defaultHistoryPath()` 改成响亮拒绝。**
 *    基线的默认账本路径是 `join(dirname(resolveXiraniteConfigPath()), "artifacts/undo/marku.undo.json")`
 *    （基线 `platform.ts:22-33`），也就是"配置文件住在哪儿 ⇒ 数据就撒在它旁边"。按
 *    `docs/adr/0013-config-goes-through-dsh-settings.md`，那条"配置在后端一个 toml 里"的通路
 *    整块不接；按 `docs/adr/0003-migrated-node-file-state.md` 决定 2，撤销账本的路径必须由
 *    配置**显式**给出（本包是 `Config.historyPath`，见 `src/index.ts`），DSH 也没有
 *    "每插件数据目录"这个 API（`ctx.path` / `ctx.home` 全仓零命中）。
 *    所以这里不猜路径：没给就抛，症状是"要求设置 historyPath"，不是"历史写进了一个没人知道的地方"。
 *    与 `plugins/dissolvef/src/platform.ts` 记的是同一条先例、同一个形状（`{ historyDir }` 选项）。
 *    基线那个导出的 `defaultMarkuHistoryPath()` 因此**没搬**——它的函数体就是上面那条通路。
 *
 * 2. **`readClipboardText()` 不搬**（基线 `platform.ts:35-62`，`node:child_process` 的 `execFile`）。
 *    它不属于 `MarkuRuntime` 那 10 个方法，唯一的上游消费者是终端的 `guided` 腿
 *    （基线 `cli.ts:377` / `:400` 的 `resolveInputPaths` / `resolveInputText`），而那条腿在本包是
 *    响亮拒绝的未接面（见 `src/cli.ts` 文件头）。搬它等于为一个不存在的调用者把
 *    `pbpaste` / `powershell` / `xclip` / `xsel` 拉进依赖图。缺口就是台账里**已经记着的** G5
 *    （`crashu` 那份报的是同一条：`G-clipboard-guided`），这里不另开一条。
 *    ⇒ 本包**一个外部程序都不调**，所以 `src/index.ts` 不 `inject` `subprocess`。
 *
 * 为什么这里还是 `node:fs` 而不是 DSH 的 `ctx.fs`：ADR-0003 决定 1 判的是同一件事——
 * `ctx.fs` 面向**模型发起的工具调用**，要求路径收成不透明 `FsTarget`、明令禁止解析路径，
 * 而这个内核要 `resolve`、`join`、`dirname` 的路径算术（`collectMarkdownFiles` 下降目录、
 * `writeText` 先 `mkdir(dirname)`）。权限边界靠**动作分级**：`run` + `dryRun=false` 与 `undo`
 * 在 `package.json#xaihi.node.danger` 里被判危险，经 `defineNode` 变成 DSH 的 `ask`，
 * 审批与审计全在宿主。
 *
 * 枚举/改动语义与基线一致，逐条写着是因为它们都会被"顺手优化"改掉：
 * - `pathInfo` 先 **`resolve(path)`** 再 `stat`，返回的是**解析后的路径**；`stat` 失败不是抛，
 *   而是 `{exists:false,isFile:false,isDirectory:false}`（内核 `collectMarkdownFiles` 靠这条跳过
 *   不存在的路径，`runMarku` 的 catch 因此看不见权限类错误）。
 * - `listDir` 用 `readdir(withFileTypes)`：`Dirent` **不跟随符号链接** ⇒ 目录里的软链既不是
 *   file 也不是 directory，在内核那里被静默跳过；顺序 = OS 返回顺序（排序在内核那侧做）。
 * - `readText` 把**任何**读失败折成 `null`（内核据此 `continue`，计不进 `filesProcessed`），
 *   编码固定 `utf8`。
 * - `writeText` 先 `mkdir(dirname(path), {recursive:true})` 再 `writeFile(..., "utf8")`；
 *   失败**照抛**——内核的 `workflow` 腿正是靠这个抛出报出 `Write failed at <path>: <msg>` 的。
 * - `now` 是 `new Date()`（账本时间戳取 `.toISOString()`），`randomId` 是
 *   `crypto.randomUUID().slice(0, 8)`（全局 `crypto`，Node 22+ 自带，不引 `node:crypto`）。
 *
 * @module xaihi-marku/platform
 */

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { MarkuDirEntry, MarkuPathInfo, MarkuRuntime } from './core.ts'

/** `Config.historyPath` 落下来的那半边：账本所在目录。不给就没有默认账本路径。 */
export interface MarkuRuntimeOptions {
  historyDir?: string
}

export function createNodeMarkuRuntime (options: MarkuRuntimeOptions = {}): MarkuRuntime {
  return {
    pathInfo,
    listDir,
    readText,
    writeText,
    join,
    dirname,
    basename,
    now: () => new Date(),
    randomId: () => crypto.randomUUID().slice(0, 8),
    defaultHistoryPath: () => {
      if (options.historyDir === undefined) {
        throw new Error('marku: no historyDir configured; set the node config "historyPath"（Xaihi 里没有"每插件数据目录"这个 API，撤销账本的路径必须显式给，理由见本文件头第 1 条与 ADR-0003 决定 2）')
      }
      return join(options.historyDir, 'marku.undo.json')
    },
  }
}

async function pathInfo (path: string): Promise<MarkuPathInfo> {
  const resolved = resolve(path)
  try {
    const info = await stat(resolved)
    return { path: resolved, exists: true, isFile: info.isFile(), isDirectory: info.isDirectory() }
  } catch {
    return { path: resolved, exists: false, isFile: false, isDirectory: false }
  }
}

async function listDir (path: string): Promise<MarkuDirEntry[]> {
  const entries = await readdir(path, { withFileTypes: true })
  return entries.map((entry) => ({
    name: entry.name,
    path: join(path, entry.name),
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
  }))
}

async function readText (path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return null
  }
}

async function writeText (path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf8')
}
