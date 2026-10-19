import * as React from 'react'
import { getXMd3eShape, getXMd3eShapePhase, type XMd3eShapeId, type XMd3eShapePhase } from './shapes.ts'
import { registerKitStyles } from './components.tsx'

export type XMd3eControlTone = 'primary' | 'secondary' | 'tertiary' | 'neutral' | 'error'
export type XMd3eActionSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export type XMd3eSliderThickness = 16 | 24 | 40

export function getXMd3eShapeStyle(shapeId: XMd3eShapeId, phase: XMd3eShapePhase = 'idle'): React.CSSProperties {
  const shape = getXMd3eShape(shapeId)
  const resolved = getXMd3eShapePhase(shape, phase)
  return {
    '--xaihi-shape-clip': shape.clipPath ?? 'none',
    '--xaihi-shape-pressed-clip': shape.pressedClipPath ?? shape.clipPath ?? 'none',
    '--xaihi-shape-expanded-clip': shape.expandedClipPath ?? shape.clipPath ?? 'none',
    '--xaihi-shape-radius': shape.borderRadius ?? '0px',
    '--xaihi-shape-pressed-radius': shape.pressedBorderRadius ?? shape.borderRadius ?? '0px',
    '--xaihi-shape-expanded-radius': shape.expandedBorderRadius ?? shape.borderRadius ?? '0px',
    '--xaihi-shape-phase-clip': resolved.clipPath ?? 'none',
    '--xaihi-shape-phase-radius': resolved.borderRadius ?? '0px',
  } as React.CSSProperties
}

const getFocusable = (root: HTMLElement): HTMLElement[] => Array.from(root.querySelectorAll<HTMLElement>(
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
))

function usePressState(controlled: boolean) {
  const [pointerPressed, setPointerPressed] = React.useState(false)
  const [keyboardPressed, setKeyboardPressed] = React.useState(false)
  return {
    pressed: controlled || pointerPressed || keyboardPressed,
    onPointerDown: () => setPointerPressed(true),
    onPointerUp: () => setPointerPressed(false),
    onPointerCancel: () => setPointerPressed(false),
    onKeyDown: (event: React.KeyboardEvent) => { if (event.key === ' ' || event.key === 'Enter') setKeyboardPressed(true) },
    onKeyUp: (event: React.KeyboardEvent) => { if (event.key === ' ' || event.key === 'Enter') setKeyboardPressed(false) },
    onBlur: () => { setPointerPressed(false); setKeyboardPressed(false) },
  }
}

export interface XMd3eRootProps extends React.HTMLAttributes<HTMLDivElement> {
  registerStyles?: boolean
}

export function XMd3eRoot({ registerStyles = true, className = '', children, ...rest }: XMd3eRootProps): React.ReactElement {
  React.useEffect(() => {
    if (!registerStyles || typeof document === 'undefined') return undefined
    return registerKitStyles()
  }, [registerStyles])
  return <div data-ui-face="md3e" className={`xaihi-md3e-shell ${className}`.trim()} {...rest}>{children}</div>
}

export interface XMd3eNodeFrameProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Let the node own scrolling while keeping the host surface bounded. */
  scroll?: 'internal' | 'none'
}

/**
 * Host-neutral node boundary. A consumer can mount a node in a card, a pane,
 * or a standalone project without recreating the container-query contract.
 */
export function XMd3eNodeFrame({ scroll = 'internal', className = '', children, ...rest }: XMd3eNodeFrameProps): React.ReactElement {
  return (
    <div
      data-xaihi-node-frame="md3e"
      data-scroll={scroll}
      className={`xaihi-md3e-node-frame ${className}`.trim()}
      {...rest}
    >
      {children}
    </div>
  )
}

export interface XMd3eShapeButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shape?: XMd3eShapeId
  tone?: XMd3eControlTone
  size?: 'sm' | 'md' | 'lg'
  pressed?: boolean
  phase?: XMd3eShapePhase
}

