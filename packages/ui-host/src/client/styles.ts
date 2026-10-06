/**
 * 工作台样式：一层 `--xaihi-*` 别名（全部解析到 DSH 的 `--dsw-*` token），加上搬运组件
 * 需要的 Tailwind 工具类与裸 shadcn 变量别名。
 *
 * 为什么不自带颜色：暗色/亮色与 token 分层归 DSH 的 `ctx.theme`
 * （`overrideTokens(source, tokens)`），Xaihi 再造一套就会在宿主换主题时分裂。
 * 类别名给 M3 组件层用，Material You 桥落在别名上而不是直接写 `--dsw-*`。
 * `CLIENT_CSS` 是生成物（`scripts/build-css.mjs`）：宿主只发 `client.*.js`，
 * 所以 CSS 走 JS 通道注进同一个 `<style>`，而不是 `<link>` 一个 `.css`。
 *
 * @module xaihi-ui/styles
 */

import { CLIENT_CSS } from './generated/client-css.ts'

const STYLE_TAG_ID = 'xaihi-ui-styles'

const CSS = `
.xaihi-shell {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 0;
  height: 100%;
  min-height: 0;
  background: var(--xaihi-surface, var(--dsw-alias-bg-layer-1, transparent));
  color: var(--xaihi-on-surface, var(--dsw-alias-label-primary, inherit));
  font-size: 13px;
}
.xaihi-nav { grid-column: 1; grid-row: 1 / span 3; border-right: 0.5px solid var(--xaihi-outline, var(--dsw-alias-border-l2, rgba(128,128,128,.35))); overflow: auto; padding: 8px; display: grid; align-content: start; gap: 2px; }
.xaihi-toolbar { grid-column: 2; grid-row: 1; display: flex; gap: 8px; align-items: center; padding: 6px 10px; border-bottom: 0.5px solid var(--xaihi-outline, var(--dsw-alias-border-l2, rgba(128,128,128,.35))); }
.xaihi-main { grid-column: 2; grid-row: 2; overflow: auto; min-height: 0; }
.xaihi-status { grid-column: 2; grid-row: 3; display: flex; gap: 8px; align-items: center; padding: 4px 10px; border-top: 0.5px solid var(--xaihi-outline, var(--dsw-alias-border-l2, rgba(128,128,128,.35))); font-size: 12px; opacity: .8; }
.xaihi-nav-item { display: block; width: 100%; text-align: left; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.xaihi-nav-item[data-selected="true"] { background: var(--xaihi-secondary-container, var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.14))); }
.xaihi-empty, .xaihi-error { padding: 16px; display: grid; gap: 6px; font-size: 12px; }
.xaihi-error { color: var(--xaihi-error, var(--dsw-alias-state-error-primary, #b3261e)); }
.xaihi-feed { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.xaihi-feed-item { padding: 1px 6px; border-radius: 999px; border: 0.5px solid var(--xaihi-outline, var(--dsw-alias-border-l2, rgba(128,128,128,.35))); font-variant-numeric: tabular-nums; }
.xaihi-feed-item[data-outcome="running"] { color: var(--xaihi-on-surface-variant, var(--dsw-alias-label-secondary, inherit)); }
.xaihi-feed-item[data-outcome="failed"] { color: var(--xaihi-error, var(--dsw-alias-state-error-primary, #b3261e)); }
.xaihi-feed-note { opacity: .7; }
.xaihi-panel-mark {
  display: inline-grid;
  place-items: center;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .02em;
  color: var(--xaihi-on-surface, var(--dsw-alias-label-secondary, inherit));
  background: transparent;
}
.xaihi-panel-mark[data-active="true"] {
  color: var(--xaihi-on-secondary-container, var(--dsw-alias-label-primary, inherit));
  background: var(--xaihi-secondary-container, var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.16)));
}
`

/** 把样式挂进文档；返回 disposer 交给 ctx.effect 回收。 */
export function registerStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  if (document.getElementById(STYLE_TAG_ID) !== null) return () => {}
  const tag = document.createElement('style')
  tag.id = STYLE_TAG_ID
  tag.textContent = `${CSS}\n${CLIENT_CSS}`
  document.head.append(tag)
  return () => tag.remove()
}
