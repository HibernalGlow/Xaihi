/* @jsxImportSource @opentui/react */
import type { ReactNode } from "react"
import { useTerminalTheme } from "../theme.js"

// Adapted from @termcn/opentui/progress-bar.
export function ProgressBar({ value, width = 30, label }: { value: number; width?: number; label?: string }): ReactNode {
  const theme = useTerminalTheme()
  const percent = Math.max(0, Math.min(100, Math.round(value)))
  const filled = Math.round((percent / 100) * width)
  return (
    <box flexDirection="column">
      {label ? <text>{label}</text> : null}
      <box flexDirection="row" gap={1}>
        <text fg={theme.colors.primary}>{"█".repeat(filled)}{"░".repeat(width - filled)}</text>
        <text fg={theme.colors.mutedForeground}>{percent}%</text>
      </box>
    </box>
  )
}
