/** 找到能真跑起来的包管理器命令：Windows 的 PATH 里那个 `pnpm` 是 .cmd 垫片，CreateProcess 不认。 */
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/** 需要 shell 才能执行的脚本垫片后缀（Windows 上 pnpm 常见落点）。 */
const SHELL_ONLY = ['.cmd', '.bat']

function basename (command) {
  return command.split(/[\\/]/u).pop() ?? command
}

/**
 * Resolve how to spawn a package-manager command without a shell where possible.
 * @param {string} command - Bare command name, e.g. `pnpm`.
 * @param {{platform?: string, pathList?: string[], exists?: (p: string) => boolean}} [probe] - Injectable platform, `PATH` entries and existence check, so both shapes are testable on any host.
 * @returns {{command: string, shell: boolean}} Executable to spawn plus whether a shell is required to reach it.
 */
export function resolvePackageManager (command, probe = {}) {
  const platform = probe.platform ?? process.platform
  const exists = probe.exists ?? (p => existsSync(p))
  if (platform !== 'win32') return { command, shell: false }
  const pathList = probe.pathList ?? (process.env.PATH ?? '').split(delimiter)
  for (const dir of pathList.filter(Boolean)) {
    const exe = join(dir, `${basename(command)}.exe`)
    if (exists(exe)) return { command: exe, shell: false }
  }
  for (const dir of pathList.filter(Boolean)) {
    if (SHELL_ONLY.some(ext => exists(join(dir, `${basename(command)}${ext}`)))) return { command, shell: true }
  }
  return { command, shell: false }
}

/**
 * Quote arguments that a Windows shell would otherwise split.
 * @param {readonly string[]} args - Arguments passed after the resolved command.
 * @returns {string} A single command line, quoted where an argument contains whitespace or a quote.
 */
export function shellCommandLine (args) {
  return args.map(a => (/[\s"]/u.test(a) ? `"${a.replaceAll('"', '\\"')}"` : a)).join(' ')
}
