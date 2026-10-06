import type { CliHost } from "./index.js"

export const explicitInteractionModes = ["ui", "gd", "guided"] as const

export interface MemoryCliHost extends CliHost {
  stdoutText: () => string
  stderrText: () => string
}

export function createMemoryCliHost(options: {
  tty?: boolean
  cwd?: string
  env?: Record<string, string | undefined>
  configPath?: string
  columns?: number
} = {}): MemoryCliHost {
  let stdout = ""
  let stderr = ""
  const tty = options.tty ?? false
  const columns = options.columns ?? 120
  return {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, ...options.env, ...(options.configPath ? { XIRANITE_CONFIG_PATH: options.configPath } : {}) },
    stdin: { isTTY: tty } as CliHost["stdin"],
    stdout: { isTTY: tty, columns, write(chunk) { stdout += chunk; return true } },
    stderr: { isTTY: tty, columns, write(chunk) { stderr += chunk; return true } },
    stdoutText: () => stdout,
    stderrText: () => stderr,
  }
}

export function containsAnsi(value: string): boolean {
  return /\u001b\[[0-9;?]*[ -/]*[@-~]/.test(value)
}
