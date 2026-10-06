/**
 * Xaihi 工作台浏览器半边。
 *
 * 依赖纪律沿用模板那一条：本半边不 value-import 任何宿主侧包，harness 客户端包
 * 只以 `import type` 出现（拉进 Context 与插槽表的声明合并，类型擦除后不产生模块
 * 请求）。React 来自浏览器模块表的 seed，是唯一实例。
 *
 * 与 DSH API 的关系：`ctx.slots.inject('main', …)` 等 `main` 被 ui-layout 声明后
 * 才注册（直接 register 到未声明槽会抛），注册的 `key` 即 `ctx.layout.selectPanel`
 * 接受的面板 id；`children` 的键就是 Xaihi 自己声明的插槽，贡献者同样必须用
 * `ctx.slots.inject`。面板组件的 props 直接用框架的 `Props*` 类型，不自己手写形状：
 * 手写会在 `exactOptionalPropertyTypes` 下与 `RenderSlotFn` 的方差打架。
 *
 * @module xaihi-ui/client
 */

import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type { PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { Context } from '@deepseek-ai/cordis'
import type { XaihiSlot } from './slots.ts'
import { LOCALE_NAMESPACE, en, zh, type LocaleKey, type Translate } from './locales.ts'
import { MAIN_PANEL_KEY, registerPanelEntry } from './panel-entry.tsx'
import { createRemoteLoader } from './loader/remote-modules.ts'
import { registerStyles } from './styles.ts'
import { WorkspaceRoot } from './workspace.tsx'

/** Xaihi 声明的插槽，`children` 与 props 类型共用这一份。 */
const CHILDREN = {
  'xaihi.toolbar': { kind: 'list', scope: 'root' },
  'xaihi.status': { kind: 'list', scope: 'root' },
  'xaihi.panel.action': { kind: 'list', scope: 'root' },
} as const

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Xaihi 工作台自身的文案。 */
    'xaihi.ui': LocaleKey
  }
}

/** 本插件依赖的服务。 */
export const inject = ['slots', 'locale']

/** 插槽框架交给面板组件的属性（框架真源，只取用到的两片）。 */
type ReceivedProps = PropsLocale<'xaihi.ui'> & PropsRenderSlots<XaihiSlot>

/** 当前界面语言；面板按它挑文案，缺省走英文。 */
function activeLocale(ctx: Context): 'zh' | 'en' {
  const snapshot = ctx.locale.getSnapshot()
  return typeof snapshot.active === 'string' && snapshot.active.startsWith('zh') ? 'zh' : 'en'
}

export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(LOCALE_NAMESPACE, { zh, en }), 'xaihi-ui: dictionaries')
  ctx.effect(() => registerStyles(), 'xaihi-ui: styles')

  // 侧栏那一行由 ui-sidebar 持有：显示标题、响应点击、调用 selectPanel 都是它的事，
  // 本插件只贡献标记与行标题，所以这里既不碰路由也不碰布局。
  registerPanelEntry(ctx, ctx.locale.bind(LOCALE_NAMESPACE) as Translate)

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: MAIN_PANEL_KEY,
    locale: LOCALE_NAMESPACE,
    children: CHILDREN,
  }, (props: ReceivedProps) => WorkspaceRoot({
    t: props.t as Translate,
    locale: activeLocale(ctx),
    renderSlot: (key) => props.renderSlot(key, {}),
  })))
}

/** 装载器构造入口，导出以便测试直接拿到远程模块后端。 */
export { createRemoteLoader }
