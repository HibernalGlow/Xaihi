import { execFile } from "node:child_process"
import { cp, lstat, mkdir, readdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises"
import { basename, dirname, join, resolve } from "node:path"
import type { DissolvefDirEntry, DissolvefPathInfo, DissolvefRuntime } from "./core.ts"

/**
 * Node 侧的 `DissolvefRuntime`。相对基线只改一件事：**默认历史路径的来源**。
 *
 * Xiranite 把它算在自己的配置目录旁边（`resolveXiraniteConfigPath()`）；DSH 没有
 * "每插件数据目录"这个 API（home 只是配置项，没有 `ctx.path` 之类的东西），所以这里
 * 不猜一个路径出来，而是要求调用方显式给——给不出就让症状是"要求设置 historyPath"，
 * 不是"历史写进了一个没人知道的地方"。取舍与依据见 `docs/adr/0003-migrated-node-file-state.md`。
 */
export function createNodeDissolvefRuntime(options: { historyDir?: string } = {}): DissolvefRuntime {
  return {
    pathInfo,
    listDir,
    ensureDir: (path) => mkdir(path, { recursive: true }).then(() => undefined),
    movePath,
    deletePath,
    readText,
    writeText,
    join,
    dirname,
    basename,
    now: () => new Date(),
    randomId: () => crypto.randomUUID().slice(0, 8),
    defaultHistoryPath: () => {
      if (options.historyDir === undefined) {
        throw new Error('dissolvef: no historyDir configured; set the node config "historyPath" (Xaihi 里没有"每插件数据目录"这个 API，路径必须显式给)')
      }
      return join(options.historyDir, "dissolvef.undo.json")
    },
  }
}

export async function readClipboardText(): Promise<string> {
  if (process.platform === "win32") {
    const result = await runCommand("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$ProgressPreference = 'SilentlyContinue'; Get-Clipboard -Raw",
    ])
    return result.code === 0 ? result.stdout.trim() : ""
  }

  if (process.platform === "darwin") {
    const result = await runCommand("pbpaste", [])
    return result.code === 0 ? result.stdout.trim() : ""
  }

  for (const command of [["wl-paste"], ["xclip", "-selection", "clipboard", "-o"], ["xsel", "--clipboard", "--output"]]) {
    const result = await runCommand(command[0]!, command.slice(1))
    if (result.code === 0 && result.stdout.trim()) return result.stdout.trim()
  }

  return ""
}

interface CommandResult {
  code: number
  stdout: string
}

async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return await new Promise((resolveResult) => {
    execFile(command, args, { encoding: "utf8", windowsHide: true }, (error, stdout) => {
      const code = typeof (error as NodeJS.ErrnoException | null)?.code === "number" ? Number((error as NodeJS.ErrnoException).code) : error ? 1 : 0
      resolveResult({ code, stdout: stdout ?? "" })
    })
  })
}

async function pathInfo(path: string): Promise<DissolvefPathInfo> {
  const resolved = resolve(path)
  try {
    const stat = await lstat(resolved)
    return { path: resolved, exists: true, isFile: stat.isFile(), isDirectory: stat.isDirectory() }
  } catch {
    return { path: resolved, exists: false, isFile: false, isDirectory: false }
  }
}

async function listDir(path: string): Promise<DissolvefDirEntry[]> {
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

async function deletePath(path: string, recursive = false): Promise<void> {
  if (recursive) {
    await rm(path, { recursive: true, force: false })
    return
  }
  const info = await pathInfo(path)
  if (info.isDirectory) await rmdir(path)
  else await rm(path, { force: false })
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8")
  } catch {
    return null
  }
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, "utf8")
}
