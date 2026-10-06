/**
 * 组件库的唯一颜色出口：一律 `var(--xaihi-*, var(--dsw-alias-*))`。
 *
 * 为什么钉这一条：主题属于 Core Theme Service（Material You 桥只叠 `--xaihi-*` 一层），
 * 组件里出现字面量 hex 或 `--dsw-*` 以外的值，就会在宿主换主题/换 seed 时分成两套。
 * 所以 hex 只出现在 `ALIAS` 的**兜底**位置，而且由测试守住（见 tests/tokens.spec.ts）。
 *
 * @module xaihi-ui-kit/tokens
 */

/** 组件能用的语义槽，就这几个：再多就得先想清楚它属于谁。 */
export const ALIAS = {
  surface: 'var(--xaihi-surface, var(--dsw-alias-bg-layer-1, transparent))',
  onSurface: 'var(--xaihi-on-surface, var(--dsw-alias-label-primary, inherit))',
  onSurfaceVariant: 'var(--xaihi-on-surface-variant, var(--dsw-alias-label-secondary, inherit))',
  outline: 'var(--xaihi-outline, var(--dsw-alias-border-l2, currentColor))',
  primary: 'var(--xaihi-primary, var(--dsw-alias-label-primary, currentColor))',
  onPrimary: 'var(--xaihi-on-primary, var(--dsw-alias-label-primary-inverted, #fff))',
  secondaryContainer: 'var(--xaihi-secondary-container, var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.16)))',
  onSecondaryContainer: 'var(--xaihi-on-secondary-container, var(--dsw-alias-label-primary, inherit))',
  error: 'var(--xaihi-error, var(--dsw-alias-state-error-primary, #b3261e))',
} as const

/** 形状刻度（M3 shape scale 的转译）：像素而不是 rem，面板要能塞进窄栏。 */
export const SHAPE = { cornerXS: 4, cornerS: 8, cornerM: 12 } as const

/** 间距刻度（M3 spacing 的常用四档）。 */
export const SPACE = { xs: 4, s: 8, m: 12, l: 16 } as const

/** 一次注入的组件样式；id 保证多个 remote 各带一份副本时也只生效一次。 */
export const STYLE_TAG_ID = 'xaihi-ui-kit'

export const KIT_CSS = `
.xaihi-card { display: grid; gap: ${SPACE.s}px; padding: ${SPACE.m}px; border: 0.5px solid ${ALIAS.outline}; border-radius: ${SHAPE.cornerM}px; background: ${ALIAS.surface}; color: ${ALIAS.onSurface}; font-size: 13px; }
.xaihi-btn { display: inline-flex; align-items: center; gap: ${SPACE.xs}px; padding: 6px ${SPACE.m}px; border: 0; border-radius: ${SHAPE.cornerXS}px; font: inherit; cursor: pointer; }
.xaihi-btn[data-variant="filled"] { background: ${ALIAS.primary}; color: ${ALIAS.onPrimary}; }
.xaihi-btn[data-variant="tonal"] { background: ${ALIAS.secondaryContainer}; color: ${ALIAS.onSecondaryContainer}; }
.xaihi-btn[data-variant="text"] { background: transparent; color: ${ALIAS.primary}; }
.xaihi-btn[disabled] { opacity: .38; cursor: default; }
.xaihi-field { display: grid; gap: ${SPACE.xs}px; }
.xaihi-field-label { font-size: 12px; color: ${ALIAS.onSurfaceVariant}; }
.xaihi-field-input { padding: 6px ${SPACE.s}px; border: 0.5px solid ${ALIAS.outline}; border-radius: ${SHAPE.cornerXS}px; background: transparent; color: inherit; font: inherit; }
.xaihi-status { font-size: 12px; color: ${ALIAS.onSurfaceVariant}; }
.xaihi-status[data-tone="error"] { color: ${ALIAS.error}; }
`
