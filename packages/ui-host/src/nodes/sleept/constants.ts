import { Calendar, Cpu, Moon, MonitorOff, MonitorPlay, Power, RotateCcw, Snowflake, Timer, Wifi } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import type { NetTriggerMode, PowerMode } from "@xiranite/node-sleept/core"
import type { SleeptTimerMode } from "./types"

export interface SleeptTimerModeMeta {
  value: SleeptTimerMode
  label: string
  shortLabel: string
  description: string
  icon: LucideIcon
}

export const TIMER_MODES: SleeptTimerModeMeta[] = [
  {
    value: "countdown",
    label: "倒计时",
    shortLabel: "倒计时",
    description: "从现在开始倒数指定时长后触发电源操作。",
    icon: Timer,
  },
  {
    value: "specific_time",
    label: "指定时间",
    shortLabel: "指定时间",
    description: "在未来的某个时刻触发电源操作。",
    icon: Calendar,
  },
  {
    value: "netspeed",
    label: "网速监控",
    shortLabel: "网速",
    description: "网速持续低于阈值一段时间后触发电源操作。",
    icon: Wifi,
  },
  {
    value: "cpu",
    label: "CPU 监控",
    shortLabel: "CPU",
    description: "CPU 占用持续低于阈值一段时间后触发电源操作。",
    icon: Cpu,
  },
]

export interface SleeptPowerModeMeta {
  value: PowerMode
  label: string
  shortLabel: string
  icon: LucideIcon
}

export const POWER_MODES: SleeptPowerModeMeta[] = [
  { value: "sleep", label: "睡眠", shortLabel: "睡眠", icon: Moon },
  { value: "hibernate", label: "休眠", shortLabel: "休眠", icon: Snowflake },
  { value: "shutdown", label: "关机", shortLabel: "关机", icon: Power },
  { value: "restart", label: "重启", shortLabel: "重启", icon: RotateCcw },
  { value: "display-sleep", label: "显示器休眠", shortLabel: "熄屏", icon: MonitorOff },
  { value: "screensaver", label: "进入屏保", shortLabel: "屏保", icon: MonitorPlay },
]

export const NET_TRIGGER_MODES: Array<{ value: NetTriggerMode; label: string }> = [
  { value: "both", label: "都低于" },
  { value: "any", label: "任一低于" },
]

export const DEFAULT_TARGET_DATETIME = defaultTargetDatetime()

export const STATS_ACTION = {
  label: "刷新状态",
  description: "读取当前 CPU 占用与上下行网速。",
  icon: Cpu,
}

function defaultTargetDatetime(): string {
  const value = new Date(Date.now() + 3600_000)
  const yyyy = value.getFullYear()
  const mm = String(value.getMonth() + 1).padStart(2, "0")
  const dd = String(value.getDate()).padStart(2, "0")
  const hh = String(value.getHours()).padStart(2, "0")
  const mi = String(value.getMinutes()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:00`
}