export function XMd3eShapeButton({ shape = 'rounded-square', tone = 'primary', size = 'md', pressed = false, phase, className = '', children, style, onPointerDown, onPointerUp, onPointerCancel, onKeyDown, onKeyUp, onBlur, ...rest }: XMd3eShapeButtonProps): React.ReactElement {
  const pressState = usePressState(pressed)
  const resolvedShape = getXMd3eShape(shape)
  const isPressed = pressState.pressed
  const resolvedPhase = phase ?? (isPressed ? 'pressed' : 'idle')
  return (
    <button
      type="button"
      {...rest}
      className={`xaihi-md3e-shape-button xaihi-md3e-shape ${className}`.trim()}
      data-shape={resolvedShape.id}
      data-tone={tone}
      data-size={size}
      data-pressed={isPressed ? 'true' : 'false'}
      data-state={resolvedPhase}
      data-phase={resolvedPhase}
      aria-pressed={pressed || undefined}
      style={{
        ...getXMd3eShapeStyle(resolvedShape.id, resolvedPhase),
        ...style,
      } as React.CSSProperties}
      onPointerDown={(event) => { pressState.onPointerDown(); onPointerDown?.(event) }}
      onPointerUp={(event) => { pressState.onPointerUp(); onPointerUp?.(event) }}
      onPointerCancel={(event) => { pressState.onPointerCancel(); onPointerCancel?.(event) }}
      onKeyDown={(event) => {
        pressState.onKeyDown(event)
        onKeyDown?.(event)
      }}
      onKeyUp={(event) => {
        pressState.onKeyUp(event)
        onKeyUp?.(event)
      }}
      onBlur={(event) => {
        pressState.onBlur()
        onBlur?.(event)
      }}
    >
      {children}
    </button>
  )
}

export interface XMd3eConnectedGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical'
  distribution?: 'intrinsic' | 'equal'
}

export function XMd3eConnectedGroup({ orientation = 'horizontal', distribution = 'intrinsic', className = '', children, ...rest }: XMd3eConnectedGroupProps): React.ReactElement {
  return <div role="group" data-slot="xaihi-md3e-connected-group" data-orientation={orientation} data-distribution={distribution} className={`xaihi-md3e-connected-group ${className}`.trim()} {...rest}>{children}</div>
}

export interface XMd3eSwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'> {
  checked: boolean
  onCheckedChange?: (checked: boolean) => void
  label: React.ReactNode
  description?: React.ReactNode
  value?: React.ReactNode
  leading?: React.ReactNode
}

export function XMd3eSwitch({ checked, onCheckedChange, label, description, value, leading, className = '', onClick, ...rest }: XMd3eSwitchProps): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-checked={checked ? 'true' : 'false'}
      data-state={checked ? 'checked' : 'unchecked'}
      className={`xaihi-md3e-switch-row ${className}`.trim()}
      onClick={(event) => { onCheckedChange?.(!checked); onClick?.(event) }}
      {...rest}
    >
      {leading}
      <span className="xaihi-md3e-switch-copy"><span className="xaihi-md3e-switch-label">{label}</span>{description !== undefined && <span className="xaihi-md3e-switch-description">{description}</span>}</span>
      {value !== undefined && <span className="xaihi-md3e-value-chip">{value}</span>}
      <span aria-hidden="true" className="xaihi-md3e-switch-track"><span className="xaihi-md3e-switch-thumb"><span className="xaihi-md3e-switch-check" /></span></span>
    </button>
  )
}

export interface XMd3eSliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'onChange' | 'value'> {
  value: number
  onValueChange?: (value: number) => void
  label?: React.ReactNode
  thickness?: XMd3eSliderThickness
  orientation?: 'horizontal' | 'vertical'
  ticks?: readonly number[]
  showValue?: boolean
  wavy?: boolean
}

export function XMd3eSlider({ value, onValueChange, label, thickness = 24, orientation = 'horizontal', ticks = [], showValue = true, wavy = false, className = '', min = 0, max = 100, step = 1, ...rest }: XMd3eSliderProps): React.ReactElement {
  const percent = max === min ? 0 : Math.max(0, Math.min(100, ((value - Number(min)) / (Number(max) - Number(min))) * 100))
  return (
    <div className={`xaihi-md3e-slider ${className}`.trim()} data-orientation={orientation} data-thickness={thickness} data-wavy={wavy ? 'true' : 'false'} style={{ '--xaihi-slider-progress': `${percent}%` } as React.CSSProperties}>
      {(label !== undefined || showValue) && <div className="xaihi-md3e-slider-header"><span>{label}</span>{showValue && <span className="xaihi-md3e-value-chip">{value}</span>}</div>}
      <div className="xaihi-md3e-slider-rail"><input {...rest} type="range" value={value} min={min} max={max} step={step} aria-label={rest['aria-label'] ?? (typeof label === 'string' ? label : undefined)} onChange={(event) => onValueChange?.(Number(event.currentTarget.value))} /></div>
      {ticks.length > 0 && <div className="xaihi-md3e-slider-ticks">{ticks.map((tick) => <span key={tick} data-active={tick <= value ? 'true' : 'false'} />)}</div>}
    </div>
  )
}

