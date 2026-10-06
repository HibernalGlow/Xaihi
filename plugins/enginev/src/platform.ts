/**
 * enginev 的 `EngineVRuntime` 落地实现：那 12 个方法（`core.ts:73-86`）里除了路径算术的
 * 全部，用 `node:fs/promises` + `node:path` 兑现。逐字搬 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/enginev/src/platform.ts`，改动只有三处，都在下面点名。
 *
 * 改动一：**`@xiranite/file-operations` 那一层不引**。上游 `:5-6` 的
 * `executeSingleFileMutation` / `PlatformFileMutationProvider` 是回收站与"可恢复删除"的
 * 实现所在，`@xiranite/*` 是 `workspace:*`，写进依赖全仓 pnpm 就解不出树
 * （`docs/adr/0002-self-contained-plugin-packages.md`）。
 *
 * 改动二：于是 `removePath` 的 **trash 那半边在 Xaihi 没有对应物 ⇒ 响亮拒绝**（缺口
 * **G-no-os-trash**，与 `plugins/bandia/src/platform.ts` 同一条）：
 * `docs/service-mapping.md`「可恢复删除 + 删除历史」那一行判的是"搬"，落点写着
 * "批次 C（`dissolvef`）之前落，**v1 不做**"，而 `dissolvef` 那份移植件里也只有 `rm`
 * （现读：它的 `deletePath`）。这里**不**把它退化成 `rm` 来完成"删除"——
 * `delete` 动作里 trash 与否是 `!permanent`（`core.ts:436`），默认就是"进回收站"；
 * 悄悄永久删会把使用者读的文案（`message: "trashed"`，`core.ts:437`）变成假的。
 * 拒绝从内核的 try 里出来，落进 `deleteResults[].message`（`core.ts:438-440`），界面上读得回来。
 *
 * 改动三：**剪贴板那条腿（上游 `:32-57` 的 `readClipboardText()`）不搬**，与缺口 **G5**
 * 同源，理由与 `plugins/crashu/src/platform.ts:14-20` 逐字相同：它不属于那 12 个方法，
 * 唯一消费者是引导流（上游 `cli.ts` 的 `--clipboard` / `gd`），而那条腿在本包是响亮拒绝的
 * 未接面。搬它就要为一条不存在的调用把 `pbpaste` / `powershell` / `xclip` 拉进依赖图。
 * 本包因此**一个外部程序都不调** ⇒ `src/index.ts` 不 `inject` `subprocess`。
 *
 * 为什么这里还是 `node:fs` 而不是 DSH 的 `ctx.fs`（两条独立判据，都要能复核）：
 * 1. `docs/adr/0003-migrated-node-file-state.md` 决定 1 已经对同一件事表过态：`ctx.fs` 面向
 *    **模型发起的工具调用**，要求路径收成不透明 `FsTarget`、明令"不得解析 targetKey、
 *    不得假设它是本地绝对路径"，而这份内核要 `resolve`、`join`、`rename`、`cp -r`、`rm -r`。
 * 2. 更硬的一条是**能力面**。`@deepseek-ai/dsh-fs@0.2.0-rc.2` 的 `FileSystem` 声明过的方法只有
 *    `resolve` / `processPath` / `processPathFromHostPath` / `fileUrl` / `contains` / `stat` /
 *    `lstat` / `readText` / `streamText` / `readBytes` / `readByteRange` / `listDir` /
 *    `writeText` / `editText` / `watch` / `sandboxMode`
 *    （现读 `plugins/logx/node_modules/@deepseek-ai/dsh-fs/lib/types/index.d.ts:61-237`）：
 *    - 没有 `mkdir` ⇒ `ensureDir` 无处落（`rename` 前要保证父目录存在，`core.ts:401`；
 *      `export` 前要保证输出目录存在，`core.ts:458`）；
 *    - 没有 `rename` / `rm` / `cp` ⇒ `movePath`、`copyDir`、`removePath` 三个动词无对应物；
 *    - `FsInfo` / `FsDirEntry` 只给 `type` / `size` / `version`，**没有 mtime / ctime**
 *      （同一条落差 `plugins/logx/src/fs.ts:19-23` 已经报过）⇒ `createdMs` / `modifiedMs`
 *      给不出来。而内核在缺失时会自己拿现在的时间顶上
 *      （`core.ts:256-257` 的 `info.createdMs || Date.now()`），这两个值还会被 `export`
 *      原样写进 JSON（`core.ts:457`）——喂 0 进去就等于伪造扫描时间，AGENTS.md 明令不许。
 *    要接齐这四件事只剩"经 `ctx.shell` 拼 `mkdir -p` / `mv` / `cp -R` / `rm -rf` 命令串"，
 *    那是给 DSH 已声明的能力面另长一条通路，按规矩应当提 proposal，不在节点包里自造。
 *    缺口记为 **G-fs-no-mutation-verbs**。
 *
 * 权限边界不靠 fs 层，靠**动作分级**：`rename` / `delete` 在非预演时被定义里的
 * `danger.all` 两条谓词判为危险，经 `defineNode` 变成 DSH 的 `ask`
 * （`docs/service-mapping.md` 实测 `approval` → `@deepseek-ai/dsh-user-approval` 在默认组合里）。
 *
 * 枚举与改动语义与上游一致，逐条写着是因为它们都会被"顺手优化"改掉：
 * - `pathInfo` 先 **`resolve(path)`** 再 `stat`，返回的是**解析后的路径**（`:60-71`）。
 *   内核的 `scanWorkshop` 与 `readWallpaperFolder` 都直接吃这个绝对形，别改成不解析。
 *   异常折成 `{exists:false, …0}`（`:73`），不是抛。
 * - `listDir` 用 `readdir(withFileTypes)`：`Dirent` 不跟随符号链接 ⇒ 目录里的软链既不是
 *   file 也不是 directory，内核那两条分支（`core.ts:471-474` 的 `folderSize`）都不会把它算进去；
 *   每个条目**再 stat 一次**取 size（`:82`），stat 失败折成 0 而不是整次失败（`:123-129`）。
 *   `size` 只在 `isFile()` 时取（`:88`），目录项恒为 0。
 * - `movePath` 先 `mkdir(dirname(target), {recursive:true})` 再 `rename`，
 *   **`rename` 抛错时兜一条 `cp(recursive, force:false, errorOnExist:true)` + `rm(source)`**
 *   （`:93-101`）——跨卷（EXDEV）与"目标已存在"就在这条兜底上分成败。兜底里再失败照样往上抛。
 * - `copyDir` 的 `force:false, errorOnExist:true`：目标已存在是**失败**，不是覆盖（`:23`）。
 * - `writeText` 不建父目录（`:20`）；建目录是内核在 `runExport` 里自己做的一次
 *   （`core.ts:458`），别在这里重复。
 *
 * @module xaihi-enginev/platform
 */

