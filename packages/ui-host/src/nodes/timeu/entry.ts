import type { AppNodeEntry } from "@xiranite/contract"
import type { TimeuCardState } from "./types"
import { def } from "@xiranite/node-timeu/definition"
import { Component } from "./Component"

// GUI 面不带引擎（ADR-0074 §5）：那份 TS core 只在宿主内的 QuickJS 里求值，浏览器这一侧只登记定义与视图。
// `entry.core` 没有任何宿主代码路径读它（见 `packages/contract/src/index.ts` 里 `AppNodeEntry.core` 的注释），
// 值导入 `@xiranite/node-timeu` 的 `core` 只会把 dist/core.js（实测 8,126 字节）那台执行器连同时间戳动作
// 词表拉进 GUI chunk —— 面里能跑节点逻辑，就是协议之外的第二个执行宿主。
// 界面要跑动作只走 `/operations`：`./Component.tsx` 经 `host.runner.run ?? host.actions.run`。
// `def` 取自包的 `./definition` 子路径而不是包根 barrel：包根还 `export * from "./core.js"`，从裸包名
// 取值会把整份引擎图一并拉进 GUI chunk。那条图边已由 `./definition` 断掉，源码断言守着它不回归。
export default {
  def,
  Component,
} satisfies AppNodeEntry<Record<string, never>, TimeuCardState, Partial<TimeuCardState>>
