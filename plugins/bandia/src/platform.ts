/**
 * bandia 的 `BandiaRuntime` 里**文件那一半**的落地实现。
 *
 * 覆盖的缝方法（`core.ts:50-65` 那份 13 个方法里的 8 个）：`exists` / `stat` / `ensureDir`
 * / `removePath` / `writeText` / `tempDir` / `dirname` / `basename` / `extname` / `join`
 * / `resolve`。外部程序那一半（`findBandizip` / `runCommand` / `openEverything`）在
 * `src/exec.ts`，走 DSH 的 `ctx.subprocess`；两半在 `src/index.ts` 合成为一条缝。
 *
 * 为什么文件这一半还是 `node:fs` 而不是 DSH 的 `ctx.fs`（判据出处，逐条可复核）：
 * 1. `docs/adr/0003-migrated-node-file-state.md` 决定 1 已经对同一件事表过态：`ctx.fs` 面向
 *    **模型发起的工具调用**，要求路径收成不透明 `FsTarget`、明令"不得解析 targetKey、
 *    不得假设它是本地绝对路径"，而节点内核要的是 `join`/`dirname`/`resolve` 的路径算术。
 *    `dissolvef`、`crashu`、`rawfilter`、`samea`、`timeu` 五份已落地的移植件都按这条走。
 * 2. 更硬的一条是**能力面**：`@deepseek-ai/dsh-fs@0.2.0-rc.2` 的 `FileSystem` 声明过的方法
 *    只有 `resolve` / `processPath` / `processPathFromHostPath` / `fileUrl` / `contains` /
 *    `stat` / `lstat` / `readText` / `streamText` / `readBytes` / `readByteRange` /
 *    `listDir` / `writeText` / `editText` / `watch` / `sandboxMode`
 *    （现读 `plugins/logx/node_modules/@deepseek-ai/dsh-fs/lib/types/index.d.ts:61-237`）。
 *    **没有** `mkdir`、没有 `rename`、没有 `rm`。bandia 的 `ensureDir`（解压到指定目录前
 *    必须建目录）与 `removePath`（解压后删归档、压缩后删源）在这条缝上**无对应物**，
 *    要接只能改走 `ctx.shell` 拼命令串——那是给 DSH 已声明的能力面另长一条通路，
 *    按 AGENTS.md「不碰 DSH 的三样东西」应当提 proposal，不在一个节点包里自己造。
 *    缺口记为 **G-fs-no-mutation-verbs**。
 * 3. `BandiaFileStat` 要 `mtimeMs` 与 `ctimeMs`（EFU 的两列时间戳就是它们，`core.ts:381-382`），
 *    而 `FsInfo` / `FsDirEntry` 只给 `type` / `size` / `version`——同一条落差 `plugins/logx/src/fs.ts:19-23`
 *    已经报过（那里因此改成不排序）。这里若走 `ctx.fs` 就得把 0 喂给内核，
 *    等于伪造时间戳，所以走 `node:fs` 的 `stat`。
 *
 * 权限边界不靠 fs 层，靠**动作分级**：`danger.type` 是上游那份 `pluginExport`
 * （`is_dangerous`），经 `defineNode` 的 `dangerCheck` 变成 DSH 的 `ask`
 * （`docs/service-mapping.md` 实测 `approval` → `@deepseek-ai/dsh-user-approval` 在默认组合里）。
 *
 * 上游那份 `removePath` 的删除语义**这里给不全**，逐条写明：
 * - 上游 `platform.ts:117-127` 把 `{trash:true|false}` 交给
 *   `@xiranite/file-operations` 的 `PlatformFileMutationProvider`（回收站实现就在那个包里）。
 *   `docs/service-mapping.md`「可恢复删除 + 删除历史」那一行判的是"搬"，但落点是"批次 C 之前落，
 *   **v1 不做**"，本仓现在也确实没有那条缝（现读：`rg -n "trash" plugins/<id>/src/platform.ts` 零命中）。
 * - 所以这里：`trash` 为真 ⇒ **抛**一句点名的拒绝（缺口 **G-no-os-trash**），
 *   绝不退化成 `rm` 永久删（那会把"进了回收站"这个使用者预期变成不可恢复的数据丢失）。
 *   `trash` 为假 ⇒ `rm(recursive, force)`，与上游的非回收站那条路一致。
 *   拒绝在两条路上的可见性不一样，也是上游事实：`compress` 的 `deleteSource` 没有 try
 *   （`core.ts:352`），异常进 `results[].error`；`extract` 的 `deleteAfter` 被内核自己的
 *   `catch` 咽掉（`core.ts:252-257`，注释原话"deletion is a follow-up cleanup failure in the
 *   original tool too"）——咽掉的那一口由 `src/index.ts` 在合成缝里补一条账本预览事件，
 *   不静默。
 * - `writeText` 是 `writeFile(path, content, 'utf8')`，**不建父目录**（上游 `:26` 就没建）；
 *   EFU 的默认落点是 `tempDir()`，本来就存在。别在这里"顺手"加 `mkdir`。
 * - `stat` 的 `exists` 是**成功分支里写死的 true**（上游 `:105-111`），失败返回 `null` 而不是
 *   `{exists:false}`；内核两处都依赖这个分叉（`core.ts:220` 的 `!stat?.exists`、
 *   `:376` 的 `continue`）。
 * - `exists` 用 `access(F_OK)`：它跟随符号链接，所以"指向不存在目标的软链"算不存在。
 *
 * @module xaihi-bandia/platform
 */