export interface XMd3eProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  wavy?: boolean
  thickness?: XMd3eSliderThickness
}

export function XMd3eProgress({ value, wavy = false, thickness = 16, className = '', ...rest }: XMd3eProgressProps): React.ReactElement {
  const clamped = Math.max(0, Math.min(100, value))
  return <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} data-wavy={wavy ? 'true' : 'false'} data-thickness={thickness} className={`xaihi-md3e-progress ${className}`.trim()} {...rest}><span style={{ width: `${clamped}%` }} /></div>
}

export interface XMd3eActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: XMd3eActionSize
  tone?: XMd3eControlTone
  shape?: XMd3eShapeId
  phase?: XMd3eShapePhase
}

export function XMd3eActionButton({ size = 'md', tone = 'primary', shape = 'pill', phase, className = '', children, style, onPointerDown, onPointerUp, onPointerCancel, onKeyDown, onKeyUp, onBlur, ...rest }: XMd3eActionButtonProps): React.ReactElement {
  const pressState = usePressState(false)
  const resolvedPhase = phase ?? (pressState.pressed ? 'pressed' : 'idle')
  return <button type="button" {...rest} data-size={size} data-tone={tone} data-shape={shape} data-phase={resolvedPhase} data-pressed={pressState.pressed ? 'true' : 'false'} style={{ ...getXMd3eShapeStyle(shape, resolvedPhase), ...style } as React.CSSProperties} className={`xaihi-md3e-action-button xaihi-md3e-shape ${className}`.trim()} onPointerDown={(event) => { pressState.onPointerDown(); onPointerDown?.(event) }} onPointerUp={(event) => { pressState.onPointerUp(); onPointerUp?.(event) }} onPointerCancel={(event) => { pressState.onPointerCancel(); onPointerCancel?.(event) }} onKeyDown={(event) => { pressState.onKeyDown(event); onKeyDown?.(event) }} onKeyUp={(event) => { pressState.onKeyUp(event); onKeyUp?.(event) }} onBlur={(event) => { pressState.onBlur(); onBlur?.(event) }}>{children}</button>
}

export function XMd3eValueChip({ className = '', children, ...rest }: React.HTMLAttributes<HTMLSpanElement>): React.ReactElement {
  return <span className={`xaihi-md3e-value-chip ${className}`.trim()} {...rest}>{children}</span>
}

export interface XMd3eShapeSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: XMd3eShapeId
  phase?: XMd3eShapePhase
  tone?: XMd3eControlTone
}

export function XMd3eShapeSurface({ shape = 'rounded-square', phase = 'idle', tone = 'neutral', className = '', style, children, ...rest }: XMd3eShapeSurfaceProps): React.ReactElement {
  return <div {...rest} data-shape={shape} data-phase={phase} data-tone={tone} className={`xaihi-md3e-shape-surface xaihi-md3e-shape ${className}`.trim()} style={{ ...getXMd3eShapeStyle(shape, phase), ...style } as React.CSSProperties}>{children}</div>
}

export interface XMd3eIconButtonProps extends Omit<XMd3eShapeButtonProps, 'children'> {
  'aria-label': string
  icon: React.ReactNode
}

export function XMd3eIconButton({ icon, ...props }: XMd3eIconButtonProps): React.ReactElement {
  return <XMd3eShapeButton {...props}>{icon}</XMd3eShapeButton>
}

export interface XMd3eChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  shape?: XMd3eShapeId
  tone?: XMd3eControlTone
  phase?: XMd3eShapePhase
}

export function XMd3eChip({ shape = 'pill', tone = 'secondary', phase = 'idle', className = '', style, children, ...rest }: XMd3eChipProps): React.ReactElement {
  return <span {...rest} data-shape={shape} data-tone={tone} data-phase={phase} className={`xaihi-md3e-chip xaihi-md3e-shape ${className}`.trim()} style={{ ...getXMd3eShapeStyle(shape, phase), ...style } as React.CSSProperties}>{children}</span>
}

