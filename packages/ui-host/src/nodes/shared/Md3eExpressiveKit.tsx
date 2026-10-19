import React, { type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NodeSurface } from "./useNodeSurface"
import {
  Md3eNodeSurface,
  Md3ePatchBackdrop,
  Md3eShapeBadge,
  Md3eShapePopoverButton,
  Md3eStatusPill,
  Md3eWavyProgress,
  type Md3eBentoStatItem,
} from "./controls"

export interface Md3eStageLensItem<T extends string = string> {
  id: T
  label: string
  badge?: string | number
  icon?: LucideIcon
}

/**
 * MD3E 连体胶囊镜头切换器（Connected Pill Lens Switcher）
 * 选中项形变为完整胶囊（rounded-full + primary-container），未选中项保持连体圆角（rounded-[12px]），
 * 点击瞬间触发 MD3E 弹簧形变过渡。
 */
export function Md3eStageLensBar<T extends string = string>({
  items,
  value,
  onChange,
  ariaLabel = "MD3E 视图镜头",
  className,
}: {
  items: readonly Md3eStageLensItem<T>[]
  value: T
  onChange: (next: T) => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-slot="md3e-stage-lens-bar"
      className={cn(
        "inline-flex min-w-0 max-w-full flex-wrap items-center gap-1 rounded-[24px] bg-[var(--md3e-surface-lowest,var(--muted))] p-1",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value
        const Icon = item.icon
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            data-state={active ? "active" : "inactive"}
            onClick={() => onChange(item.id)}
            style={{
              transition: "border-radius 260ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 180ms ease, transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 px-3 py-1.5 text-[11px] leading-none select-none active:scale-[0.97]",
              active
                ? "rounded-full bg-[var(--md3e-primary,var(--primary))] font-black text-[var(--md3e-on-primary,var(--primary-foreground))] shadow-xs"
                : "rounded-[12px] bg-[var(--md3e-surface-high,var(--card))] font-semibold text-muted-foreground hover:rounded-[18px] hover:bg-[var(--md3e-surface-highest,var(--accent))] hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
            <span className="truncate">{item.label}</span>
            {item.badge !== undefined ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-none tabular-nums",
                  active
                    ? "bg-black/20 text-[var(--md3e-on-primary,var(--primary-foreground))]"
                    : "bg-[var(--md3e-surface-lowest,var(--muted))] text-foreground/80",
                )}
              >
                {item.badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * MD3E 形态芯片组（Choice Chip Group）—— 用零边框色阶胶囊替代传统下拉或单调复选框。
 */
export function Md3eChoiceChips<T extends string = string>({
  options,
  value,
  onChange,
  disabled,
  ariaLabel,
  className,
}: {
  options: readonly { value: T; label: string; hint?: string; icon?: LucideIcon }[]
  value: T
  onChange: (next: T) => void
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="md3e-choice-chips"
      className={cn(
        "flex flex-wrap items-center gap-1 rounded-[20px] bg-[var(--md3e-surface-lowest,var(--muted))] p-1",
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
            style={{
              transition: "border-radius 240ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 160ms ease",
            }}
            className={cn(
              "inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2.5 py-1.5 text-[11px] leading-tight disabled:opacity-50",
              selected
                ? "rounded-full bg-[var(--md3e-secondary-container,var(--secondary))] font-black text-[var(--md3e-on-secondary-container,var(--secondary-foreground))] shadow-2xs"
                : "rounded-[12px] bg-[var(--md3e-surface-high,var(--card))] font-medium text-muted-foreground hover:rounded-[18px] hover:text-foreground",
            )}
          >
            {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
            <span className="truncate">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * MD3E 多选形态芯片组（Multi-Choice Toggle Chips）
 */
export function Md3eMultiChoiceChips<T extends string = string>({
  options,
  values,
  onToggle,
  disabled,
  ariaLabel,
  className,
}: {
  options: readonly { value: T; label: string; sublabel?: string }[]
  values: readonly T[]
  onToggle: (item: T) => void
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      data-slot="md3e-multi-choice-chips"
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {options.map((opt) => {
        const active = values.includes(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            aria-label={opt.label}
            aria-pressed={active}
            onClick={() => onToggle(opt.value)}
            style={{
              transition: "border-radius 240ms cubic-bezier(0.34, 1.56, 0.64, 1), background-color 160ms ease",
            }}
            className={cn(
              "inline-flex min-w-0 items-center gap-1.5 px-3 py-1.5 text-[11px] leading-tight disabled:opacity-50",
              active
                ? "rounded-full bg-[var(--md3e-primary-container,var(--primary))] font-extrabold text-[var(--md3e-on-primary-container,var(--primary-foreground))]"
                : "rounded-[14px] bg-[var(--md3e-surface-high,var(--muted))] font-medium text-muted-foreground hover:rounded-[20px] hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "size-2 shrink-0 rounded-full transition-transform",
                active ? "scale-110 bg-current" : "bg-muted-foreground/40",
              )}
            />
            <span className="truncate">{opt.label}</span>
            {opt.sublabel ? (
              <span className="truncate text-[10px] opacity-75">{opt.sublabel}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/**
 * MD3E 表现力英雄横幅（Expressive Hero Deck）
 * 集成了几何剪影 PatchBackdrop、动态角色形状徽章、状态胶囊、形状策略弹窗入口、Bento 遥测芯片与波浪进度轨。
 */
export function Md3eExpressiveHero({
  icon,
  title,
  subtitle,
  domainTag,
  statusLabel,
  statusTone = "neutral",
  progress,
  running,
  stats,
  actions,
  toolbarTestId,
  className,
}: {
  icon: LucideIcon
  title: string
  subtitle?: string
  domainTag?: string
  statusLabel?: string
  statusTone?: "neutral" | "primary" | "secondary" | "tertiary" | "danger"
  progress?: number
  running?: boolean
  stats?: readonly Md3eBentoStatItem[]
  actions?: ReactNode
  toolbarTestId?: string
  className?: string
}) {
  return (
    <header
      data-slot="md3e-expressive-hero"
      className={cn(
        "relative shrink-0 overflow-hidden rounded-[26px_18px_26px_16px] bg-[var(--md3e-surface-high,var(--card))] px-3.5 py-2.5",
        className,
      )}
    >
      <Md3ePatchBackdrop tone="primary" />
      <div className="relative z-10 flex min-w-0 max-w-full flex-wrap items-center justify-between gap-2 overflow-hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <Md3eShapeBadge icon={icon} tone="primary" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="truncate text-sm font-black tracking-tight text-foreground">
                {title}
              </h2>
              {domainTag ? (
                <span className="rounded-full bg-[var(--md3e-tertiary-container,var(--accent))] px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase text-[var(--md3e-on-tertiary-container,var(--accent-foreground))]">
                  {domainTag}
                </span>
              ) : null}
              {statusLabel ? (
                <Md3eStatusPill tone={statusTone}>{statusLabel}</Md3eStatusPill>
              ) : null}
            </div>
            {subtitle ? (
              <p
                data-adaptive-hide="short"
                className="mt-0.5 truncate text-[11px] text-muted-foreground"
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        <div
          data-testid={toolbarTestId}
          data-slot="md3e-hero-actions"
          className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-1.5"
        >
          {actions}
          <Md3eShapePopoverButton />
        </div>
      </div>

      {stats && stats.length > 0 ? (
        <div
          data-slot="md3e-hero-telemetry"
          className="relative z-10 mt-2 flex flex-wrap items-center gap-1.5"
        >
          {stats.map((st) => {
            const toneBg =
              st.tone === "primary"
                ? "bg-[var(--md3e-primary-container,var(--primary))]/85 text-[var(--md3e-on-primary-container,var(--primary-foreground))]"
                : st.tone === "secondary"
                  ? "bg-[var(--md3e-secondary-container,var(--secondary))]/85 text-[var(--md3e-on-secondary-container,var(--secondary-foreground))]"
                  : st.tone === "tertiary"
                    ? "bg-[var(--md3e-tertiary-container,var(--accent))]/85 text-[var(--md3e-on-tertiary-container,var(--accent-foreground))]"
                    : st.tone === "danger"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-[var(--md3e-surface-lowest,var(--muted))] text-foreground"
            return (
              <div
                key={st.label}
                className={cn(
                  "inline-flex min-w-0 items-baseline gap-1.5 rounded-[14px_18px_14px_16px] px-2.5 py-1 text-[11px]",
                  toneBg,
                )}
              >
                <span className="truncate text-[10px] font-semibold opacity-75">
                  {st.label}
                </span>
                <span className="font-mono text-xs font-black tabular-nums">
                  {st.value}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}

      {(running || (typeof progress === "number" && progress > 0)) ? (
        <div className="relative z-10 mt-2">
          <Md3eWavyProgress value={progress ?? (running ? 45 : 0)} running={running} />
        </div>
      ) : null}
    </header>
  )
}

/**
 * MD3E 折叠胶囊态（Collapsed Capsule Surface）
 * 当容器处于极窄/极矮模式时，呈现一颗高表现力的非对称胶囊条。
 */
export function Md3eCollapsedCapsule({
  nodeId,
  surface,
  testId,
  collapsedTestId,
  icon,
  title,
  badgeText,
  statusText,
  progress,
  running,
  action,
}: {
  nodeId: string
  surface: NodeSurface
  testId?: string
  collapsedTestId?: string
  icon: LucideIcon
  title: string
  badgeText?: string
  statusText?: string
  progress?: number
  running?: boolean
  action?: ReactNode
}) {
  return (
    <Md3eNodeSurface
      nodeId={nodeId}
      surface={surface}
      data-testid={testId}
      data-ui-variant="md3e"
      className="h-full w-full p-2"
    >
      <div
        data-testid={collapsedTestId}
        className="relative flex h-full w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-[26px_18px_26px_18px] bg-[var(--md3e-surface-high,var(--card))] px-3 py-2"
      >
        <Md3ePatchBackdrop tone="primary" />
        <div className="relative z-10 flex min-w-0 items-center gap-2">
          <Md3eShapeBadge icon={icon} tone="primary" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-black tracking-tight">{title}</span>
              {badgeText ? (
                <Md3eStatusPill tone="secondary">{badgeText}</Md3eStatusPill>
              ) : null}
            </div>
            {statusText ? (
              <div className="truncate text-[10px] text-muted-foreground">{statusText}</div>
            ) : null}
          </div>
        </div>
        <div className="relative z-10 flex min-w-0 max-w-full shrink-0 items-center gap-1.5 overflow-hidden">
          {action}
        </div>
      </div>
    </Md3eNodeSurface>
  )
}

/**
 * MD3E 底部悬浮指令坞（Command Dock）
 */
export function Md3eCommandDock({
  leading,
  trailing,
  testId,
  className,
}: {
  leading?: ReactNode
  trailing?: ReactNode
  testId?: string
  className?: string
}) {
  return (
    <div
      data-slot="md3e-command-dock"
      data-testid={testId}
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-[26px_20px_26px_20px] bg-[var(--md3e-surface-high,var(--card))] px-3 py-2",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{leading}</div>
      <div className="flex min-w-0 max-w-full flex-1 flex-wrap items-center justify-end gap-1.5 overflow-hidden">{trailing}</div>
    </div>
  )
}

/**
 * MD3E 零边框色阶卡片（Tonal Surface Zone）
 */
export function Md3eTonalZone({
  title,
  eyebrow,
  badge,
  tone = "default",
  actions,
  children,
  className,
  bodyClassName,
  testId,
}: {
  title?: ReactNode
  eyebrow?: ReactNode
  badge?: ReactNode
  tone?: "default" | "primary" | "secondary" | "tertiary" | "low"
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  testId?: string
}) {
  const toneStyles =
    tone === "primary"
      ? "bg-[var(--md3e-primary-container,var(--card))]/35 rounded-[26px_18px_24px_20px]"
      : tone === "secondary"
        ? "bg-[var(--md3e-secondary-container,var(--card))]/40 rounded-[20px_26px_18px_24px]"
        : tone === "tertiary"
          ? "bg-[var(--md3e-tertiary-container,var(--card))]/35 rounded-[24px_20px_26px_16px]"
          : tone === "low"
            ? "bg-[var(--md3e-surface-lowest,var(--muted))]/80 rounded-[22px]"
            : "bg-[var(--md3e-surface-high,var(--card))] rounded-[24px_18px_24px_18px]"

  return (
    <section
      data-slot="md3e-tonal-zone"
      data-testid={testId}
      className={cn(
        "flex min-h-0 min-w-0 flex-col p-3 transition-all duration-200",
        toneStyles,
        className,
      )}
    >
      {(title || eyebrow || badge || actions) ? (
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {eyebrow ? (
              <div className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground">
                {eyebrow}
              </div>
            ) : null}
            {title ? (
              <div className="flex items-center gap-1.5 text-xs font-extrabold tracking-tight text-foreground">
                <span className="truncate">{title}</span>
                {badge}
              </div>
            ) : null}
          </div>
          {actions ? <div className="flex min-w-0 max-w-full shrink-0 flex-wrap items-center justify-end gap-1 overflow-hidden">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn("min-h-0 min-w-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  )
}
