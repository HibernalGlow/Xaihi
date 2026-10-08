/**
 * sleept 的**独立进程运行时**：给 `core.ts` 的 `runSleept` 喂 `SleeptRuntime` 的那一台。
 * 从 `<Xiranite>` 当前 HEAD（`v1.0.0-587-g8e42280f`）的
 * `packages/nodes/sleept/src/platform.ts`（133 行）逐字搬来；上游把它与"命令规划器"
 * 放在同一个 `platform.ts`，本仓那份 `platform.ts` 已经长成了另一件事
 * （只规划不执行的 `planCommand` / 状态解析），所以这份住自己的文件，出处写在头上。
 *
 * 为什么独立 bin 敢执行而 `cli.ts` 的电源子命令不敢：上游的执行全部过 `dryrun` 闸
 * （schema 默认 `dryrun: true`，关掉它必须使用者在 TUI 里亲手切），终端面上那一下
 * 按键就是 AGENTS.md 说的"当场授权"；而 `cli.ts` 的管道子命令没有这道交互闸，仍然拒绝。
 *
 * 对上游的**两处偏离**（都要说清，不许静默）：
 * 1. `resolvePowerCommand` 补上了 `display-sleep` / `screensaver` 两条。上游是**半截子迁移**：
 *    `schedule.ts` / `interaction.ts` / `Tui.tsx` 都已是 6 值，但这份 `platform.ts` 没跟上，
 *    两个新模式会掉进 fall-through 的 `restart` 分支（mac 上等于 osascript restart，
 *    Windows 上等于 shutdown /r）——选"关显示器"把机器重启了。本仓把这两条接到
 *    `platform.ts` 已经验证过的 argv 上（`pmset displaysleepnow`、`open -a ScreenSaverEngine`、
 *    两条 WM_SYSCOMMAND 的 PowerShell 脚本），Linux 无对等物，返回 undefined 走下面的可读报错。
 * 2. `executePowerAction` 的报错原文写死了 "Hibernate is not supported…"，与实际模式无关；
 *    改成把 mode 名带进消息，其余一字未动。
 *
 * @module xaihi-sleept/runtime
 */

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { cpus } from "node:os"
import type { NetCounters, PowerMode, SleeptRuntime } from "./core.ts"

const execFileAsync = promisify(execFile)

interface CommandResult {
  code: number
  stdout: string
}

export interface PowerCommand {
  executable: string
  args: string[]
}

let lastCpuSample = readCpuSample()

export function createNodeSleeptRuntime(): SleeptRuntime {
  return {
    now: () => new Date(),
    sleep: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    getCpuPercent: () => getCpuPercent(),
    getNetCounters: () => getNetCounters(),
    executePowerAction: (mode, dryrun) => executePowerAction(mode, dryrun),
  }
}

async function getCpuPercent(): Promise<number> {
  const current = readCpuSample()
  const idle = current.idle - lastCpuSample.idle
  const total = current.total - lastCpuSample.total
  lastCpuSample = current
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, 100 - (idle / total) * 100))
}

async function getNetCounters(): Promise<NetCounters> {
  const platform = process.platform

  if (platform === "win32") {
    try {
      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "$ProgressPreference = 'SilentlyContinue'; Get-NetAdapterStatistics | ConvertTo-Json -Compress",
      ])
      const parsed = JSON.parse(stdout.trim() || "[]")
      const rows = Array.isArray(parsed) ? parsed : [parsed]
      return rows.reduce<NetCounters>(
        (acc, row) => ({
          bytesSent: acc.bytesSent + Number(row.SentBytes ?? 0),
          bytesReceived: acc.bytesReceived + Number(row.ReceivedBytes ?? 0),
        }),
        { bytesSent: 0, bytesReceived: 0 },
      )
    } catch {
      return { bytesSent: 0, bytesReceived: 0 }
    }
  }

  return { bytesSent: 0, bytesReceived: 0 }
}

async function executePowerAction(mode: PowerMode, dryrun: boolean): Promise<void> {
  if (dryrun) return

  const command = resolvePowerCommand(process.platform, mode)
  if (!command) throw new Error(`Power action "${mode}" is not supported by the ${process.platform} Sleept adapter.`)
  await execFileAsync(command.executable, command.args)
}