export interface XMd3eFabProps extends Omit<XMd3eActionButtonProps, 'size'> {
  size?: Extract<XMd3eActionSize, 'lg' | 'xl'>
}

export function XMd3eFab({ className = '', ...props }: XMd3eFabProps): React.ReactElement {
  return <XMd3eActionButton size="xl" {...props} className={`xaihi-md3e-fab ${className}`.trim()} />
}

export interface XMd3eExtendedFabProps extends Omit<XMd3eActionButtonProps, 'children' | 'size'> {
  label: React.ReactNode
  icon?: React.ReactNode
  size?: Extract<XMd3eActionSize, 'lg' | 'xl'>
}

/** A text-bearing FAB used for the primary action in an expressive control rail. */
export function XMd3eExtendedFab({ label, icon, size = 'lg', className = '', ...rest }: XMd3eExtendedFabProps): React.ReactElement {
  return (
    <XMd3eActionButton size={size} {...rest} className={`xaihi-md3e-extended-fab ${className}`.trim()}>
      {icon !== undefined && <span className="xaihi-md3e-extended-fab-icon" aria-hidden="true">{icon}</span>}
      <span className="xaihi-md3e-extended-fab-label">{label}</span>
    </XMd3eActionButton>
  )
}

export interface XMd3eLiquidGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  intensity?: 'soft' | 'medium' | 'strong'
}

export function XMd3eLiquidGlass({ intensity = 'medium', className = '', children, ...rest }: XMd3eLiquidGlassProps): React.ReactElement {
  return <div {...rest} data-intensity={intensity} className={`xaihi-md3e-liquid-glass ${className}`.trim()}>{children}</div>
}

export interface XMd3eLensBarProps extends React.HTMLAttributes<HTMLDivElement> {
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

export function XMd3eLensBar({ leading, trailing, className = '', children, ...rest }: XMd3eLensBarProps): React.ReactElement {
  return <div {...rest} className={`xaihi-md3e-lens-bar ${className}`.trim()}>{leading}<div className="xaihi-md3e-lens-bar-content">{children}</div>{trailing}</div>
}

export interface XMd3eNavigationDockProps extends React.HTMLAttributes<HTMLElement> {
  items: readonly { id: string; label: React.ReactNode; icon?: React.ReactNode }[]
  value?: string
  onValueChange?: (value: string) => void
}

export function XMd3eNavigationDock({ items, value, onValueChange, className = '', ...rest }: XMd3eNavigationDockProps): React.ReactElement {
  return <nav {...rest} className={`xaihi-md3e-navigation-dock ${className}`.trim()}>{items.map((item) => <button key={item.id} type="button" className="xaihi-md3e-navigation-item" data-active={item.id === value ? 'true' : 'false'} aria-current={item.id === value ? 'page' : undefined} onClick={() => onValueChange?.(item.id)}>{item.icon}<span>{item.label}</span></button>)}</nav>
}

export interface XMd3ePopupProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean
  placement?: 'top' | 'bottom' | 'start' | 'end'
}

export function XMd3ePopup({ open = true, placement = 'bottom', className = '', children, ...rest }: XMd3ePopupProps): React.ReactElement | null {
  if (!open) return null
  return <div {...rest} role="dialog" data-placement={placement} className={`xaihi-md3e-popup ${className}`.trim()}>{children}</div>
}

export interface XMd3eMultiChoiceOption {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
}

export interface XMd3eMultiChoiceChipsProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  options: readonly XMd3eMultiChoiceOption[]
  values: readonly string[]
  onValuesChange?: (values: string[]) => void
}

