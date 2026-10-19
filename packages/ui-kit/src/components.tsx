/**
 * 节点面板的共用形状。
 *
 * 每个节点自己带一份（打包期内联）是**有意的**：MF2 下不共享组件实例才能保持
 * "一个包就是一个 bundle"的约束（ADR-0002）。共享的是 `--xaihi-*` 这一层 token，
 * 所以上面这份 CSS 用 id 去重，多个 remote 同时挂载也只有一份规则。
 *
 * @module xaihi-ui-kit/components
 */

import * as React from 'react'
import { KIT_CSS, STYLE_TAG_ID } from './tokens.ts'

/** 按钮变体：对应 M3 的 filled / tonal / text 三档。 */
export type XKVariant = 'filled' | 'tonal' | 'text'

export interface XKButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: XKVariant
  shape?: 'rounded' | 'pill' | 'expressive'
  size?: 'sm' | 'md' | 'lg'
}

export function XButton({ variant = 'filled', shape = 'rounded', size = 'md', children, ...rest }: XKButtonProps): React.ReactElement {
  return (
    <button type="button" className="xaihi-btn" data-variant={variant} data-shape={shape} data-size={size} {...rest}>
      {children}
    </button>
  )
}

/** 一个字段：标签、控件、说明三段，缺说明就少一行空隙而不是留空节点。 */
export interface XFieldProps {
  label: string
  hint?: string
  children: React.ReactNode
}

export function XField({ label, hint, children }: XFieldProps): React.ReactElement {
  return (
    <label className="xaihi-field">
      <span className="xaihi-field-label">{label}</span>
      {children}
      {hint !== undefined && <span className="xaihi-status">{hint}</span>}
    </label>
  )
}

/** 面板骨架：标题、动作行、正文、状态行。四个面板共用这一个形状，避免各写一套。 */
export interface XPanelProps {
  title: string
  actions?: React.ReactNode
  status?: string
  statusTone?: 'info' | 'error'
  /** 可以没有正文：只有动作行与状态行的面板是合法形状，不是待填。 */
  children?: React.ReactNode
}

export function XPanel({ title, actions, status, statusTone = 'info', children }: XPanelProps): React.ReactElement {
  return (
    <div className="xaihi-card">
      <strong>{title}</strong>
      {actions !== undefined && <div className="xaihi-card-actions">{actions}</div>}
      {children}
      {status !== undefined && <span className="xaihi-status" data-tone={statusTone}>{status}</span>}
    </div>
  )
}

/** 注入组件样式；返回 disposer 交给调用方回收。 */
export function registerKitStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  let tag = document.getElementById(STYLE_TAG_ID) as HTMLStyleElement | null
  if (tag === null) {
    tag = document.createElement('style')
    tag.id = STYLE_TAG_ID
    tag.textContent = KIT_CSS
    document.head.append(tag)
  }
  const users = Number(tag.dataset.xaihiUiKitUsers)
  tag.dataset.xaihiUiKitUsers = String(Number.isFinite(users) && users > 0 ? users + 1 : 1)
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    if (!tag?.isConnected || document.getElementById(STYLE_TAG_ID) !== tag) return
    const activeUsers = Number(tag.dataset.xaihiUiKitUsers)
    if (!Number.isFinite(activeUsers) || activeUsers <= 1) {
      delete tag.dataset.xaihiUiKitUsers
      tag.remove()
      return
    }
    tag.dataset.xaihiUiKitUsers = String(activeUsers - 1)
  }
}

export interface XMd3eThemeProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Semantic tokens supplied by the host or by an independent application. */
  tokens?: React.CSSProperties & Record<`--${string}`, string | number>
  children?: React.ReactNode
}

/**
 * Token boundary for standalone consumers. The kit supplies geometry and
 * interaction only; the caller remains the owner of color and typography.
 */
export function XMd3eTheme({ tokens, style, className = '', children, ...rest }: XMd3eThemeProps): React.ReactElement {
  React.useEffect(() => registerKitStyles(), [])
  return <div data-xaihi-md3e-theme="true" className={`xaihi-md3e-shell ${className}`.trim()} style={{ ...tokens, ...style }} {...rest}>{children}</div>
}