import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import type { EngineVDirEntry, EngineVPathInfo, EngineVRuntime } from "./core.ts"

/**
 * 回收站这一条在本仓没有缝，拒绝要说得出缺什么，不能读成"删除失败"。
 * 内核把它记进 `deleteResults[].message`（`core.ts:438-440`），所以面板与工具输出都看得见。
 */
export const TRASH_GAP = 'enginev: 可恢复删除（回收站）在 Xaihi 里还没有缝——上游那份是 @xiranite/file-operations'
  + ' 的 PlatformFileMutationProvider（缺口 G-no-os-trash）；这次删除已取消。'
  + '要 recoverable delete 请先把它接上，或用 permanent=true 明确选择永久删除'

export function createNodeEngineVRuntime (): EngineVRuntime {
  return {
    pathInfo,
    listDir,
    readJson: async (path) => JSON.parse(await readFile(path, "utf8")) as unknown,
    writeText: (path, content) => writeFile(path, content, "utf8").then(() => undefined),
    ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    movePath,
    copyDir: (source, target) => cp(source, target, { recursive: true, force: false, errorOnExist: true }).then(() => undefined),
    removePath,
    join,
    dirname,
    basename,
    resolve,
  }
}

async function pathInfo (path: string): Promise<EngineVPathInfo> {
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

async function listDir (path: string): Promise<EngineVDirEntry[]> {
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

async function movePath (source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  try {
    await rename(source, target)
  } catch {
    // 兜底不是吞异常：跨卷走这里，而这里再失败（目标已存在等）会照样往上抛，
    // 内核把它折成该条 `status:"error"`（core.ts:409-411）。
    await cp(source, target, { recursive: true, force: false, errorOnExist: true })
    await rm(source, { recursive: true, force: true })
  }
}

async function removePath (path: string, options?: { trash?: boolean }): Promise<void> {
  const item = await safeStat(path)
  if (item === null) return
  if (options?.trash === true) throw new Error(TRASH_GAP)
  await rm(path, { recursive: true, force: true })
}

async function safeStat (path: string) {
  try {
    return await stat(path)
  } catch {
    return null
  }
}