import { constants } from "node:fs"
import { access, mkdir, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, dirname, extname, join, resolve } from "node:path"
import type { BandiaFileStat } from "./core.ts"

/** `BandiaRuntime` 的文件那一半；与 `src/exec.ts` 的外部程序那一半合成才是完整的缝。 */
export interface BandiaFsRuntime {
  exists: (path: string) => Promise<boolean>
  stat: (path: string) => Promise<BandiaFileStat | null>
  ensureDir: (path: string) => Promise<void>
  removePath: (path: string, options?: { trash?: boolean }) => Promise<void>
  writeText: (path: string, content: string) => Promise<void>
  tempDir: () => string
  dirname: (path: string) => string
  basename: (path: string) => string
  extname: (path: string) => string
  join: (...parts: string[]) => string
  resolve: (path: string) => string
}

/**
 * 回收站这一条在本仓没有缝，拒绝要说得出缺什么，不能读成"删除失败"。
 * `src/index.ts` 把它原样转成一条账本预览事件，所以终端面与面板读到的是同一句。
 */
export const TRASH_GAP = 'bandia: 可恢复删除（回收站）在 Xaihi 里还没有缝——上游那份是 @xiranite/file-operations'
  + ' 的 PlatformFileMutationProvider（缺口 G-no-os-trash）；这次删除已取消，'
  + '要用 recoverable delete 请先把它接上，或显式选择永久删除'

export function createBandiaFsRuntime (): BandiaFsRuntime {
  return {
    exists,
    stat: readStat,
    ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    removePath,
    writeText: (path, content) => writeFile(path, content, "utf8"),
    tempDir: tmpdir,
    dirname,
    basename,
    extname,
    join,
    resolve,
  }
}

async function exists (path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function readStat (path: string): Promise<BandiaFileStat | null> {
  try {
    const item = await stat(path)
    return {
      exists: true,
      isDirectory: item.isDirectory(),
      size: item.size,
      mtimeMs: item.mtimeMs,
      ctimeMs: item.ctimeMs,
    }
  } catch {
    return null
  }
}

async function removePath (path: string, options?: { trash?: boolean }): Promise<void> {
  const item = await readStat(path)
  if (item?.exists !== true) return
  // 上游 `platform.ts:120` 的 `kind` 就是 `options?.trash ? "trash" : "delete"` 这一条分叉；
  // 这里只兑现得了 `delete` 那半边。
  if (options?.trash === true) throw new Error(TRASH_GAP)
  await rm(path, { recursive: true, force: true })
}