/** Multi-select chips keep the selected state in one controlled list. */
export function XMd3eMultiChoiceChips({ options, values, onValuesChange, className = '', ...rest }: XMd3eMultiChoiceChipsProps): React.ReactElement {
  return (
    <div {...rest} role="group" className={`xaihi-md3e-multi-choice-chips ${className}`.trim()}>
      {options.map((option) => {
        const selected = values.includes(option.id)
        return (
          <button
            key={option.id}
            type="button"
            disabled={option.disabled}
            aria-pressed={selected}
            data-selected={selected ? 'true' : 'false'}
            onClick={() => {
              const next = selected ? values.filter((value) => value !== option.id) : [...values, option.id]
              onValuesChange?.(next)
            }}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export interface XMd3eSheetProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  open?: boolean
  side?: 'bottom' | 'end'
  modal?: boolean
  title?: React.ReactNode
  description?: React.ReactNode
  close?: React.ReactNode
  onClose?: () => void
}

/** A portable modal/sheet surface with a small, host-neutral focus contract. */
export function XMd3eSheet({ open = true, side = 'bottom', modal = true, title, description, close, onClose, className = '', children, ...rest }: XMd3eSheetProps): React.ReactElement | null {
  const panelRef = React.useRef<HTMLElement>(null)
  const restoreFocusRef = React.useRef<HTMLElement | null>(null)
  const titleId = React.useId()
  const descriptionId = React.useId()

  React.useEffect(() => {
    if (!open || !modal || typeof document === 'undefined') return undefined
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const panel = panelRef.current
    const focusables = panel ? getFocusable(panel) : []
    const frame = window.requestAnimationFrame(() => (focusables[0] ?? panel)?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose?.()
        return
      }
      if (event.key !== 'Tab' || panel === null) return
      const current = getFocusable(panel)
      if (current.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const first = current[0]!
      const last = current[current.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      restoreFocusRef.current?.focus()
      restoreFocusRef.current = null
    }
  }, [modal, onClose, open])

  if (!open) return null
  return (
    <div className={`xaihi-md3e-sheet-root ${className}`.trim()} data-side={side} data-modal={modal ? 'true' : 'false'}>
      {modal && <button type="button" aria-label="Close" className="xaihi-md3e-sheet-backdrop" onClick={onClose} />}
      <section
        {...rest}
        ref={panelRef}
        role={modal ? 'dialog' : 'region'}
        aria-modal={modal ? true : undefined}
        aria-labelledby={title !== undefined ? titleId : undefined}
        aria-describedby={description !== undefined ? descriptionId : undefined}
        tabIndex={-1}
        className="xaihi-md3e-sheet"
      >
        {(title !== undefined || description !== undefined || close !== undefined || onClose !== undefined) && (
          <header className="xaihi-md3e-sheet-header">
            <div className="xaihi-md3e-sheet-copy">
              {title !== undefined && <h2 id={titleId}>{title}</h2>}
              {description !== undefined && <p id={descriptionId}>{description}</p>}
            </div>
            {onClose !== undefined && <button type="button" className="xaihi-md3e-sheet-close" aria-label="Close" onClick={onClose}>{close ?? '×'}</button>}
          </header>
        )}
        <div className="xaihi-md3e-sheet-body">{children}</div>
      </section>
    </div>
  )
}

export interface XMd3eCoverBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  kind?: 'unread' | 'favorite' | 'download' | 'status' | 'label'
  value?: React.ReactNode
  position?: 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'
  shape?: XMd3eShapeId
  tone?: XMd3eControlTone
  pulse?: boolean
}

/** An overlay badge for cover art and list thumbnails. */
export function XMd3eCoverBadge({ kind = 'label', value, position = 'top-end', shape = 'pill', tone = 'primary', pulse = false, className = '', children, style, ...rest }: XMd3eCoverBadgeProps): React.ReactElement {
  return <span {...rest} data-kind={kind} data-position={position} data-shape={shape} data-tone={tone} data-pulse={pulse ? 'true' : 'false'} className={`xaihi-md3e-cover-badge xaihi-md3e-shape ${className}`.trim()} style={{ ...getXMd3eShapeStyle(shape, 'idle'), ...style }}>{children ?? value}</span>
}

export interface XMd3eGestureBoardProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: readonly number[]
  onValueChange?: (value: number[]) => void
  disabled?: boolean
}

const GESTURE_POINTS = [
  { x: 16, y: 16 }, { x: 50, y: 16 }, { x: 84, y: 16 },
  { x: 16, y: 50 }, { x: 50, y: 50 }, { x: 84, y: 50 },
  { x: 16, y: 84 }, { x: 50, y: 84 }, { x: 84, y: 84 },
] as const

/** A nine-point gesture board with visible connections between selected points. */
export function XMd3eGestureBoard({ value = [], onValueChange, disabled = false, className = '', ...rest }: XMd3eGestureBoardProps): React.ReactElement {
  const [dragging, setDragging] = React.useState(false)
  const [activeIndex, setActiveIndex] = React.useState(0)
  const pointRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const select = (index: number) => {
    if (disabled || value.includes(index)) return
    onValueChange?.([...value, index])
  }
  const moveFocus = (index: number, key: string) => {
    const row = Math.floor(index / 3)
    const column = index % 3
    switch (key) {
      case 'ArrowLeft': return column > 0 ? index - 1 : index
      case 'ArrowRight': return column < 2 ? index + 1 : index
      case 'ArrowUp': return row > 0 ? index - 3 : index
      case 'ArrowDown': return row < 2 ? index + 3 : index
      case 'Home': return row * 3
      case 'End': return row * 3 + 2
      default: return index
    }
  }
  const handlePointKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      select(index)
      return
    }
    const nextIndex = moveFocus(index, event.key)
    if (nextIndex === index) return
    event.preventDefault()
    setActiveIndex(nextIndex)
    pointRefs.current[nextIndex]?.focus()
  }
  const path = value.filter((index) => GESTURE_POINTS[index] !== undefined).map((index) => {
    const point = GESTURE_POINTS[index]!
    return `${point.x},${point.y}`
  }).join(' ')
  return (
    <div {...rest} role="grid" aria-label={rest['aria-label'] ?? 'Gesture pattern'} data-disabled={disabled ? 'true' : 'false'} data-dragging={dragging ? 'true' : 'false'} className={`xaihi-md3e-gesture-board ${className}`.trim()} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
      <svg aria-hidden="true" className="xaihi-md3e-gesture-path" viewBox="0 0 100 100" preserveAspectRatio="none">
        {path.length > 0 && <polyline points={path} />}
      </svg>
      {Array.from({ length: 3 }, (_, row) => (
        <div key={row} role="row" className="xaihi-md3e-gesture-row">
          {Array.from({ length: 3 }, (_, column) => {
            const index = row * 3 + column
            return <button
              key={index}
              ref={(element) => { pointRefs.current[index] = element }}
              type="button"
              role="gridcell"
              aria-label={`Point ${index + 1}`}
              aria-pressed={value.includes(index)}
              aria-selected={value.includes(index)}
              tabIndex={!disabled && activeIndex === index ? 0 : -1}
              disabled={disabled}
              onFocus={() => setActiveIndex(index)}
              onPointerDown={() => { setActiveIndex(index); setDragging(true); select(index) }}
              onPointerEnter={() => { if (dragging) select(index) }}
              onKeyDown={(event) => handlePointKeyDown(event, index)}
            />
          })}
        </div>
      ))}
    </div>
  )
}

export interface XMd3eRayMenuItem {
  id: string
  label: React.ReactNode
  icon?: React.ReactNode
  disabled?: boolean
}

export interface XMd3eRayMenuProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'onSelect'> {
  open?: boolean
  items: readonly XMd3eRayMenuItem[]
  center?: React.ReactNode
  radius?: number
  onOpenChange?: (open: boolean) => void
  onSelect?: (id: string) => void
}

/** A radial action menu that stays keyboard reachable as a normal menu. */
export function XMd3eRayMenu({ open = false, items, center = 'Menu', radius = 72, onOpenChange, onSelect, className = '', ...rest }: XMd3eRayMenuProps): React.ReactElement {
  const menuId = React.useId()
  const centerRef = React.useRef<HTMLButtonElement>(null)
  const itemRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const focusItem = (from: number, direction: 1 | -1) => {
    if (items.length === 0) return
    for (let step = 1; step <= items.length; step += 1) {
      const index = (from + step * direction + items.length) % items.length
      if (!items[index]?.disabled) {
        itemRefs.current[index]?.focus()
        return
      }
    }
  }
  return (
    <div {...rest} data-open={open ? 'true' : 'false'} className={`xaihi-md3e-ray-menu ${className}`.trim()} style={{ '--xaihi-ray-radius': `${radius}px`, ...rest.style } as React.CSSProperties}>
      <button type="button" ref={centerRef} className="xaihi-md3e-ray-center" aria-expanded={open} aria-haspopup="menu" aria-controls={menuId} aria-label="Toggle menu" onClick={() => onOpenChange?.(!open)} onKeyDown={(event) => { if (open && event.key === 'ArrowDown') { event.preventDefault(); itemRefs.current.find((item) => item !== null)?.focus() } }}>
        {center}
      </button>
      <div id={menuId} role="menu" aria-hidden={!open} className="xaihi-md3e-ray-items">
        {items.map((item, index) => {
          const angle = items.length === 0 ? 0 : (index / items.length) * 360 - 90
          return <button key={item.id} ref={(element) => { itemRefs.current[index] = element }} type="button" role="menuitem" tabIndex={open && !item.disabled ? 0 : -1} disabled={!open || item.disabled} data-ray-angle={angle} style={{ '--xaihi-ray-angle': `${angle}deg` } as React.CSSProperties} onClick={() => onSelect?.(item.id)} onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); focusItem(index, 1) }
            else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); focusItem(index, -1) }
            else if (event.key === 'Home') { event.preventDefault(); itemRefs.current.find((itemRef, itemIndex) => itemRef !== null && !items[itemIndex]?.disabled)?.focus() }
            else if (event.key === 'End') { event.preventDefault(); [...itemRefs.current].reverse().find((itemRef, itemIndex) => itemRef !== null && !items[items.length - 1 - itemIndex]?.disabled)?.focus() }
            else if (event.key === 'Escape') { event.preventDefault(); onOpenChange?.(false); centerRef.current?.focus() }
          }}>{item.icon}<span>{item.label}</span></button>
        })}
      </div>
    </div>
  )
}

