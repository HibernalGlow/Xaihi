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

/**
 * Expressive roles. Consumers only need to provide these aliases; the package
 * never owns a palette and therefore remains usable outside the Xaihi host.
 */
export const MD3E_ALIAS = {
  surface: 'var(--xaihi-md3e-surface, var(--md3e-surface, var(--md-sys-color-surface-container, var(--xaihi-surface, var(--dsw-alias-bg-layer-1, transparent)))))',
  surfaceLowest: 'var(--xaihi-md3e-surface-lowest, var(--md3e-surface-lowest, var(--md-sys-color-surface-container-lowest, var(--xaihi-surface, var(--dsw-alias-bg-layer-1, transparent)))))',
  surfaceLow: 'var(--xaihi-md3e-surface-low, var(--md3e-surface-low, var(--md-sys-color-surface-container-low, var(--xaihi-surface, var(--dsw-alias-bg-layer-2, transparent)))))',
  surfaceHigh: 'var(--xaihi-md3e-surface-high, var(--md3e-surface-high, var(--md-sys-color-surface-container-high, var(--xaihi-surface, var(--dsw-alias-bg-layer-3, transparent)))))',
  primary: 'var(--xaihi-md3e-primary, var(--md3e-primary, var(--md-sys-color-primary, var(--xaihi-primary, var(--dsw-alias-label-primary, currentColor)))))',
  onPrimary: 'var(--xaihi-md3e-on-primary, var(--md3e-on-primary, var(--md-sys-color-on-primary, var(--xaihi-on-primary, var(--dsw-alias-label-primary-inverted, currentColor)))))',
  primaryContainer: 'var(--xaihi-md3e-primary-container, var(--md3e-primary-container, var(--md-sys-color-primary-container, color-mix(in srgb, var(--xaihi-primary, var(--dsw-alias-label-primary, currentColor)) 24%, var(--xaihi-surface, var(--dsw-alias-bg-layer-1, transparent))))))',
  onPrimaryContainer: 'var(--xaihi-md3e-on-primary-container, var(--md3e-on-primary-container, var(--md-sys-color-on-primary-container, var(--xaihi-on-surface, var(--dsw-alias-label-primary, currentColor)))))',
  secondaryContainer: 'var(--xaihi-md3e-secondary-container, var(--md3e-secondary-container, var(--md-sys-color-secondary-container, var(--xaihi-secondary-container, var(--dsw-alias-interactive-bg-hover, transparent)))))',
  onSecondaryContainer: 'var(--xaihi-md3e-on-secondary-container, var(--md3e-on-secondary-container, var(--md-sys-color-on-secondary-container, var(--xaihi-on-secondary-container, var(--dsw-alias-label-primary, currentColor)))))',
  tertiaryContainer: 'var(--xaihi-md3e-tertiary-container, var(--md3e-tertiary-container, var(--md-sys-color-tertiary-container, color-mix(in srgb, var(--xaihi-secondary-container, var(--dsw-alias-interactive-bg-hover, transparent)) 52%, var(--xaihi-surface, var(--dsw-alias-bg-layer-1, transparent))))))',
  onTertiaryContainer: 'var(--xaihi-md3e-on-tertiary-container, var(--md3e-on-tertiary-container, var(--md-sys-color-on-tertiary-container, var(--xaihi-on-secondary-container, var(--dsw-alias-label-primary, currentColor)))))',
  error: 'var(--xaihi-md3e-error, var(--md3e-error, var(--md-sys-color-error, var(--xaihi-error, var(--dsw-alias-state-error-primary, #b3261e)))))',
} as const

/** Public semantic color contract for consumers that provide a complete theme. */
export const XAIHI_UI_KIT_THEME_TOKENS = [
  '--xaihi-surface',
  '--xaihi-on-surface',
  '--xaihi-on-surface-variant',
  '--xaihi-outline',
  '--xaihi-primary',
  '--xaihi-on-primary',
  '--xaihi-secondary-container',
  '--xaihi-on-secondary-container',
  '--xaihi-error',
  '--xaihi-md3e-surface',
  '--xaihi-md3e-surface-lowest',
  '--xaihi-md3e-surface-low',
  '--xaihi-md3e-surface-high',
  '--xaihi-md3e-primary',
  '--xaihi-md3e-on-primary',
  '--xaihi-md3e-primary-container',
  '--xaihi-md3e-on-primary-container',
  '--xaihi-md3e-secondary-container',
  '--xaihi-md3e-on-secondary-container',
  '--xaihi-md3e-tertiary-container',
  '--xaihi-md3e-on-tertiary-container',
  '--xaihi-md3e-error',
] as const

export type XaihiUiKitThemeToken = (typeof XAIHI_UI_KIT_THEME_TOKENS)[number]

/** 形状刻度（M3 shape scale 的转译）：像素而不是 rem，面板要能塞进窄栏。 */
export const SHAPE = { cornerXS: 4, cornerS: 8, cornerM: 12 } as const

/** 间距刻度（M3 spacing 的常用四档）。 */
export const SPACE = { xs: 4, s: 8, m: 12, l: 16 } as const

/** 一次注入的组件样式；id 保证多个 remote 各带一份副本时也只生效一次。 */
export const STYLE_TAG_ID = 'xaihi-ui-kit'

/**
 * 组件规则表。
 *
 * 状态层的数字不是拍的：M3 的 state layer 用**前景色叠加**，hover 8%、pressed/focus 12%，
 * `disabled` 的内容整体降到 38%。这里用 `::after { background: currentColor }` 做同一件事，
 * 所以叠加色天然跟着各变体自己的 on-color（filled 是 onPrimary、text 是 primary）。
 */
const BASE_CSS = `
.xaihi-card { display: grid; min-width: 0; gap: ${SPACE.s}px; padding: ${SPACE.m}px; border: 0.5px solid ${ALIAS.outline}; border-radius: ${SHAPE.cornerM}px; background: ${ALIAS.surface}; color: ${ALIAS.onSurface}; font-size: 13px; }
.xaihi-card-actions { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 6px; }
.xaihi-btn { position: relative; display: inline-flex; min-height: 36px; align-items: center; justify-content: center; gap: ${SPACE.xs}px; box-sizing: border-box; padding: 7px ${SPACE.m}px; border: 0; border-radius: ${SHAPE.cornerXS}px; font: inherit; cursor: pointer; transition: transform 180ms cubic-bezier(.22,1.4,.36,1), border-radius 180ms ease; }
.xaihi-btn::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: currentColor; opacity: 0; pointer-events: none; }
.xaihi-btn:hover::after { opacity: .08; }
.xaihi-btn:active::after { opacity: .12; }
.xaihi-btn:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.xaihi-btn[data-variant="filled"] { background: ${ALIAS.primary}; color: ${ALIAS.onPrimary}; }
.xaihi-btn[data-variant="tonal"] { background: ${ALIAS.secondaryContainer}; color: ${ALIAS.onSecondaryContainer}; }
.xaihi-btn[data-variant="text"] { background: transparent; color: ${ALIAS.primary}; }
.xaihi-btn[data-shape="pill"] { border-radius: 999px; }
.xaihi-btn[data-shape="expressive"] { border-radius: 42% 22% 38% 18% / 28% 36% 22% 42%; }
.xaihi-btn[data-size="sm"] { min-height: 30px; padding: 5px 10px; font-size: 12px; }
.xaihi-btn[data-size="lg"] { min-height: 44px; padding: 9px 18px; }
.xaihi-btn:active { transform: scale(.97); }
.xaihi-btn[disabled] { opacity: .38; cursor: default; }
.xaihi-btn[disabled]:hover::after { opacity: 0; }
.xaihi-field { display: grid; gap: ${SPACE.xs}px; }
.xaihi-field-label { font-size: 12px; color: ${ALIAS.onSurfaceVariant}; }
.xaihi-field-input { padding: 6px ${SPACE.s}px; border: 0.5px solid ${ALIAS.outline}; border-radius: ${SHAPE.cornerXS}px; background: transparent; color: inherit; font: inherit; }
.xaihi-field-input:focus-visible { outline: 2px solid ${ALIAS.primary}; outline-offset: 1px; }
.xaihi-status { font-size: 12px; color: ${ALIAS.onSurfaceVariant}; }
.xaihi-status[data-tone="error"] { color: ${ALIAS.error}; }
`

