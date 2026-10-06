import { spawn } from "node:child_process"

import type { CliHost } from "../index.js"

export function isBunRuntime(): boolean {
  return Boolean((process.versions as Record<string, string | undefined>).bun)
}

export async function reexecTerminalUiWithBun(
  host: CliHost,
  reexec: { entrypoint: string; args: readonly string[] } | undefined,
): Promise<void> {
  if (!reexec?.entrypoint) {
    throw new Error("OpenTUI requires the Bun runtime. Run this command with `bun` or provide a re-executable CLI entrypoint.")
  }
  if (host.stdin !== process.stdin || host.stdout !== process.stdout || host.stderr !== process.stderr) {
    throw new Error("OpenTUI requires Bun and cannot re-exec a custom embedded CLI host.")
  }

  const executable = resolveBunExecutable(host.env)
  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(executable, [reexec.entrypoint, ...reexec.args], {
      cwd: host.cwd,
      env: { ...process.env, ...host.env },
      stdio: "inherit",
      windowsHide: true,
    })
    child.once("error", (error) => reject(new Error(`Unable to start Bun for OpenTUI: ${error.message}`)))
    child.once("exit", (code) => resolve(code ?? 1))
  })
  if (exitCode !== 0) process.exitCode = exitCode
}

function resolveBunExecutable(env: Record<string, string | undefined>): string {
  if (env.XIRANITE_BUN_PATH) return env.XIRANITE_BUN_PATH
  const npmExecPath = env.npm_execpath
  if (npmExecPath && /bun(?:\.exe)?$/i.test(npmExecPath)) return npmExecPath
  return process.platform === "win32" ? "bun.exe" : "bun"
}
