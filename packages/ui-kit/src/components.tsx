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
}

export function XButton({ variant = 'filled', children, ...rest }: XKButtonProps): React.ReactElement {
  return (
    <button type="button" className="xaihi-btn" data-variant={variant} {...rest}>
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
  children: React.ReactNode
}

export function XPanel({ title, actions, status, statusTone = 'info', children }: XPanelProps): React.ReactElement {
  return (
    <div className="xaihi-card" style={{ margin: 12 }}>
      <strong>{title}</strong>
      {actions !== undefined && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{actions}</div>}
      {children}
      {status !== undefined && <span className="xaihi-status" data-tone={statusTone}>{status}</span>}
    </div>
  )
}

/** 注入组件样式；返回 disposer 交给调用方回收。 */
export function registerKitStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById(STYLE_TAG_ID) !== null) return () => {}
  const tag = document.createElement('style')
  tag.id = STYLE_TAG_ID
  tag.textContent = KIT_CSS
  document.head.append(tag)
  return () => { tag.remove() }
}
