/**
 * 侧栏的面板入口。
 *
 * `sidebar.panellist` 的行由 ui-sidebar 自己持有：它负责显示标题、响应点击并调用
 * `ctx.layout.selectPanel(id)`，贡献者只提供一枚图标，`active` 表示该面板当前是否
 * 占中栏。所以这里既不碰路由也不碰布局，也不需要图标美术——文字标记足够，
 * 且不会伪造一套与上游美术不一致的图形。
 *
 * @module xaihi-ui/panel-entry
 */

import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { Context } from '@deepseek-ai/cordis'
import type * as React from 'react'
import { LOCALE_NAMESPACE, type Translate } from './locales.ts'

/** 侧栏行与 `main` 槽共用的面板 id。 */
export const MAIN_PANEL_KEY = 'xaihi' as MainPanelId

/** owner 提供的图标呈现参数。 */
interface PanelIconProps {
  size: number
  active: boolean
}

function PanelMark({ size, active }: PanelIconProps): React.ReactElement {
  return (
    <span
      className="xaihi-panel-mark"
      data-active={active}
      style={{ width: size, height: size, lineHeight: `${size}px` }}
    >
      Xa
    </span>
  )
}

/**
 * 注册侧栏入口。
 * @param ctx - 客户端根上下文。
 * @param t - 本插件命名空间的翻译函数（行标题要能被它读到）。
 */
export function registerPanelEntry(ctx: Context, t: Translate): void {
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: MAIN_PANEL_KEY,
    order: 20,
    label: () => t('host.title'),
    locale: LOCALE_NAMESPACE,
  }, PanelMark))
}
