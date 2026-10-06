import type { AppNodeEntry } from "@xiranite/contract"
import { def } from "@xiranite/node-dissolvef/definition"
import { Component } from "./Component"

// GUI 面不带引擎（ADR-0074 §5）：那份 TS core 只在宿主内的 QuickJS 里求值，浏览器这一侧只登记定义与视图。
// `entry.core` 没有任何宿主代码路径读它（见 `packages/contract/src/index.ts` 里 `AppNodeEntry.core` 的注释），
// 按值把 `core` 挂进入口就是把 `runDissolvef` 那台执行器（dist/core.js）连同动作词表放进面进程。
// `def` 也走 `@xiranite/node-dissolvef/definition` 这条 definition-only 子路径：包根 barrel 仍
// `export * from "./core.js"`，从包根取值会把整份 core 图再接回 GUI chunk（尺：`scripts/audit-face-execution-path.ts` 把裸包名也算一条 core 边）。
// 界面要跑动作只走 `/operations`：`./Component.tsx` 经 `host.runner` → `@/nodes/shared/api`。
export default {
  def,
  Component,
} satisfies AppNodeEntry<Record<string, never>>
