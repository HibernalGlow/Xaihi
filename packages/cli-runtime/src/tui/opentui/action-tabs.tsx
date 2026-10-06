/* @jsxImportSource @opentui/react */
import { useState, type ReactNode } from "react"

import type { InteractionOption, InteractionValue } from "../../interaction.js"
import { useTerminalTheme } from "../theme.js"

/**
 * Mouse-first action strip. OpenTUI's native tab-select currently handles
 * keyboard selection but not per-tab mouse hit testing, so this small adapter
 * keeps the renderer-native boxes while exposing stable hit targets.
 */
export function ActionTabs({
  id,
  options,
  value,
  focused,
  disabled,
  onFocus,
  onChange,
}: {
  id: string
  options: readonly InteractionOption[]
  value?: InteractionValue
  focused: boolean
  disabled?: boolean
  onFocus: () => void
  onChange: (value: InteractionValue) => void
}): ReactNode {
  return (
    <box id={id} flexDirection="row" flexWrap="wrap" minHeight={3} alignItems="center">
      {options.map((option) => (
        <ActionTab
          key={String(option.value)}
          id={`${id}-${String(option.value)}`}
          label={option.label}
          selected={option.value === value}
          focused={focused}
          disabled={disabled || option.disabled}
          onClick={() => {
            onFocus()
            onChange(option.value)
          }}
        />
      ))}
    </box>
  )
}

function ActionTab({
  id,
  label,
  selected,
  focused,
  disabled,
  onClick,
}: {
  id: string
  label: string
  selected: boolean
  focused: boolean
  disabled?: boolean
  onClick: () => void
}) {
  const theme = useTerminalTheme()
  const [hovered, setHovered] = useState(false)
  const active = selected || hovered || focused
  const color = disabled ? theme.colors.mutedForeground : active ? theme.colors.focusRing : theme.colors.mutedForeground
  return (
    <box
      id={id}
      // Keep the border on every tab. Toggling it changed the terminal row
      // count and made inactive labels appear to float above the active tab.
      borderStyle="rounded"
      borderColor={selected ? color : theme.colors.border}
      height={3}
      paddingLeft={1}
      paddingRight={1}
      justifyContent="center"
      alignItems="center"
      onMouseDown={disabled ? undefined : onClick}
      onMouseOver={disabled ? undefined : () => setHovered(true)}
      onMouseOut={disabled ? undefined : () => setHovered(false)}
    >
      <text fg={color}>{active ? <b>{label}</b> : label}</text>
    </box>
  )
}