export interface XMd3eCollapsibleCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  value?: React.ReactNode
}

export function XMd3eCollapsibleCard({ title, open = true, onOpenChange, value, className = '', children, ...rest }: XMd3eCollapsibleCardProps): React.ReactElement {
  return (
    <section {...rest} data-open={open ? 'true' : 'false'} className={`xaihi-md3e-collapsible-card ${className}`.trim()}>
      <button type="button" aria-expanded={open} onClick={() => onOpenChange?.(!open)}><span>{title}</span>{value !== undefined && <XMd3eValueChip>{value}</XMd3eValueChip>}<span aria-hidden="true" className="xaihi-md3e-collapsible-chevron">⌄</span></button>
      {open && <div className="xaihi-md3e-collapsible-body">{children}</div>}
    </section>
  )
}

export interface XMd3eFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: React.ReactNode
  hint?: React.ReactNode
  valueBadge?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  invalid?: boolean
}

export function XMd3eField({ label, hint, valueBadge, leading, trailing, invalid = false, className = '', ...rest }: XMd3eFieldProps): React.ReactElement {
  return (
    <label className={`xaihi-md3e-field ${className}`.trim()} data-invalid={invalid ? 'true' : 'false'}>
      {(label !== undefined || valueBadge !== undefined) && <span className="xaihi-md3e-field-label"><span>{label}</span>{valueBadge !== undefined && <XMd3eChip tone="neutral">{valueBadge}</XMd3eChip>}</span>}
      <span className="xaihi-md3e-field-control">{leading}<input {...rest} />{trailing}</span>
      {hint !== undefined && <span className="xaihi-md3e-field-hint">{hint}</span>}
    </label>
  )
}

