import type { AppNodeEntry, NodeSchema } from "@xiranite/contract"
import { def } from "@xiranite/node-findz/definition"
import { z } from "zod"
import { Component } from "./Component"
import type { FindzCardState } from "./types"

export const findzDataSchema = z
  .object({
    libraryRoot: z.string().optional(),
    libraryId: z.string().optional(),
    pathPrefix: z.string().optional(),
    text: z.string().optional(),
    rules: z.unknown().optional(),
    sortBy: z.string().optional(),
    sortDesc: z.boolean().optional(),
    areaBy: z.string().optional(),
    selectedArchiveId: z.number().int().positive().optional(),
    taskId: z.string().optional(),
    pageCursor: z.string().optional(),
  })
  .passthrough()

// GUI 面不带引擎（ADR-0074 §5）：那份 TS core 只在宿主内的 QuickJS 里求值，浏览器这一侧只登记定义与视图。
// `entry.core` 没有任何宿主代码路径读它（见 `packages/contract/src/index.ts` 里 `AppNodeEntry.core` 的注释），
// 按值把 `core` 挂进入口就是把 Findz 的执行器（dist/core.js，约 12 KB）连同动作词表放进面进程。
// `def` 走 `@xiranite/node-findz/definition` 这条 definition-only 子路径，不再碰仍 `export * from "./core.js"` 的包根 barrel
// （尺：`scripts/audit-face-execution-path.ts` 把裸包名也算一条 core 边）。
// 界面要跑动作只走 `/operations`：`./Component.tsx` 经 `host.runner.run("findz", input)` → `@/nodes/shared/api`。
const entry = {
  def,
  Component,
  host: {
    contractVersion: "^1.0.0",
    capabilities: ["state", "runner", "clipboard", "config", "env"],
  },
  schemas: {
    data: findzDataSchema as unknown as NodeSchema<FindzCardState>,
    config: findzDataSchema.partial() as unknown as NodeSchema<Partial<FindzCardState>>,
  },
} satisfies AppNodeEntry<Record<string, never>, FindzCardState, Partial<FindzCardState>>

export default entry
