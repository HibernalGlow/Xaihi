/* @jsxImportSource @opentui/react */
import {
  SliderRenderable,
  type KeyEvent,
  type MouseEvent,
  type RenderContext,
  type SliderOptions,
} from "@opentui/core"
import { extend } from "@opentui/react"
import { useRef, type ReactNode } from "react"

interface TerminalSliderRenderableOptions extends SliderOptions {
  step?: number
  disabled?: boolean
}

class TerminalSliderRenderable extends SliderRenderable {
  private _step = 1
  private _disabled = false
  private _isUserInput = false

  constructor(ctx: RenderContext, options: TerminalSliderRenderableOptions) {
    let instance: TerminalSliderRenderable | undefined
    const onChange = options.onChange
    super(ctx, {
      ...options,
      onChange: (value) => {
        if (instance?._isUserInput) onChange?.(value)
      },
    })
    instance = this
    this._step = normalizeStep(options.step)
    this._disabled = options.disabled === true
    this._focusable = !this._disabled
    this.value = options.value ?? options.min ?? 0
  }

  override get value(): number {
    return super.value
  }

  override set value(value: number) {
    super.value = quantize(value, this.min, this.max, this._step)
  }

  get step(): number {
    return this._step
  }

  set step(value: number) {
    const next = normalizeStep(value)
    if (next === this._step) return
    this._step = next
    this.value = this.value
  }

  get disabled(): boolean {
    return this._disabled
  }

  set disabled(value: boolean) {
    this._disabled = value === true
    this.focusable = !this._disabled
    if (this._disabled) this.blur()
  }

  override processMouseEvent(event: MouseEvent): void {
    if (this._disabled) return
    if (event.type === "down") this.focus()
    this._isUserInput = true
    try {
      super.processMouseEvent(event)
    } finally {
      this._isUserInput = false
    }
  }

  override handleKeyPress(key: KeyEvent): boolean {
    if (this._disabled) return false
    const decrement = this.orientation === "horizontal" ? "left" : "down"
    const increment = this.orientation === "horizontal" ? "right" : "up"
    let next: number | undefined
    if (key.name === decrement) next = this.value - this._step
    if (key.name === increment) next = this.value + this._step
    if (key.name === "home") next = this.min
    if (key.name === "end") next = this.max
    if (next === undefined) return false
    key.preventDefault()
    key.stopPropagation()
    this._isUserInput = true
    try {
      this.value = next
    } finally {
      this._isUserInput = false
    }
    return true
  }
}

declare module "@opentui/react" {
  interface OpenTUIComponents {
    "xiranite-slider": typeof TerminalSliderRenderable
  }
}

extend({ "xiranite-slider": TerminalSliderRenderable })

export interface TerminalSliderProps {
  id?: string
  value: number
  min?: number
  max?: number
  step?: number
  width: number | `${number}%`
  height?: number
  orientation?: "horizontal" | "vertical"
  viewPortSize?: number
  backgroundColor?: string
  foregroundColor?: string
  disabled?: boolean
  onChange(value: number): void
}

export function TerminalSlider({
  value,
  min = 0,
  max = 100,
  step = 1,
  height = 1,
  orientation = "horizontal",
  viewPortSize = Math.max(step, (max - min) / 100),
  onChange,
  ...props
}: TerminalSliderProps): ReactNode {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  return (
    <xiranite-slider
      {...props}
      value={value}
      min={min}
      max={max}
      step={step}
      height={height}
      orientation={orientation}
      viewPortSize={viewPortSize}
      onChange={(next) => onChangeRef.current(next)}
    />
  )
}

function normalizeStep(step: number | undefined): number {
  return Number.isFinite(step) && Number(step) > 0 ? Number(step) : 1
}

function quantize(value: number, min: number, max: number, step: number): number {
  const clamped = Math.max(min, Math.min(max, value))
  const stepped = min + Math.round((clamped - min) / step) * step
  return Math.max(min, Math.min(max, Number(stepped.toFixed(10))))
}
