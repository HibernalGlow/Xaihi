/**
 * rawfilter 的 `RawfilterRuntime` 落地实现：逐字搬 `<Xiranite>` tag `noxide` 的
 * `packages/nodes/rawfilter/src/platform.ts` 里那 8 个缝方法的实现（上游 `:1-18` 与
 * `:61-100`），只改了 import 说明符（`./core.js` → `./core.ts`）。
 *
 * **一处删除**：上游 `:1` 的 `node:child_process`、`:20-59` 的 `readClipboardText()` 与
 * `runCommand()` 不搬。三条理由，按 AGENTS.md 的口径都要写出来：
 * 1. 它的唯一调用者是上游 `cli.ts:417` 的 `pathsFromClipboard()`，而那条只活在**引导流**
 *    （`gd` / `guided`）里；引导流的字段表在 `@clack/prompts` 上，本批不接（见 `src/cli.ts`
 *    文件头），所以这份实现没有任何消费者。
 * 2. 执行外部程序这件事 DSH 已经有：`docs/service-mapping.md`「子进程 / 命令执行 ⇒ 不搬」，
 *    判据是 `subprocess.md` 的 `ctx.subprocess` 与 `shell.md` 的 `ctx.shell`。在插件包里
 *    直接 `execFile` 一个 `powershell.exe`/`pbpaste`，就是给 DSH 已经提供的能力再造一条腿。
 * 3. 独立 bin 不在宿主进程里，拿不到 `ctx.subprocess`；把它塞进 `RawfilterRuntime` 又要
 *    给内核加一条它从不调用的第 9 个方法——那是发明，不是搬运。
 * 落地结果：**引导流那条腿在界面上读得回来**（`xrawfilter gd` 退出码 2 并点名"剪贴板取路径
 * 随引导流一起未接"），不静默、不假装成功。
 *
 * 会被"顺手优化"改掉的枚举语义，逐条写着：
 * - `pathInfo` **先 `resolve()`** 再 `stat`，返回的是解析后的绝对路径。samea / nameu 那两份
 *   都不 resolve，三份不一样，别统一：内核的 `uniqueTargetPath` 与测试夹具都依赖这个形状。
 * - `listDir` 用 `readdir(withFileTypes)`：`Dirent` 不跟随符号链接 ⇒ 软链既不是 file 也不是
 *   directory，`groupArchivesInDir` 那里根本不会把它当归档；顺序 = OS 返回顺序，排序在内核做。
 * - `moveFile` 先 `mkdir(dirname(target))`，再 `rename`；**rename 失败时**（典型是跨卷 EXDEV）
 *   退化成 `cp(force:false, errorOnExist:true)` + `rm(source, force:true)`。那个 `catch` 不是
 *   吞异常：兜底里再失败就照样往上抛，内核把它记成一条 `status: "error"`。
 * - `createShortcut` 先试 `symlink`，失败才写 `[InternetShortcut] URL=file:///…` 的 `.url`
 *   文本（Windows 无符号链接权限时走的就是这条）。两条都不许删：macOS 上是软链，
 *   Windows 上是那份文本，产物不同是上游的事实。
 *
 * @module xaihi-rawfilter/platform
 */

import { cp, mkdir, readdir, rename, rm, stat, symlink, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import type { RawfilterDirEntry, RawfilterPathInfo, RawfilterRuntime } from "./core.ts"

export function createNodeRawfilterRuntime(): RawfilterRuntime {
  return {
    pathInfo,
    listDir,
    ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    moveFile,
    createShortcut,
    join,
    dirname,
    basename,
  }
}

async function pathInfo(path: string): Promise<RawfilterPathInfo> {
  const resolved = resolve(path)
  try {
    const info = await stat(resolved)
    return { path: resolved, exists: true, isFile: info.isFile(), isDirectory: info.isDirectory() }
  } catch {
    return { path: resolved, exists: false, isFile: false, isDirectory: false }
  }
}

async function listDir(path: string): Promise<RawfilterDirEntry[]> {
  const entries = await readdir(path, { withFileTypes: true })
  return entries.map((entry) => ({
    name: entry.name,
    path: join(path, entry.name),
    isFile: entry.isFile(),
    isDirectory: entry.isDirectory(),
  }))
}

async function moveFile(source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  try {
    await rename(source, target)
  } catch {
    await cp(source, target, { force: false, errorOnExist: true })
    await rm(source, { force: true })
  }
}

async function createShortcut(source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true })
  try {
    await symlink(resolve(source), target)
    return
  } catch {
    const url = pathToFileURL(resolve(source)).href
    await writeFile(target, `[InternetShortcut]\nURL=${url}\n`, "utf8")
  }
}