export interface XMd3eSearchBarProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  query: string
  onQueryChange?: (query: string) => void
  leading?: React.ReactNode
  trailing?: React.ReactNode
}

export function XMd3eSearchBar({ query, onQueryChange, leading, trailing, className = '', ...rest }: XMd3eSearchBarProps): React.ReactElement {
  return <div role="search" className={`xaihi-md3e-search-bar ${className}`.trim()}><span className="xaihi-md3e-search-leading">{leading}</span><input {...rest} value={query} onChange={(event) => onQueryChange?.(event.currentTarget.value)} /><span className="xaihi-md3e-search-trailing">{trailing}</span></div>
}

export interface XMd3eListItemProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  selected?: boolean
}

export function XMd3eListItem({ title, description, leading, trailing, selected = false, className = '', ...rest }: XMd3eListItemProps): React.ReactElement {
  return <button type="button" {...rest} aria-current={selected ? 'true' : undefined} data-selected={selected ? 'true' : 'false'} className={`xaihi-md3e-list-item ${className}`.trim()}><span className="xaihi-md3e-list-leading">{leading}</span><span className="xaihi-md3e-list-copy"><span className="xaihi-md3e-list-title">{title}</span>{description !== undefined && <span className="xaihi-md3e-list-description">{description}</span>}</span><span className="xaihi-md3e-list-trailing">{trailing}</span></button>
}

export interface XMd3eListProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  inset?: boolean
}