/** CSS for the reusable Material 3 Expressive primitives. */
export const MD3E_CSS = `
.xaihi-md3e-shell { color: ${ALIAS.onSurface}; background: ${MD3E_ALIAS.surface}; }
.xaihi-md3e-surface { position: relative; min-width: 0; overflow: hidden; border-radius: 24px 18px 28px 14px; background: ${MD3E_ALIAS.surfaceLow}; color: ${ALIAS.onSurface}; }
.xaihi-md3e-surface::before, .xaihi-md3e-surface::after { content: ''; position: absolute; pointer-events: none; border-radius: 999px; opacity: .26; }
.xaihi-md3e-surface::before { width: 96px; height: 96px; top: -44px; right: -26px; background: ${MD3E_ALIAS.primaryContainer}; transform: rotate(14deg); }
.xaihi-md3e-surface::after { width: 72px; height: 72px; right: 12px; bottom: -42px; background: ${MD3E_ALIAS.tertiaryContainer}; transform: rotate(-18deg); }
.xaihi-md3e-surface > * { position: relative; z-index: 1; }
.xaihi-md3e-hero { display: grid; gap: 8px; padding: 16px; border-radius: 24px 14px 28px 10px; background: linear-gradient(112deg, ${MD3E_ALIAS.primaryContainer}, ${MD3E_ALIAS.surfaceHigh} 58%, ${MD3E_ALIAS.tertiaryContainer}); color: ${MD3E_ALIAS.onPrimaryContainer}; }
.xaihi-md3e-hero[data-tone="secondary"] { background: linear-gradient(112deg, ${MD3E_ALIAS.secondaryContainer}, ${MD3E_ALIAS.surfaceHigh}); color: ${MD3E_ALIAS.onSecondaryContainer}; }
.xaihi-md3e-hero[data-tone="tertiary"] { background: linear-gradient(112deg, ${MD3E_ALIAS.tertiaryContainer}, ${MD3E_ALIAS.surfaceHigh}); color: ${MD3E_ALIAS.onTertiaryContainer}; }
.xaihi-md3e-hero-title { min-width: 0; font-size: 18px; font-weight: 750; letter-spacing: 0; }
.xaihi-md3e-hero-description { max-width: 66ch; font-size: 12px; line-height: 1.45; opacity: .78; }
.xaihi-md3e-hero-meta { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 10px; font-weight: 650; }
.xaihi-md3e-badge { display: inline-grid; width: 36px; height: 36px; flex: 0 0 auto; place-items: center; background: ${MD3E_ALIAS.primary}; color: ${MD3E_ALIAS.onPrimary}; transition: transform 180ms cubic-bezier(.22,1.4,.36,1); }
.xaihi-md3e-badge[data-size="sm"] { width: 28px; height: 28px; }
.xaihi-md3e-badge[data-size="lg"] { width: 48px; height: 48px; }
.xaihi-md3e-badge[data-shape="circle"] { border-radius: 50%; }
.xaihi-md3e-badge[data-shape="rounded"] { border-radius: 14px 8px 12px 6px; }
.xaihi-md3e-badge[data-shape="clover"] { clip-path: polygon(50% 5%, 62% 18%, 78% 8%, 82% 26%, 98% 30%, 84% 50%, 98% 70%, 82% 74%, 78% 92%, 62% 82%, 50% 95%, 38% 82%, 22% 92%, 18% 74%, 2% 70%, 16% 50%, 2% 30%, 18% 26%, 22% 8%, 38% 18%); }
.xaihi-md3e-badge[data-shape="sunny"] { clip-path: polygon(50% 0%, 58% 15%, 70% 4%, 72% 22%, 90% 14%, 84% 32%, 100% 38%, 82% 50%, 100% 62%, 84% 68%, 90% 86%, 72% 78%, 70% 96%, 58% 85%, 50% 100%, 42% 85%, 30% 96%, 28% 78%, 10% 86%, 16% 68%, 0% 62%, 18% 50%, 0% 38%, 16% 32%, 10% 14%, 28% 22%, 30% 4%, 42% 15%); }
.xaihi-md3e-badge[data-shape="gem"] { clip-path: polygon(22% 4%, 78% 4%, 98% 50%, 50% 98%, 2% 50%); }
.xaihi-md3e-badge[data-shape="arch"] { clip-path: polygon(8% 96%, 8% 50%, 18% 24%, 36% 8%, 64% 8%, 82% 24%, 92% 50%, 92% 96%); }
.xaihi-md3e-badge[data-shape="pebble"] { border-radius: 58% 42% 56% 44% / 42% 54% 46% 58%; }
.xaihi-md3e-badge[data-active="true"] { transform: rotate(-4deg) scale(1.06); }
.xaihi-md3e-patch { position: relative; min-width: 0; overflow: hidden; border-radius: 20px 24px 12px 22px; background: ${MD3E_ALIAS.surfaceHigh}; }
.xaihi-md3e-patch::before, .xaihi-md3e-patch::after { content: ''; position: absolute; pointer-events: none; }
.xaihi-md3e-patch::before { width: 80px; height: 80px; top: -34px; right: -22px; border-radius: 36% 64% 52% 48%; background: ${MD3E_ALIAS.primaryContainer}; opacity: .48; transform: rotate(18deg); }
.xaihi-md3e-patch::after { width: 56px; height: 56px; right: 20px; bottom: -30px; border-radius: 62% 38% 42% 58%; background: ${MD3E_ALIAS.tertiaryContainer}; opacity: .46; transform: rotate(-16deg); }
.xaihi-md3e-patch > * { position: relative; z-index: 1; }
.xaihi-md3e-section { display: grid; gap: 10px; min-width: 0; box-sizing: border-box; overflow: hidden; padding: 12px; border-radius: 24px; background: ${MD3E_ALIAS.surfaceLow}; }
.xaihi-md3e-section-header { display: flex; min-width: 0; flex-wrap: wrap; align-items: start; justify-content: space-between; gap: 8px; }
.xaihi-md3e-section-title { min-width: 0; font-size: 13px; font-weight: 750; }
.xaihi-md3e-section-description { min-width: 0; color: ${ALIAS.onSurfaceVariant}; font-size: 11px; line-height: 1.45; }
.xaihi-md3e-action-group { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 6px; }
.xaihi-md3e-action-group[data-orientation="vertical"] { flex-direction: column; align-items: stretch; }
.xaihi-md3e-toggle-tile, .xaihi-md3e-option-card { display: flex; min-width: 0; max-width: 100%; align-items: center; gap: 10px; box-sizing: border-box; overflow: hidden; border: 0; border-radius: 18px 12px 16px 8px; background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; padding: 10px 12px; text-align: left; font: inherit; cursor: pointer; transition: transform 180ms cubic-bezier(.22,1.4,.36,1), background-color 180ms ease; }
.xaihi-md3e-toggle-tile:hover, .xaihi-md3e-option-card:hover { background: ${MD3E_ALIAS.secondaryContainer}; }
.xaihi-md3e-toggle-tile:active, .xaihi-md3e-option-card:active { transform: scale(.98); }
.xaihi-md3e-toggle-tile:focus-visible, .xaihi-md3e-option-card:focus-visible, .xaihi-md3e-segment:focus-visible, .xaihi-md3e-action:focus-visible { outline: 2px solid ${MD3E_ALIAS.primary}; outline-offset: 2px; }
.xaihi-md3e-toggle-tile[data-checked="true"], .xaihi-md3e-option-card[data-selected="true"] { background: ${MD3E_ALIAS.primaryContainer}; color: ${MD3E_ALIAS.onPrimaryContainer}; }
.xaihi-md3e-tile-copy { min-width: 0; flex: 1; }
.xaihi-md3e-tile-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 700; }
.xaihi-md3e-tile-description { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: ${ALIAS.onSurfaceVariant}; font-size: 10px; }
.xaihi-md3e-segmented { display: flex; min-width: 0; overflow: auto hidden; border-radius: 18px; background: ${MD3E_ALIAS.surfaceHigh}; padding: 4px; scrollbar-width: thin; }
.xaihi-md3e-segment { min-width: max-content; border: 0; border-radius: 12px; background: transparent; color: ${ALIAS.onSurfaceVariant}; padding: 7px 11px; font: inherit; font-size: 11px; font-weight: 700; cursor: pointer; transition: transform 180ms cubic-bezier(.22,1.4,.36,1), background-color 180ms ease, color 180ms ease; }
.xaihi-md3e-segment[data-active="true"] { background: ${MD3E_ALIAS.primary}; color: ${MD3E_ALIAS.onPrimary}; transform: translateY(-1px); }
.xaihi-md3e-slider-card { display: grid; gap: 8px; min-width: 0; padding: 12px; border-radius: 22px 14px 18px 10px; background: ${MD3E_ALIAS.surfaceHigh}; }
.xaihi-md3e-slider-head { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; }
.xaihi-md3e-slider-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 750; }
.xaihi-md3e-slider-value { flex: 0 0 auto; color: ${MD3E_ALIAS.primary}; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; font-variant-numeric: tabular-nums; }
.xaihi-md3e-slider-rail { position: relative; height: 14px; }
.xaihi-md3e-slider-rail::before { content: ''; position: absolute; inset: 3px 0; border-radius: 999px; background: ${MD3E_ALIAS.surface}; }
.xaihi-md3e-slider-rail input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; accent-color: ${MD3E_ALIAS.primary}; cursor: pointer; }
.xaihi-md3e-slider-rail input::-webkit-slider-runnable-track { height: 8px; border-radius: 999px; background: transparent; }
.xaihi-md3e-slider-rail input::-webkit-slider-thumb { width: 6px; height: 20px; margin-top: -6px; border: 0; border-radius: 999px; background: ${MD3E_ALIAS.primary}; box-shadow: 0 0 0 4px color-mix(in srgb, ${MD3E_ALIAS.primary} 16%, transparent); -webkit-appearance: none; }
.xaihi-md3e-slider-rail input::-moz-range-track { height: 8px; border: 0; border-radius: 999px; background: transparent; }
.xaihi-md3e-slider-rail input::-moz-range-thumb { width: 6px; height: 20px; border: 0; border-radius: 999px; background: ${MD3E_ALIAS.primary}; }
.xaihi-md3e-slider-ticks { display: flex; min-width: 0; justify-content: space-between; overflow: hidden; color: ${ALIAS.onSurfaceVariant}; font-size: 9px; }
.xaihi-md3e-stat { display: grid; gap: 3px; min-width: 0; padding: 11px 12px; border-radius: 18px 10px 16px 8px; background: ${MD3E_ALIAS.surfaceHigh}; }
.xaihi-md3e-stat-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 22px; font-weight: 800; letter-spacing: 0; }
.xaihi-md3e-stat-label { color: ${ALIAS.onSurfaceVariant}; font-size: 10px; font-weight: 650; }
.xaihi-md3e-fact { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 0; color: ${ALIAS.onSurfaceVariant}; font-size: 11px; }
.xaihi-md3e-fact + .xaihi-md3e-fact { border-top: 1px solid color-mix(in srgb, ${ALIAS.outline} 18%, transparent); }
.xaihi-md3e-fact-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: ${ALIAS.onSurface}; font-weight: 700; text-align: right; }
.xaihi-md3e-morphing { display: inline-flex; align-items: center; gap: 4px; height: 20px; }
.xaihi-md3e-morphing span { width: 7px; height: 7px; border-radius: 50%; background: ${MD3E_ALIAS.primary}; animation: xaihi-md3e-morph 1.6s ease-in-out infinite; }
.xaihi-md3e-morphing span:nth-child(2) { background: ${MD3E_ALIAS.secondaryContainer}; animation-delay: 120ms; }
.xaihi-md3e-morphing span:nth-child(3) { background: ${MD3E_ALIAS.tertiaryContainer}; animation-delay: 240ms; }
@keyframes xaihi-md3e-morph { 0%, 100% { transform: translateY(0) scale(.8); border-radius: 50%; } 50% { transform: translateY(-4px) scale(1.25); border-radius: 35% 65% 50% 50%; } }
@media (prefers-reduced-motion: reduce) { .xaihi-md3e-morphing span, .xaihi-md3e-cover-badge[data-pulse="true"] { animation: none; } .xaihi-md3e-badge, .xaihi-md3e-toggle-tile, .xaihi-md3e-option-card, .xaihi-md3e-segment { transition: none; } }
@container (max-width: 360px) { .xaihi-md3e-hero { padding: 12px; border-radius: 18px 12px 20px 8px; } .xaihi-md3e-hero-title { font-size: 15px; } .xaihi-md3e-slider-card { padding: 10px; } .xaihi-md3e-action-group > * { min-width: 0; } }
.xaihi-md3e-node-frame { container: node / size; display: flex; min-width: 0; min-height: 0; width: 100%; height: 100%; flex-direction: column; overflow: hidden; overscroll-behavior: contain; }
.xaihi-md3e-node-frame[data-scroll="internal"] { overflow: auto; }
.xaihi-md3e-node-frame > * { min-width: 0; }
.xaihi-md3e-shape-button, .xaihi-md3e-action-button { position: relative; display: inline-flex; min-width: 40px; min-height: 40px; align-items: center; justify-content: center; gap: 8px; box-sizing: border-box; border: 0; background: ${MD3E_ALIAS.primary}; color: ${MD3E_ALIAS.onPrimary}; padding: 10px 16px; font: inherit; font-weight: 800; cursor: pointer; overflow: hidden; transition: transform 180ms cubic-bezier(.22,1.4,.36,1), filter 180ms ease, clip-path 180ms ease, border-radius 180ms ease; clip-path: var(--xaihi-shape-clip, none); border-radius: var(--xaihi-shape-radius, 0px); }
.xaihi-md3e-shape-button::after, .xaihi-md3e-action-button::after { content: ''; position: absolute; inset: 0; background: currentColor; opacity: 0; pointer-events: none; transition: opacity 120ms ease; }
.xaihi-md3e-shape-button:hover::after, .xaihi-md3e-action-button:hover::after { opacity: .08; }
.xaihi-md3e-shape-button[data-pressed="true"], .xaihi-md3e-action-button[data-pressed="true"], .xaihi-md3e-action-button[data-phase="pressed"], .xaihi-md3e-action-button:active { transform: scale(.96); filter: saturate(1.16); clip-path: var(--xaihi-shape-pressed-clip, var(--xaihi-shape-clip, none)); border-radius: var(--xaihi-shape-pressed-radius, var(--xaihi-shape-radius, 0px)); }
.xaihi-md3e-shape-button[data-phase="expanded"], .xaihi-md3e-action-button[data-phase="expanded"], .xaihi-md3e-shape-surface[data-phase="expanded"], .xaihi-md3e-chip[data-phase="expanded"] { transform: scale(1.04); clip-path: var(--xaihi-shape-expanded-clip, var(--xaihi-shape-clip, none)); border-radius: var(--xaihi-shape-expanded-radius, var(--xaihi-shape-radius, 0px)); }
.xaihi-md3e-shape-button[data-pressed="true"]::after, .xaihi-md3e-action-button[data-pressed="true"]::after, .xaihi-md3e-action-button[data-phase="pressed"]::after, .xaihi-md3e-action-button:active::after { opacity: .14; }
.xaihi-md3e-shape-button[data-tone="secondary"], .xaihi-md3e-action-button[data-tone="secondary"] { background: ${MD3E_ALIAS.secondaryContainer}; color: ${MD3E_ALIAS.onSecondaryContainer}; }
.xaihi-md3e-shape-button[data-tone="tertiary"], .xaihi-md3e-action-button[data-tone="tertiary"] { background: ${MD3E_ALIAS.tertiaryContainer}; color: ${MD3E_ALIAS.onTertiaryContainer}; }
.xaihi-md3e-shape-button[data-tone="neutral"], .xaihi-md3e-action-button[data-tone="neutral"] { background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; }
.xaihi-md3e-shape-button[data-tone="error"], .xaihi-md3e-action-button[data-tone="error"] { background: ${MD3E_ALIAS.error}; color: ${MD3E_ALIAS.onPrimary}; }
.xaihi-md3e-shape-button[data-size="sm"] { min-width: 32px; min-height: 32px; padding: 7px 10px; font-size: 11px; }
.xaihi-md3e-shape-button[data-size="lg"] { min-width: 48px; min-height: 48px; padding: 12px 18px; }
.xaihi-md3e-action-button[data-size="xs"] { min-height: 32px; padding: 6px 10px; font-size: 11px; }
.xaihi-md3e-action-button[data-size="sm"] { min-height: 40px; padding: 9px 14px; font-size: 12px; }
.xaihi-md3e-action-button[data-size="lg"] { min-height: 56px; padding: 14px 22px; font-size: 14px; }
.xaihi-md3e-action-button[data-size="xl"] { min-height: 136px; padding: 24px 32px; font-size: 18px; letter-spacing: 0; }
.xaihi-md3e-connected-group { display: flex; min-width: 0; gap: 6px; padding: 6px; border-radius: 24px; background: ${MD3E_ALIAS.surfaceLow}; }
.xaihi-md3e-connected-group[data-orientation="vertical"] { flex-direction: column; }
.xaihi-md3e-connected-group > * { min-width: 0; }
.xaihi-md3e-connected-group[data-distribution="equal"] > * { flex: 1 1 0; }
.xaihi-md3e-switch-row { display: flex; min-width: 0; width: 100%; align-items: center; gap: 12px; box-sizing: border-box; border: 0; border-radius: 22px; background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; padding: 10px 12px; text-align: left; font: inherit; cursor: pointer; transition: background-color 160ms ease, transform 180ms cubic-bezier(.22,1.4,.36,1); }
.xaihi-md3e-switch-row:hover { background: ${MD3E_ALIAS.secondaryContainer}; }
.xaihi-md3e-switch-row:active { transform: scale(.99); }
.xaihi-md3e-switch-row[data-checked="true"] { background: ${MD3E_ALIAS.primaryContainer}; color: ${MD3E_ALIAS.onPrimaryContainer}; }
.xaihi-md3e-switch-copy { display: grid; min-width: 0; flex: 1; gap: 2px; }
.xaihi-md3e-switch-label, .xaihi-md3e-switch-description { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.xaihi-md3e-switch-label { font-size: 12px; font-weight: 800; }
.xaihi-md3e-switch-description { color: ${ALIAS.onSurfaceVariant}; font-size: 10px; }
.xaihi-md3e-switch-track { display: inline-flex; width: 44px; height: 28px; flex: 0 0 auto; align-items: center; border-radius: 999px; background: ${MD3E_ALIAS.surface}; padding: 3px; transition: background-color 160ms ease; }
.xaihi-md3e-switch-thumb { width: 22px; height: 22px; border-radius: 50%; background: ${ALIAS.onSurfaceVariant}; transition: transform 180ms cubic-bezier(.22,1.4,.36,1), background-color 160ms ease; }
.xaihi-md3e-switch-row[data-checked="true"] .xaihi-md3e-switch-track { background: ${MD3E_ALIAS.primary}; }
.xaihi-md3e-switch-row[data-checked="true"] .xaihi-md3e-switch-thumb { background: ${MD3E_ALIAS.onPrimary}; transform: translateX(16px); }
.xaihi-md3e-switch-check { display: block; width: 9px; height: 5px; margin: 7px auto 0; border-left: 2px solid ${MD3E_ALIAS.primary}; border-bottom: 2px solid ${MD3E_ALIAS.primary}; opacity: 0; transform: rotate(-45deg) scale(.6); transition: opacity 160ms ease, transform 180ms cubic-bezier(.22,1.4,.36,1); }
.xaihi-md3e-switch-row[data-checked="true"] .xaihi-md3e-switch-check { opacity: 1; transform: rotate(-45deg) scale(1); }
.xaihi-md3e-value-chip { display: inline-flex; max-width: 12ch; min-height: 24px; align-items: center; justify-content: center; overflow: hidden; border-radius: 999px; background: ${MD3E_ALIAS.secondaryContainer}; color: ${MD3E_ALIAS.onSecondaryContainer}; padding: 3px 8px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; font-variant-numeric: tabular-nums; font-weight: 800; white-space: nowrap; }
.xaihi-md3e-slider { display: grid; min-width: 0; gap: 8px; }
.xaihi-md3e-slider-header { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; font-weight: 800; }
.xaihi-md3e-slider-header > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xaihi-md3e-slider-rail { position: relative; min-width: 0; height: 40px; }
.xaihi-md3e-slider-rail::before, .xaihi-md3e-slider-rail::after { content: ''; position: absolute; top: 50%; left: 0; height: var(--xaihi-slider-thickness, 24px); border-radius: 999px; transform: translateY(-50%); pointer-events: none; }
.xaihi-md3e-slider-rail::before { width: 100%; background: ${MD3E_ALIAS.surfaceHigh}; }
.xaihi-md3e-slider-rail::after { width: var(--xaihi-slider-progress, 0%); background: ${MD3E_ALIAS.primary}; }
.xaihi-md3e-slider-rail input { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; margin: 0; appearance: none; background: transparent; cursor: pointer; }
.xaihi-md3e-slider-rail input::-webkit-slider-runnable-track { height: var(--xaihi-slider-thickness, 24px); border-radius: 999px; background: transparent; }
.xaihi-md3e-slider-rail input::-webkit-slider-thumb { width: 8px; height: calc(var(--xaihi-slider-thickness, 24px) + 10px); margin-top: calc((var(--xaihi-slider-thickness, 24px) - (var(--xaihi-slider-thickness, 24px) + 10px)) / 2); border: 3px solid ${MD3E_ALIAS.primary}; border-radius: 999px; background: ${MD3E_ALIAS.surface}; box-shadow: 0 0 0 3px color-mix(in srgb, ${MD3E_ALIAS.primary} 18%, transparent); appearance: none; }
.xaihi-md3e-slider-rail input::-moz-range-track { height: var(--xaihi-slider-thickness, 24px); border: 0; border-radius: 999px; background: transparent; }
.xaihi-md3e-slider-rail input::-moz-range-thumb { width: 8px; height: calc(var(--xaihi-slider-thickness, 24px) + 10px); border: 3px solid ${MD3E_ALIAS.primary}; border-radius: 999px; background: ${MD3E_ALIAS.surface}; }
.xaihi-md3e-slider[data-thickness="16"] { --xaihi-slider-thickness: 16px; }
.xaihi-md3e-slider[data-thickness="24"] { --xaihi-slider-thickness: 24px; }
.xaihi-md3e-slider[data-thickness="40"] { --xaihi-slider-thickness: 40px; }
.xaihi-md3e-slider[data-wavy="true"] .xaihi-md3e-slider-rail::after { clip-path: polygon(0 36%, 8% 45%, 16% 28%, 24% 48%, 32% 32%, 40% 50%, 48% 30%, 56% 46%, 64% 32%, 72% 50%, 80% 34%, 88% 46%, 100% 34%, 100% 100%, 0 100%); }
.xaihi-md3e-slider[data-orientation="vertical"] { width: 40px; }
.xaihi-md3e-slider[data-orientation="vertical"] .xaihi-md3e-slider-header { flex-direction: column; align-items: center; gap: 4px; text-align: center; }
.xaihi-md3e-slider[data-orientation="vertical"] .xaihi-md3e-slider-header > span:first-child { max-width: 100%; overflow-wrap: anywhere; white-space: normal; }
.xaihi-md3e-slider[data-orientation="vertical"] .xaihi-md3e-slider-rail { width: 40px; height: 180px; }
.xaihi-md3e-slider[data-orientation="vertical"] .xaihi-md3e-slider-rail::before { top: 0; left: 50%; width: var(--xaihi-slider-thickness, 24px); height: 100%; transform: translateX(-50%); }
.xaihi-md3e-slider[data-orientation="vertical"] .xaihi-md3e-slider-rail::after { top: auto; right: auto; bottom: 0; left: 50%; width: var(--xaihi-slider-thickness, 24px); height: var(--xaihi-slider-progress, 0%); transform: translateX(-50%); }
.xaihi-md3e-slider[data-orientation="vertical"] .xaihi-md3e-slider-rail input { top: 70px; left: -70px; width: 180px; height: 40px; transform: rotate(-90deg); transform-origin: center; }
.xaihi-md3e-slider-ticks { display: flex; justify-content: space-between; padding: 0 6px; }
.xaihi-md3e-slider[data-orientation="vertical"] .xaihi-md3e-slider-ticks { height: 180px; flex-direction: column; align-items: center; padding: 6px 0; }
.xaihi-md3e-slider-ticks span { min-width: 0; width: 4px; height: 4px; overflow: hidden; border-radius: 50%; background: ${MD3E_ALIAS.surfaceHigh}; text-overflow: ellipsis; white-space: nowrap; }
.xaihi-md3e-slider-ticks span[data-active="true"] { background: ${MD3E_ALIAS.primary}; }
.xaihi-md3e-progress { position: relative; min-width: 0; height: var(--xaihi-progress-thickness, 16px); overflow: hidden; border-radius: 999px; background: ${MD3E_ALIAS.surfaceHigh}; }
.xaihi-md3e-progress > span { display: block; height: 100%; border-radius: inherit; background: ${MD3E_ALIAS.primary}; transition: width 220ms ease; }
.xaihi-md3e-progress[data-thickness="16"] { --xaihi-progress-thickness: 16px; }
.xaihi-md3e-progress[data-thickness="24"] { --xaihi-progress-thickness: 24px; }
.xaihi-md3e-progress[data-thickness="40"] { --xaihi-progress-thickness: 40px; }
.xaihi-md3e-progress[data-wavy="true"] > span { clip-path: polygon(0 36%, 8% 48%, 16% 30%, 24% 50%, 32% 32%, 40% 48%, 48% 28%, 56% 48%, 64% 30%, 72% 50%, 80% 32%, 88% 48%, 100% 34%, 100% 100%, 0 100%); }
.xaihi-md3e-shape-surface { position: relative; display: grid; min-width: 0; min-height: 40px; place-items: center; overflow: hidden; box-sizing: border-box; padding: 12px; background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; clip-path: var(--xaihi-shape-clip, none); border-radius: var(--xaihi-shape-radius, 0px); transition: transform 180ms cubic-bezier(.22,1.4,.36,1), clip-path 180ms ease, border-radius 180ms ease; }
.xaihi-md3e-shape-surface[data-tone="primary"] { background: ${MD3E_ALIAS.primary}; color: ${MD3E_ALIAS.onPrimary}; }
.xaihi-md3e-shape-surface[data-tone="secondary"] { background: ${MD3E_ALIAS.secondaryContainer}; color: ${MD3E_ALIAS.onSecondaryContainer}; }
.xaihi-md3e-shape-surface[data-tone="tertiary"] { background: ${MD3E_ALIAS.tertiaryContainer}; color: ${MD3E_ALIAS.onTertiaryContainer}; }
.xaihi-md3e-shape-surface[data-tone="error"] { background: ${MD3E_ALIAS.error}; color: ${MD3E_ALIAS.onPrimary}; }
.xaihi-md3e-chip { display: inline-flex; min-height: 28px; min-width: 0; align-items: center; justify-content: center; box-sizing: border-box; padding: 5px 10px; overflow: hidden; background: ${MD3E_ALIAS.secondaryContainer}; color: ${MD3E_ALIAS.onSecondaryContainer}; font-size: 11px; font-weight: 800; white-space: nowrap; clip-path: var(--xaihi-shape-clip, none); border-radius: var(--xaihi-shape-radius, 999px); transition: transform 180ms cubic-bezier(.22,1.4,.36,1), clip-path 180ms ease, border-radius 180ms ease; }
.xaihi-md3e-chip[data-tone="primary"] { background: ${MD3E_ALIAS.primary}; color: ${MD3E_ALIAS.onPrimary}; }
.xaihi-md3e-chip[data-tone="tertiary"] { background: ${MD3E_ALIAS.tertiaryContainer}; color: ${MD3E_ALIAS.onTertiaryContainer}; }
.xaihi-md3e-chip[data-tone="neutral"] { background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; }
.xaihi-md3e-chip[data-tone="error"] { background: ${MD3E_ALIAS.error}; color: ${MD3E_ALIAS.onPrimary}; }
.xaihi-md3e-fab { min-width: 56px; min-height: 56px; padding-inline: 20px; box-shadow: 0 8px 22px color-mix(in srgb, ${MD3E_ALIAS.primary} 28%, transparent); }
.xaihi-md3e-extended-fab { min-width: 120px; justify-content: flex-start; gap: 10px; }
.xaihi-md3e-extended-fab-icon { display: inline-grid; flex: 0 0 auto; place-items: center; }
.xaihi-md3e-extended-fab-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xaihi-md3e-liquid-glass { position: relative; min-width: 0; overflow: hidden; border: 1px solid color-mix(in srgb, ${ALIAS.onSurface} 16%, transparent); border-radius: 26px; background: color-mix(in srgb, ${MD3E_ALIAS.surfaceHigh} 62%, transparent); box-shadow: inset 0 1px 0 color-mix(in srgb, white 20%, transparent), 0 14px 34px color-mix(in srgb, ${ALIAS.onSurface} 10%, transparent); backdrop-filter: blur(18px) saturate(1.18); }
.xaihi-md3e-liquid-glass::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(125deg, color-mix(in srgb, white 18%, transparent), transparent 38%, color-mix(in srgb, ${MD3E_ALIAS.primary} 12%, transparent)); }
.xaihi-md3e-liquid-glass > * { position: relative; z-index: 1; }
.xaihi-md3e-liquid-glass[data-intensity="soft"] { backdrop-filter: blur(10px) saturate(1.08); }
.xaihi-md3e-liquid-glass[data-intensity="strong"] { backdrop-filter: blur(28px) saturate(1.28); }
.xaihi-md3e-lens-bar { display: flex; min-width: 0; min-height: 48px; align-items: center; gap: 8px; box-sizing: border-box; padding: 7px 10px; border-radius: 999px; background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; }
.xaihi-md3e-lens-bar-content { display: flex; min-width: 0; flex: 1; align-items: center; gap: 8px; overflow: hidden; }
.xaihi-md3e-navigation-dock { display: flex; min-width: 0; align-items: center; gap: 4px; box-sizing: border-box; padding: 6px; border-radius: 28px; background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; }
.xaihi-md3e-navigation-item { display: inline-flex; min-width: 56px; min-height: 48px; flex: 1 1 0; flex-direction: column; align-items: center; justify-content: center; gap: 3px; border: 0; border-radius: 22px; background: transparent; color: inherit; font: inherit; font-size: 10px; cursor: pointer; }
.xaihi-md3e-navigation-item[data-active="true"] { background: ${MD3E_ALIAS.primaryContainer}; color: ${MD3E_ALIAS.onPrimaryContainer}; }
.xaihi-md3e-popup { min-width: 160px; max-width: min(360px, 100%); box-sizing: border-box; padding: 12px; border: 1px solid color-mix(in srgb, ${ALIAS.outline} 28%, transparent); border-radius: 20px 12px 24px 14px; background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; box-shadow: 0 12px 32px color-mix(in srgb, ${ALIAS.onSurface} 16%, transparent); }
.xaihi-md3e-field { display: grid; min-width: 0; gap: 5px; color: ${ALIAS.onSurface}; }
.xaihi-md3e-field-label { display: flex; min-width: 0; align-items: center; justify-content: space-between; gap: 8px; padding-inline: 3px; color: ${ALIAS.onSurfaceVariant}; font-size: 11px; font-weight: 800; }
.xaihi-md3e-field-control { display: flex; min-width: 0; min-height: 46px; align-items: center; gap: 7px; box-sizing: border-box; padding: 6px 11px; border: 1px solid color-mix(in srgb, ${ALIAS.outline} 30%, transparent); border-radius: 18px 12px 20px 10px; background: ${MD3E_ALIAS.surfaceLowest}; transition: border-radius 180ms cubic-bezier(.22,1.4,.36,1), border-color 160ms ease, background-color 160ms ease; }
.xaihi-md3e-field-control:focus-within { border-color: ${MD3E_ALIAS.primary}; border-radius: 22px; background: ${MD3E_ALIAS.surface}; }
.xaihi-md3e-field-control input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; font-size: 12px; }
.xaihi-md3e-field[data-invalid="true"] .xaihi-md3e-field-control { border-color: ${MD3E_ALIAS.error}; }
.xaihi-md3e-field-hint { min-width: 0; color: ${ALIAS.onSurfaceVariant}; font-size: 10px; line-height: 1.35; }
.xaihi-md3e-search-bar { display: flex; min-width: 0; min-height: 50px; align-items: center; gap: 8px; box-sizing: border-box; padding: 7px 11px; border: 1px solid color-mix(in srgb, ${ALIAS.outline} 22%, transparent); border-radius: 999px; background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; transition: border-radius 180ms cubic-bezier(.22,1.4,.36,1), border-color 160ms ease; }
.xaihi-md3e-search-bar:focus-within { border-color: ${MD3E_ALIAS.primary}; border-radius: 24px; }
.xaihi-md3e-search-bar input { min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; font-size: 12px; }
.xaihi-md3e-search-leading, .xaihi-md3e-search-trailing { display: inline-flex; flex: 0 0 auto; align-items: center; color: ${ALIAS.onSurfaceVariant}; }
.xaihi-md3e-list { display: grid; min-width: 0; gap: 2px; overflow: hidden; padding: 5px; border-radius: 24px; background: ${MD3E_ALIAS.surfaceLow}; }
.xaihi-md3e-list[data-inset="true"] { margin-inline: 6px; }
.xaihi-md3e-list-item { display: flex; min-width: 0; min-height: 58px; align-items: center; gap: 10px; box-sizing: border-box; border: 0; border-radius: 18px 10px 16px 8px; background: transparent; color: ${ALIAS.onSurface}; padding: 8px 10px; text-align: left; font: inherit; cursor: pointer; transition: background-color 160ms ease, border-radius 180ms cubic-bezier(.22,1.4,.36,1), transform 180ms cubic-bezier(.22,1.4,.36,1); }
.xaihi-md3e-list-item:hover { background: ${MD3E_ALIAS.surfaceHigh}; border-radius: 22px; }
.xaihi-md3e-list-item:active { transform: scale(.985); }
.xaihi-md3e-list-item[data-selected="true"] { background: ${MD3E_ALIAS.primaryContainer}; color: ${MD3E_ALIAS.onPrimaryContainer}; }
.xaihi-md3e-list-leading, .xaihi-md3e-list-trailing { display: inline-flex; flex: 0 0 auto; align-items: center; }
.xaihi-md3e-list-copy { display: grid; min-width: 0; flex: 1; gap: 2px; }
.xaihi-md3e-list-title, .xaihi-md3e-list-description { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.xaihi-md3e-list-title { font-size: 12px; font-weight: 800; }
.xaihi-md3e-list-description { color: ${ALIAS.onSurfaceVariant}; font-size: 10px; }
.xaihi-md3e-badge-count { display: inline-flex; min-width: 20px; height: 20px; align-items: center; justify-content: center; box-sizing: border-box; padding: 0 6px; border-radius: 999px; background: ${MD3E_ALIAS.primary}; color: ${MD3E_ALIAS.onPrimary}; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 10px; font-weight: 900; line-height: 1; }
.xaihi-md3e-badge-count[data-kind="dot"] { width: 9px; min-width: 9px; height: 9px; padding: 0; }
.xaihi-md3e-badge-count[data-kind="disc"] { width: 24px; min-width: 24px; height: 24px; padding: 0; border-radius: 50%; }
.xaihi-md3e-progress-ring { display: block; overflow: visible; transform: rotate(-90deg); }
.xaihi-md3e-progress-ring-track { stroke: ${MD3E_ALIAS.surfaceHigh}; }
.xaihi-md3e-progress-ring-value { stroke: ${MD3E_ALIAS.primary}; stroke-linecap: round; transition: stroke-dashoffset 220ms ease; }
.xaihi-md3e-progress-ring[data-indeterminate="true"] .xaihi-md3e-progress-ring-value { animation: xaihi-md3e-ring-spin 1.1s linear infinite; }
@keyframes xaihi-md3e-ring-spin { from { stroke-dashoffset: 0; } to { stroke-dashoffset: -${Math.PI * 2 * 18}px; } }
.xaihi-md3e-tabs { display: flex; min-width: 0; gap: 4px; overflow: auto hidden; padding: 4px; border-radius: 20px; background: ${MD3E_ALIAS.surfaceLow}; scrollbar-width: thin; }
.xaihi-md3e-tabs button { min-width: max-content; border: 0; border-radius: 14px; background: transparent; color: ${ALIAS.onSurfaceVariant}; padding: 8px 13px; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; transition: background-color 160ms ease, border-radius 180ms cubic-bezier(.22,1.4,.36,1), transform 180ms ease; }
.xaihi-md3e-tabs button[data-active="true"] { border-radius: 999px; background: ${MD3E_ALIAS.primary}; color: ${MD3E_ALIAS.onPrimary}; transform: translateY(-1px); }
.xaihi-md3e-breadcrumb { display: flex; min-width: 0; align-items: center; gap: 7px; overflow: hidden; color: ${ALIAS.onSurfaceVariant}; font-size: 11px; }
.xaihi-md3e-breadcrumb button { min-width: 0; overflow: hidden; border: 0; background: transparent; color: inherit; padding: 3px 5px; text-overflow: ellipsis; white-space: nowrap; font: inherit; cursor: pointer; }
.xaihi-md3e-breadcrumb button:last-of-type { color: ${ALIAS.onSurface}; font-weight: 800; }
.xaihi-md3e-multi-choice-chips { display: flex; min-width: 0; flex-wrap: wrap; gap: 6px; }
.xaihi-md3e-multi-choice-chips button { display: inline-flex; min-width: 0; min-height: 36px; align-items: center; gap: 6px; box-sizing: border-box; border: 0; border-radius: 16px; background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurfaceVariant}; padding: 7px 11px; font: inherit; font-size: 11px; font-weight: 750; cursor: pointer; transition: transform 180ms cubic-bezier(.22,1.4,.36,1), border-radius 180ms cubic-bezier(.22,1.4,.36,1), background-color 160ms ease, color 160ms ease; }
.xaihi-md3e-multi-choice-chips button:hover { border-radius: 999px; }
.xaihi-md3e-multi-choice-chips button[data-selected="true"] { border-radius: 999px; background: ${MD3E_ALIAS.primaryContainer}; color: ${MD3E_ALIAS.onPrimaryContainer}; }
.xaihi-md3e-multi-choice-chips button:active { transform: scale(.97); }
.xaihi-md3e-sheet-root { position: fixed; z-index: 100; inset: 0; display: grid; pointer-events: none; }
.xaihi-md3e-sheet-root[data-side="bottom"] { align-items: end; justify-items: stretch; }
.xaihi-md3e-sheet-root[data-side="end"] { align-items: stretch; justify-items: end; }
.xaihi-md3e-sheet-backdrop { position: absolute; inset: 0; border: 0; background: color-mix(in srgb, ${ALIAS.onSurface} 26%, transparent); pointer-events: auto; }
.xaihi-md3e-sheet { position: relative; z-index: 1; display: grid; min-width: 0; max-width: min(100%, 720px); max-height: min(92vh, 760px); overflow: hidden auto; box-sizing: border-box; border: 1px solid color-mix(in srgb, ${ALIAS.outline} 30%, transparent); border-radius: 28px 18px 12px 24px; background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; box-shadow: 0 18px 48px color-mix(in srgb, ${ALIAS.onSurface} 22%, transparent); pointer-events: auto; }
.xaihi-md3e-sheet-root[data-side="end"] .xaihi-md3e-sheet { width: min(92vw, 440px); height: 100%; max-height: none; border-radius: 26px 0 0 18px; }
.xaihi-md3e-sheet-header { display: flex; min-width: 0; align-items: start; justify-content: space-between; gap: 12px; padding: 16px 18px 8px; }
.xaihi-md3e-sheet-copy { min-width: 0; flex: 1; }
.xaihi-md3e-sheet-copy h2 { margin: 0; overflow: hidden; text-overflow: ellipsis; font-size: 17px; font-weight: 850; }
.xaihi-md3e-sheet-copy p { margin: 4px 0 0; color: ${ALIAS.onSurfaceVariant}; font-size: 11px; line-height: 1.4; }
.xaihi-md3e-sheet-close { min-width: 36px; min-height: 36px; border: 0; border-radius: 50%; background: ${MD3E_ALIAS.surface}; color: inherit; font: inherit; cursor: pointer; }
.xaihi-md3e-sheet :is(button, input, select, textarea, [tabindex]):focus-visible { outline: 2px solid ${MD3E_ALIAS.primary}; outline-offset: 2px; }
.xaihi-md3e-sheet-body { min-width: 0; overflow: auto; padding: 8px 18px 18px; }
.xaihi-md3e-cover-badge { position: absolute; z-index: 2; display: inline-flex; min-height: 24px; max-width: calc(100% - 12px); align-items: center; box-sizing: border-box; overflow: hidden; padding: 4px 8px; background: ${MD3E_ALIAS.primary}; color: ${MD3E_ALIAS.onPrimary}; font-size: 10px; font-weight: 850; white-space: nowrap; }
.xaihi-md3e-cover-badge[data-tone="secondary"] { background: ${MD3E_ALIAS.secondaryContainer}; color: ${MD3E_ALIAS.onSecondaryContainer}; }
.xaihi-md3e-cover-badge[data-tone="tertiary"] { background: ${MD3E_ALIAS.tertiaryContainer}; color: ${MD3E_ALIAS.onTertiaryContainer}; }
.xaihi-md3e-cover-badge[data-tone="neutral"] { background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; }
.xaihi-md3e-cover-badge[data-tone="error"] { background: ${MD3E_ALIAS.error}; color: ${MD3E_ALIAS.onPrimary}; }
.xaihi-md3e-cover-badge[data-pulse="true"] { animation: xaihi-md3e-badge-pulse 1.8s ease-in-out infinite; }
@keyframes xaihi-md3e-badge-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06) rotate(-2deg); } }
.xaihi-md3e-cover-badge[data-position="top-start"] { top: 6px; left: 6px; }
.xaihi-md3e-cover-badge[data-position="top-end"] { top: 6px; right: 6px; }
.xaihi-md3e-cover-badge[data-position="bottom-start"] { bottom: 6px; left: 6px; }
.xaihi-md3e-cover-badge[data-position="bottom-end"] { right: 6px; bottom: 6px; }
.xaihi-md3e-gesture-board { position: relative; display: grid; width: min(100%, 240px); aspect-ratio: 1; grid-template-rows: repeat(3, minmax(0, 1fr)); gap: 14px; box-sizing: border-box; padding: 18px; border-radius: 28px 18px 24px 14px; background: ${MD3E_ALIAS.surfaceLow}; }
.xaihi-md3e-gesture-row { display: grid; min-width: 0; min-height: 0; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.xaihi-md3e-gesture-path { position: absolute; z-index: 0; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.xaihi-md3e-gesture-path polyline { fill: none; stroke: ${MD3E_ALIAS.primary}; stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; opacity: .78; vector-effect: non-scaling-stroke; }
.xaihi-md3e-gesture-board button { position: relative; z-index: 1; min-width: 0; min-height: 0; border: 0; border-radius: 50%; background: ${MD3E_ALIAS.surfaceHigh}; box-shadow: inset 0 0 0 2px color-mix(in srgb, ${ALIAS.outline} 26%, transparent); cursor: pointer; transition: transform 180ms cubic-bezier(.22,1.4,.36,1), background-color 160ms ease, border-radius 180ms ease; }
.xaihi-md3e-gesture-board button::after { content: ''; position: absolute; inset: 30%; border-radius: 50%; background: ${MD3E_ALIAS.primary}; opacity: 0; transform: scale(.5); transition: opacity 160ms ease, transform 180ms cubic-bezier(.22,1.4,.36,1); }
.xaihi-md3e-gesture-board button[aria-pressed="true"] { border-radius: 35% 65% 50% 50%; background: ${MD3E_ALIAS.primaryContainer}; transform: scale(1.08); }
.xaihi-md3e-gesture-board button[aria-pressed="true"]::after { opacity: 1; transform: scale(1); }
.xaihi-md3e-ray-menu { position: relative; display: inline-grid; min-width: 56px; min-height: 56px; place-items: center; }
.xaihi-md3e-ray-center { position: relative; z-index: 2; display: inline-grid; min-width: 56px; min-height: 56px; place-items: center; border: 0; border-radius: 50%; background: ${MD3E_ALIAS.primary}; color: ${MD3E_ALIAS.onPrimary}; font: inherit; font-size: 11px; font-weight: 850; cursor: pointer; }
.xaihi-md3e-ray-items { position: absolute; inset: 50%; z-index: 1; pointer-events: none; }
.xaihi-md3e-ray-items button { position: absolute; top: 50%; left: 50%; display: inline-flex; min-width: 48px; min-height: 40px; align-items: center; justify-content: center; gap: 3px; border: 0; border-radius: 18px 10px 16px 8px; background: ${MD3E_ALIAS.surfaceHigh}; color: ${ALIAS.onSurface}; padding: 5px 8px; font: inherit; font-size: 10px; cursor: pointer; opacity: 0; pointer-events: none; transform: translate(-50%, -50%) rotate(var(--xaihi-ray-angle)) translateY(calc(var(--xaihi-ray-radius) * -1)) rotate(calc(var(--xaihi-ray-angle) * -1)) scale(.7); transition: opacity 180ms ease, transform 240ms cubic-bezier(.22,1.4,.36,1); }
.xaihi-md3e-ray-menu[data-open="true"] .xaihi-md3e-ray-items { pointer-events: auto; }
.xaihi-md3e-ray-menu[data-open="true"] .xaihi-md3e-ray-items button { opacity: 1; pointer-events: auto; transform: translate(-50%, -50%) rotate(var(--xaihi-ray-angle)) translateY(calc(var(--xaihi-ray-radius) * -1)) rotate(calc(var(--xaihi-ray-angle) * -1)) scale(1); }
.xaihi-md3e-ray-items button:hover { background: ${MD3E_ALIAS.primaryContainer}; }
.xaihi-md3e-ray-items button:focus-visible, .xaihi-md3e-ray-center:focus-visible { outline: 2px solid ${MD3E_ALIAS.primary}; outline-offset: 3px; }
.xaihi-md3e-collapsible-card { min-width: 0; overflow: hidden; border-radius: 22px 14px 18px 10px; background: ${MD3E_ALIAS.surfaceHigh}; }
.xaihi-md3e-collapsible-card > button { display: flex; width: 100%; min-width: 0; align-items: center; gap: 8px; box-sizing: border-box; border: 0; background: transparent; color: inherit; padding: 11px 13px; text-align: left; font: inherit; cursor: pointer; }
.xaihi-md3e-collapsible-card > button > span:first-child { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-weight: 800; white-space: nowrap; }
.xaihi-md3e-collapsible-chevron { flex: 0 0 auto; transition: transform 180ms ease; }
.xaihi-md3e-collapsible-card[data-open="true"] .xaihi-md3e-collapsible-chevron { transform: rotate(180deg); }
.xaihi-md3e-collapsible-body { min-width: 0; padding: 0 13px 13px; }
@container (max-width: 360px) { .xaihi-md3e-action-button[data-size="xl"] { min-height: 60px; padding-inline: 18px; font-size: 14px; } .xaihi-md3e-extended-fab { min-width: 0; max-width: 100%; } .xaihi-md3e-switch-row { gap: 8px; padding-inline: 9px; } .xaihi-md3e-switch-description { display: none; } }
`

export const KIT_CSS = `${BASE_CSS}\n${MD3E_CSS}`
