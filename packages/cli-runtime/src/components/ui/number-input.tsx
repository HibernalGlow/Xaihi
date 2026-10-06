/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react"
import { useEffect, useRef, useState, type ReactNode } from "react"

export interface NumberInputProps {
  id?: string
  value: number
  focused: boolean
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  colors: { border: string; focusRing: string; foreground: string; mutedForeground: string }
  onFocus: () => void
  onChange: (value: number) => void
}

/** termcn OpenTUI NumberInput adapted for isolated focus and mouse controls. */
export function NumberInput({ id, value, focused, disabled, min, max, step = 1, colors, onFocus, onChange }: NumberInputProps): ReactNode {
  const [hovered, setHovered] = useState<"minus" | "plus" | null>(null)
  const [buffer, setBuffer] = useState(String(value))
  const bufferRef = useRef(buffer)
  const clamp = (next: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, next))
  const set = (next: number) => {
    if (!disabled && Number.isFinite(next)) {
      const clamped = clamp(next)
      updateBuffer(String(clamped))
      onChange(clamped)
    }
  }
  const updateBuffer = (next: string) => { bufferRef.current = next; setBuffer(next) }
  useEffect(() => {
    if (!focused) updateBuffer(String(value))
  }, [focused, value])
  useKeyboard((key) => {
    if (!focused || disabled) return
    if (key.name === "up") set((Number(bufferRef.current) || value) + step)
    if (key.name === "down") set((Number(bufferRef.current) || value) - step)
  })
  return (
    <box flexDirection="row">
      <box id={`${id}-minus`} borderStyle="rounded" borderColor={hovered === "minus" ? colors.focusRing : colors.border} paddingLeft={1} paddingRight={1} onMouseDown={disabled ? undefined : () => { onFocus(); set(value - step) }} onMouseOver={() => setHovered("minus")} onMouseOut={() => setHovered(null)}>
        <text fg={disabled ? colors.mutedForeground : colors.foreground}>−</text>
      </box>
      <box id={id} borderStyle="rounded" borderColor={focused ? colors.focusRing : colors.border} width={10} height={3} paddingLeft={1} paddingRight={1} onMouseDown={disabled ? undefined : onFocus}>
        <input
          value={buffer}
          focused={focused && !disabled}
          onInput={disabled ? undefined : (next) => {
            const text = String(next)
            if (!/^-?\d*(?:\.\d*)?$/.test(text)) return
            updateBuffer(text)
            if (!text || text === "-" || text === "." || text === "-.") return
            const parsed = Number(text)
            if (Number.isFinite(parsed)) onChange(clamp(parsed))
          }}
        />
      </box>
      <box id={`${id}-plus`} borderStyle="rounded" borderColor={hovered === "plus" ? colors.focusRing : colors.border} paddingLeft={1} paddingRight={1} onMouseDown={disabled ? undefined : () => { onFocus(); set(value + step) }} onMouseOver={() => setHovered("plus")} onMouseOut={() => setHovered(null)}>
        <text fg={disabled ? colors.mutedForeground : colors.foreground}>+</text>
      </box>
    </box>
  )
}