export function XMd3eList({ inset = false, className = '', children, ...rest }: XMd3eListProps): React.ReactElement {
  return <div {...rest} data-inset={inset ? 'true' : 'false'} className={`xaihi-md3e-list ${className}`.trim()}>{children}</div>
}

export interface XMd3eBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  kind?: 'dot' | 'disc' | 'label'
  value?: React.ReactNode
  max?: number
}

export function XMd3eBadge({ kind = 'label', value, max = 99, className = '', children, ...rest }: XMd3eBadgeProps): React.ReactElement {
  const numeric = typeof value === 'number' && value > max ? `${max}+` : value
  return <span {...rest} data-kind={kind} className={`xaihi-md3e-badge-count ${className}`.trim()}>{kind === 'dot' ? null : children ?? numeric}</span>
}

export interface XMd3eProgressRingProps extends React.SVGAttributes<SVGSVGElement> {
  value?: number
  size?: number
  thickness?: number
  indeterminate?: boolean
}

export function XMd3eProgressRing({ value = 0, size = 48, thickness = 5, indeterminate = false, className = '', ...rest }: XMd3eProgressRingProps): React.ReactElement {
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, value))
  return <svg {...rest} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={indeterminate ? undefined : clamped} viewBox={`0 0 ${size} ${size}`} width={size} height={size} data-indeterminate={indeterminate ? 'true' : 'false'} className={`xaihi-md3e-progress-ring ${className}`.trim()}><circle className="xaihi-md3e-progress-ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={thickness} /><circle className="xaihi-md3e-progress-ring-value" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={thickness} strokeDasharray={circumference} strokeDashoffset={indeterminate ? circumference * .72 : circumference * (1 - clamped / 100)} /></svg>
}

export interface XMd3eTabsProps extends React.HTMLAttributes<HTMLDivElement> {
  items: readonly { id: string; label: React.ReactNode; disabled?: boolean }[]
  value: string
  onValueChange?: (value: string) => void
}

export function XMd3eTabs({ items, value, onValueChange, className = '', ...rest }: XMd3eTabsProps): React.ReactElement {
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = items.findIndex((item) => item.id === value)
  const firstEnabledIndex = items.findIndex((item) => !item.disabled)
  const tabStopIndex = selectedIndex >= 0 && !items[selectedIndex]?.disabled ? selectedIndex : firstEnabledIndex

  const focusTab = (index: number) => {
    const item = items[index]
    if (item === undefined || item.disabled) return
    onValueChange?.(item.id)
    tabRefs.current[index]?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index
    if (event.key === 'Home') nextIndex = firstEnabledIndex
    else if (event.key === 'End') {
      nextIndex = items.findIndex((item, itemIndex) => !item.disabled && items.slice(itemIndex + 1).every((nextItem) => nextItem.disabled))
    }
    else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const direction = event.key === 'ArrowRight' ? 1 : -1
      for (let step = 1; step <= items.length; step += 1) {
        const candidate = (index + step * direction + items.length) % items.length
        if (!items[candidate]?.disabled) {
          nextIndex = candidate
          break
        }
      }
    } else return

    if (nextIndex < 0 || nextIndex === index) return
    event.preventDefault()
    focusTab(nextIndex)
  }

  return (
    <div {...rest} role="tablist" aria-orientation="horizontal" className={`xaihi-md3e-tabs ${className}`.trim()}>
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(element) => { tabRefs.current[index] = element }}
          type="button"
          role="tab"
          aria-selected={item.id === value}
          data-active={item.id === value ? 'true' : 'false'}
          tabIndex={index === tabStopIndex ? 0 : -1}
          disabled={item.disabled}
          onClick={() => onValueChange?.(item.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export interface XMd3eBreadcrumbProps extends Omit<React.HTMLAttributes<HTMLElement>, 'onSelect'> {
  items: readonly { id: string; label: React.ReactNode }[]
  onSelect?: (id: string) => void
}

export function XMd3eBreadcrumb({ items, onSelect, className = '', ...rest }: XMd3eBreadcrumbProps): React.ReactElement {
  return <nav {...rest} aria-label="Breadcrumb" className={`xaihi-md3e-breadcrumb ${className}`.trim()}>{items.map((item, index) => <React.Fragment key={item.id}>{index > 0 && <span aria-hidden="true">/</span>}<button type="button" onClick={() => onSelect?.(item.id)}>{item.label}</button></React.Fragment>)}</nav>
}