export function resolvePowerCommand(platform: NodeJS.Platform, mode: PowerMode): PowerCommand | undefined {
  if (platform === "win32") {
    if (mode === "sleep") return { executable: "rundll32.exe", args: ["powrprof.dll,SetSuspendState", "0,1,0"] }
    if (mode === "hibernate") return { executable: "shutdown", args: ["/h"] }
    if (mode === "shutdown") return { executable: "shutdown", args: ["/s", "/t", "1"] }
    if (mode === "restart") return { executable: "shutdown", args: ["/r", "/t", "1"] }
    // 下面两条的形状与 `platform.ts` 的 WINDOWS_MONITOR_OFF_SCRIPT / WINDOWS_SCREENSAVER_SCRIPT
    // 同源（WM_SYSCOMMAND 广播：SC_MONITORPOWER=0xF170 参数 2 = 关屏，SC_SCREENSAVE=0xF140）。
    // 上游漏接这两个模式时它们会 fall-through 到 `shutdown /r`——本仓在这里接住（见头注释偏离 1）。
    if (mode === "display-sleep") {
      return {
        executable: "powershell.exe",
        args: ["-NoProfile", "-NonInteractive", "-Command", 'Add-Type -Namespace Xaihi -Name Win -MemberDefinition \'[DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SendMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);\' ; [Xaihi.Win]::SendMessageW([IntPtr]0xffff, 0xF170, [IntPtr]2, [IntPtr]0) | Out-Null'],
      }
    }
    return {
      executable: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-Command", 'Add-Type -Namespace Xaihi -Name Win -MemberDefinition \'[DllImport("user32.dll", SetLastError=true)] public static extern IntPtr SendMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);\' ; [Xaihi.Win]::SendMessageW([IntPtr]0xffff, 0xF140, [IntPtr]0, [IntPtr]0) | Out-Null'],
    }
  }

  if (platform === "darwin") {
    if (mode === "hibernate") return undefined
    if (mode === "sleep") return { executable: "pmset", args: ["sleepnow"] }
    if (mode === "display-sleep") return { executable: "pmset", args: ["displaysleepnow"] }
    if (mode === "screensaver") return { executable: "open", args: ["-a", "ScreenSaverEngine"] }
    return { executable: "osascript", args: ["-e", `tell app "System Events" to ${mode === "shutdown" ? "shut down" : "restart"}`] }
  }

  if (mode === "sleep") return { executable: "systemctl", args: ["suspend"] }
  if (mode === "hibernate") return { executable: "systemctl", args: ["hibernate"] }
  if (mode === "shutdown") return { executable: "systemctl", args: ["poweroff"] }
  if (mode === "restart") return { executable: "systemctl", args: ["reboot"] }
  // display-sleep / screensaver 在 Linux 无对等物：宁可在这里可读报错，也不许 fall-through 成重启。
  return undefined
}

export async function readClipboardText(): Promise<string> {
  if (process.platform === "win32") {
    const result = await runCommand("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "$ProgressPreference = 'SilentlyContinue'; Get-Clipboard -Raw"])
    return result.code === 0 ? result.stdout.trim() : ""
  }

  if (process.platform === "darwin") {
    const result = await runCommand("pbpaste", [])
    return result.code === 0 ? result.stdout.trim() : ""
  }

  for (const command of [["wl-paste"], ["xclip", "-selection", "clipboard", "-o"], ["xsel", "--clipboard", "--output"]]) {
    // 本仓 tsconfig 开着 noUncheckedIndexedAccess（上游没有）：把可执行名收窄出来再调。
    const executable = command[0]
    if (executable === undefined) continue
    const result = await runCommand(executable, command.slice(1))
    if (result.code === 0 && result.stdout.trim()) return result.stdout.trim()
  }
  return ""
}

async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolveResult) => {
    execFile(command, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 32, encoding: "utf8" }, (error, stdout) => {
      const code = typeof (error as { code?: unknown } | null)?.code === "number" ? (error as { code: number }).code : error ? 1 : 0
      resolveResult({ code, stdout: stdout ?? "" })
    })
  })
}

function readCpuSample(): { idle: number; total: number } {
  return cpus().reduce(
    (acc, cpu) => {
      const times = cpu.times
      const total = times.user + times.nice + times.sys + times.idle + times.irq
      return { idle: acc.idle + times.idle, total: acc.total + total }
    },
    { idle: 0, total: 0 },
  )
}