export type XMd3eTone = 'primary' | 'secondary' | 'tertiary' | 'neutral'
export type XMd3eBadgeShape = 'circle' | 'rounded' | 'clover' | 'sunny' | 'gem' | 'arch' | 'pebble'

export interface XMd3eSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

/** A host-neutral expressive surface with the Rossi asymmetric corner language. */
export function XMd3eSurface({ className = '', children, ...rest }: XMd3eSurfaceProps): React.ReactElement {
  return <div className={`xaihi-md3e-surface ${className}`.trim()} {...rest}>{children}</div>
}

export interface XMd3eHeroBannerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  badge?: React.ReactNode
  tone?: XMd3eTone
  children?: React.ReactNode
}

export function XMd3eHeroBanner({ title, description, meta, badge, tone = 'primary', children, className = '', ...rest }: XMd3eHeroBannerProps): React.ReactElement {
  return (
    <div className={`xaihi-md3e-hero ${className}`.trim()} data-tone={tone} {...rest}>
      <div style={{ display: 'flex', minWidth: 0, alignItems: 'start', gap: 10 }}>
        {badge}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="xaihi-md3e-hero-title">{title}</div>
          {description !== undefined && <div className="xaihi-md3e-hero-description">{description}</div>}
        </div>
      </div>
      {meta !== undefined && <div className="xaihi-md3e-hero-meta">{meta}</div>}
      {children}
    </div>
  )
}

export function XMd3eShapeBadge({ shape = 'rounded', size = 'md', active = false, children, className = '', ...rest }: {
  shape?: XMd3eBadgeShape
  size?: 'sm' | 'md' | 'lg'
  active?: boolean
  children?: React.ReactNode
} & React.HTMLAttributes<HTMLSpanElement>): React.ReactElement {
  return <span className={`xaihi-md3e-badge ${className}`.trim()} data-shape={shape} data-size={size} data-active={active ? 'true' : 'false'} {...rest}>{children}</span>
}

export function XMd3ePatch({ children, className = '', ...rest }: XMd3eSurfaceProps): React.ReactElement {
  return <div className={`xaihi-md3e-patch ${className}`.trim()} {...rest}>{children}</div>
}

