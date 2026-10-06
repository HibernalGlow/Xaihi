import type { AppNodeEntry } from "@xiranite/contract"
import type { LogxCardState } from "./types"
import { def } from "@xiranite/node-logx/definition"
import { Component } from "./Component"

// GUI 面不带引擎（ADR-0074 §5）：那份 TS core 只在宿主内的 QuickJS 里求值，浏览器这一侧只登记定义与视图。
// `entry.core` 没有任何宿主代码路径读它（见 `packages/contract/src/index.ts` 里 `AppNodeEntry.core` 的注释），
// 交出这个对象等于在面里放第二个执行宿主；界面跑动作只走 `/operations`（`./Component` 经 `host.runner`/`host.actions`）。
// `def` 取自包侧的 definition-only 子路径 `@xiranite/node-logx/definition`（clipm 先落地的形状）；
// 根 barrel 仍 `export * from "./core.js"`，从它取值就会把整份 core 图连进这个 chunk，那条边已随这条子路径断开。
export default { def, Component } satisfies AppNodeEntry<Record<string, never>, LogxCardState, Partial<LogxCardState>>
