/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react"
import { useState, type ReactNode } from "react"

import type { InteractionOption, InteractionValue } from "../../interaction.js"
import { useTerminalTheme } from "../theme.js"

// Adapted from @termcn/opentui/select.
export function Select<Value extends InteractionValue>({
  options,
  value,
  label,
  onSubmit,
}: {
  options: readonly InteractionOption<Value>[]
  value?: Value
  label?: string
  onSubmit: (value: Value) => void
}): ReactNode {
  const theme = useTerminalTheme()
  const [activeIndex, setActiveIndex] = useState(() => {
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled)
    return selectedIndex >= 0 ? selectedIndex : firstEnabledIndex(options)
  })

  useKeyboard((key) => {
    if (key.name === "up") setActiveIndex((current) => nextEnabledIndex(options, current, -1))
    if (key.name === "down") setActiveIndex((current) => nextEnabledIndex(options, current, 1))
    if (key.name === "return") {
      const option = options[activeIndex]
      if (option && !option.disabled) onSubmit(option.value)
    }
  })

  return (
    <box flexDirection="column">
      {label ? <text><b>{label}</b></text> : null}
      {options.map((option, index) => {
        const active = index === activeIndex
        const selected = option.value === value
        return (
          <box key={`${String(option.value)}-${index}`} gap={1}>
            <text fg={active ? theme.colors.primary : undefined}>{active ? "›" : " "}</text>
            <text fg={option.disabled ? theme.colors.mutedForeground : active ? theme.colors.primary : theme.colors.foreground}>
              {active || selected ? <b>{option.label}</b> : option.label}
            </text>
            {option.hint ? <text fg={theme.colors.mutedForeground}>{option.hint}</text> : null}
          </box>
        )
      })}
    </box>
  )
}

function firstEnabledIndex<Value extends InteractionValue>(options: readonly InteractionOption<Value>[]): number {
  const index = options.findIndex((option) => !option.disabled)
  return Math.max(0, index)
}

function nextEnabledIndex<Value extends InteractionValue>(
  options: readonly InteractionOption<Value>[],
  current: number,
  direction: -1 | 1,
): number {
  let next = current + direction
  while (next >= 0 && next < options.length && options[next]?.disabled) next += direction
  return next < 0 || next >= options.length ? current : next
}