export function XMd3eSection({ title, description, actions, children, className = '', ...rest }: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>): React.ReactElement {
  return (
    <section className={`xaihi-md3e-section ${className}`.trim()} {...rest}>
      {(title !== undefined || description !== undefined || actions !== undefined) && (
        <div className="xaihi-md3e-section-header">
          <div style={{ minWidth: 0, flex: 1 }}>
            {title !== undefined && <div className="xaihi-md3e-section-title">{title}</div>}
            {description !== undefined && <div className="xaihi-md3e-section-description">{description}</div>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  )
}

export function XMd3eActionGroup({ orientation = 'horizontal', children, className = '', ...rest }: {
  orientation?: 'horizontal' | 'vertical'
  children?: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={`xaihi-md3e-action-group ${className}`.trim()} data-orientation={orientation} {...rest}>{children}</div>
}

export function XMd3eToggleTile({ checked = false, title, description, leading, trailing, children, className = '', ...rest }: {
  checked?: boolean
  title: React.ReactNode
  description?: React.ReactNode
  leading?: React.ReactNode
  trailing?: React.ReactNode
  children?: React.ReactNode
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  return (
    <button className={`xaihi-md3e-toggle-tile ${className}`.trim()} data-checked={checked ? 'true' : 'false'} {...rest}>
      {leading}
      <span className="xaihi-md3e-tile-copy"><span className="xaihi-md3e-tile-title">{title}</span>{description !== undefined && <span className="xaihi-md3e-tile-description">{description}</span>}</span>
      {trailing}
      {children}
    </button>
  )
}

export function XMd3eOptionCard({ selected = false, title, description, leading, children, className = '', ...rest }: {
  selected?: boolean
  title: React.ReactNode
  description?: React.ReactNode
  leading?: React.ReactNode
  children?: React.ReactNode
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>): React.ReactElement {
  return (
    <button className={`xaihi-md3e-option-card ${className}`.trim()} data-selected={selected ? 'true' : 'false'} {...rest}>
      {leading}
      <span className="xaihi-md3e-tile-copy"><span className="xaihi-md3e-tile-title">{title}</span>{description !== undefined && <span className="xaihi-md3e-tile-description">{description}</span>}</span>
      {children}
    </button>
  )
}

export function XMd3eSegmentedTrack({ options, value, onChange, className = '', ...rest }: {
  options: readonly { value: string; label: React.ReactNode; disabled?: boolean }[]
  value: string
  onChange: (value: string) => void
  className?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'role'>): React.ReactElement {
  const optionRefs = React.useRef<Array<HTMLButtonElement | null>>([])
  const selectedIndex = options.findIndex((option) => option.value === value)
  const firstEnabledIndex = options.findIndex((option) => !option.disabled)
  const tabStopIndex = selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : firstEnabledIndex

  const activate = (index: number) => {
    const option = options[index]
    if (option === undefined || option.disabled) return
    onChange(option.value)
    optionRefs.current[index]?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex = index
    if (event.key === 'Home') nextIndex = firstEnabledIndex
    else if (event.key === 'End') {
      nextIndex = options.findIndex((option, optionIndex) => !option.disabled && options.slice(optionIndex + 1).every((nextOption) => nextOption.disabled))
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      const direction = event.key === 'ArrowRight' ? 1 : -1
      for (let step = 1; step <= options.length; step += 1) {
        const candidate = (index + step * direction + options.length) % options.length
        if (!options[candidate]?.disabled) {
          nextIndex = candidate
          break
        }
      }
    } else return

    if (nextIndex < 0 || nextIndex === index) return
    event.preventDefault()
    activate(nextIndex)
  }

  return (
    <div role="radiogroup" aria-orientation="horizontal" className={`xaihi-md3e-segmented ${className}`.trim()} {...rest}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => { optionRefs.current[index] = element }}
          type="button"
          role="radio"
          className="xaihi-md3e-segment"
          data-active={option.value === value ? 'true' : 'false'}
          aria-checked={option.value === value}
          tabIndex={index === tabStopIndex ? 0 : -1}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function XMd3eSliderCard({ label, value, min = 0, max = 100, step = 1, onChange, ticks, thickness = 24, wavy = false, className = '', ...rest }: {
  label: React.ReactNode
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
  ticks?: readonly React.ReactNode[]
  thickness?: 16 | 24 | 40
  wavy?: boolean
  className?: string
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'>): React.ReactElement {
  const percent = max === min ? 0 : Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
  return (
    <div className={`xaihi-md3e-slider xaihi-md3e-slider-card ${className}`.trim()} data-thickness={thickness} data-wavy={wavy ? 'true' : 'false'} style={{ '--xaihi-slider-progress': `${percent}%` } as React.CSSProperties} {...rest}>
      <div className="xaihi-md3e-slider-header"><span>{label}</span><span className="xaihi-md3e-value-chip">{value}</span></div>
      <div className="xaihi-md3e-slider-rail"><input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.currentTarget.value))} aria-label={typeof label === 'string' ? label : undefined} /></div>
      {ticks && <div className="xaihi-md3e-slider-ticks">{ticks.map((tick, index) => <span key={index} data-active={typeof tick === 'number' && tick <= value ? 'true' : 'false'}>{tick}</span>)}</div>}
    </div>
  )
}

export function XMd3eStatTile({ value, label, className = '', ...rest }: {
  value: React.ReactNode
  label: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={`xaihi-md3e-stat ${className}`.trim()} {...rest}><span className="xaihi-md3e-stat-value">{value}</span><span className="xaihi-md3e-stat-label">{label}</span></div>
}

export function XMd3eFactRow({ label, value, className = '', ...rest }: {
  label: React.ReactNode
  value: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={`xaihi-md3e-fact ${className}`.trim()} {...rest}><span>{label}</span><span className="xaihi-md3e-fact-value">{value}</span></div>
}

export function XMd3eMorphingIndicator({ label, className = '', ...rest }: { label?: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} {...rest}><span className="xaihi-md3e-morphing" aria-hidden="true"><span /><span /><span /></span>{label !== undefined && <span>{label}</span>}</div>
}
