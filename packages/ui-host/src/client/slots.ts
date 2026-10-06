/**
 * Xaihi 声明的插槽。
 *
 * `children` 的键就是声明本身（一键一声明者），所以这些键名是公开契约：改名等于
 * 让已装插件的贡献静默消失。键一律带 `xaihi.` 前缀——插槽命名空间是全局扁平的，
 * 与 DSH 自有键撞名会直接抛 duplicate declaration。
 *
 * @module xaihi-ui/slots
 */

import type {} from '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** 工作台顶部工具条（list，root 作用域）。 */
    'xaihi.toolbar': { kind: 'list'; scope: 'root' }
    /** 工作台底部状态条（list，root 作用域）。 */
    'xaihi.status': { kind: 'list'; scope: 'root' }
    /** 当前面板标题右侧的动作区（list，root 作用域）。 */
    'xaihi.panel.action': { kind: 'list'; scope: 'root' }
  }
}

/** 工作台自己的槽键，供清单项 `slotFills[].slot` 引用。 */
export const XAIHI_SLOTS = ['xaihi.toolbar', 'xaihi.status', 'xaihi.panel.action'] as const
export type XaihiSlot = (typeof XAIHI_SLOTS)[number]
