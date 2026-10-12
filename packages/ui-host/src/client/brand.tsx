/**
 * 工作台占住壳的品牌槽：侧栏那个标记与名字改成 Xaihi 自己的。
 *
 * 为什么是占槽而不是打补丁改上游：那两个槽本来就是留给部署方替换的
 * （`packages/client/ui-sidebar/src/client/contract/slots.ts` 的注释写着 "deployments may replace
 * the shell's fish fallback"，`kind: 'single'`），而上游品牌包 README 也写明"占槽是唯一的组合通路"。
 * 上游那份 `ui-brand-official` 用默认优先级 0 注册，而 `single` 槽取**最小** priority 渲染
 * （`docs/subsystems/slots.md`），所以这里用 `-1` 压过它——**同优先级撞位会抛错点名占位者**，
 * 这一点是实测约束，不是约定。
 *
 * 美术取舍：本仓没有 Xaihi 的标志美术，也不手画一个；标记槽用**排印式字母标**（主题字体的 X），
 * 名字槽走本包自己的 locale 字典。两处都带 `data-xaihi-brand` 供读回。
 * @module xaihi-ui/client/brand
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { Translate } from './locales.ts'

/** 排印式字母标：不引入新美术，用当前字体排一个 X。 */
export function XaihiBrandMark() {
  return (
    <svg data-xaihi-brand="mark" width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
      <text x="16" y="24" textAnchor="middle" fontSize="24" fontWeight="700" fill="currentColor">X</text>
    </svg>
  )
}

/**
 * 侧栏展开时显示的名字。
 * @param props - 文案由本包的 locale 座位给出（`t` 来自注册时的绑定，不读壳传的 props）。
 * @returns Name element carrying the brand readback hook.
 */
export function XaihiBrandName(props: { readonly label: string }) {
  return <span data-xaihi-brand="name">{props.label}</span>
}

/**
 * Register the Xaihi brand occupants over the official ones.
 * @param ctx - Client root context providing the slot registry.
 * @param t - This package's locale seat for the brand name.
 */
export function registerXaihiBrand(ctx: Context, t: Translate): void {
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark', priority: -1 }, XaihiBrandMark))
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -1 },
    () => XaihiBrandName({ label: t('brand.name') })))
}
