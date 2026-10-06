import type { AppNodeEntry } from "@xiranite/contract"
import { def } from "@xiranite/node-recycleu/definition"
import { Component } from "./Component"

// GUI 面不带引擎（ADR-0074 §5）：那份 TS core 只在宿主内的 QuickJS 里求值，浏览器这一侧只登记定义与视图。
// `entry.core` 没有任何宿主代码路径读它（见 `packages/contract/src/index.ts` 里 `AppNodeEntry.core` 的注释），
// 入口带上 `core` 等于在面进程里放行第二台执行宿主。
// 界面要跑动作只走 `/operations`：`./Component.tsx` 用 `host.runner.run ?? host.actions.run`。
// `def` 取自包的 `./definition` 子路径而不是包根 barrel——`packages/nodes/recycleu/src/index.ts` 仍
// `export * from "./core.js"`，从裸包名取值会把整份引擎图一并拉进 GUI chunk。那条图边已由 `./definition`
// 断掉，`entry.browser.test.tsx` 里的源码断言守着它不回归。
export default {
  def,
  Component,
} satisfies AppNodeEntry<Record<string, never>>
