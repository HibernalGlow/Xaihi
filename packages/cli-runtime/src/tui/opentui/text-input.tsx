/* @jsxImportSource @opentui/react */
import { TextAttributes } from "@opentui/core"
import { useKeyboard } from "@opentui/react"
import { useEffect, useState, type ReactNode } from "react"

import { useTerminalTheme } from "../theme.js"

// Adapted from @termcn/opentui/text-input.
export function TextInput({
  value,
  label,
  placeholder = "",
  error,
  onChange,
  onSubmit,
}: {
  value: string
  label?: string
  placeholder?: string
  error?: string
  onChange: (value: string) => void
  onSubmit: (value: string) => void
}): ReactNode {
  const theme = useTerminalTheme()
  const [cursorOffset, setCursorOffset] = useState(value.length)

  useEffect(() => {
    setCursorOffset((current) => Math.min(current, value.length))
  }, [value.length])

  useKeyboard((key) => {
    if (key.name === "up" || key.name === "down" || key.name === "tab" || key.name === "escape" || (key.ctrl && key.name === "c")) return
    if (key.name === "return") {
      onSubmit(value)
      return
    }
    if (key.name === "left") {
      setCursorOffset((current) => Math.max(0, current - 1))
      return
    }
    if (key.name === "right") {
      setCursorOffset((current) => Math.min(value.length, current + 1))
      return
    }
    if (key.name === "backspace" || key.name === "delete") {
      if (cursorOffset <= 0) return
      onChange(value.slice(0, cursorOffset - 1) + value.slice(cursorOffset))
      setCursorOffset((current) => Math.max(0, current - 1))
      return
    }
    const input = key.sequence.length === 1 ? key.sequence : key.name.length === 1 ? key.name : ""
    if (!input || key.ctrl || key.meta) return
    onChange(value.slice(0, cursorOffset) + input + value.slice(cursorOffset))
    setCursorOffset((current) => current + input.length)
  })

  const content = value || placeholder
  const muted = !value
  const before = content.slice(0, cursorOffset)
  const cursor = content[cursorOffset] ?? " "
  const after = content.slice(cursorOffset + 1)

  return (
    <box flexDirection="column">
      {label ? <text><b>{label}</b></text> : null}
      <box
        borderStyle="rounded"
        borderColor={error ? theme.colors.error : theme.colors.focusRing}
        paddingLeft={1}
        paddingRight={1}
        width={48}
      >
        <text fg={muted ? theme.colors.mutedForeground : theme.colors.foreground}>{before}</text>
        <text fg={theme.colors.focusRing} attributes={TextAttributes.INVERSE}>{cursor}</text>
        <text fg={muted ? theme.colors.mutedForeground : theme.colors.foreground}>{after}</text>
      </box>
      {error ? <text fg={theme.colors.error}>{error}</text> : null}
    </box>
  )
}
