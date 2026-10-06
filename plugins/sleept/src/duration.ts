/**
 * 两条纯函数：把 `hours/minutes/seconds` 折成秒、把秒折成 `HH:MM:SS`。
 *
 * **函数体逐字来自** `<Xiranite>` tag `noxide` 的 `packages/nodes/sleept/src/core.ts`
 * 第 116-126 行（`countdownSeconds` 在第 116 行、`formatDuration` 在第 120 行），
 * 一字未改，本仓也没有第二份实现。搬到这个文件是**本包对基线的一处有意偏离**，
 * 理由不是"更干净"，而是这条边已经被消费者钉住了：
 *
 * - `packages/ui-host/src/nodes/sleept/Component.tsx:5` 是 **value-import**
 *   `@xiranite/node-sleept/duration` 的 `countdownSeconds` / `formatDuration`。
 *   让它指到 `src/core.ts` 就等于把 `runSleept` 和它注入的 `SleeptRuntime`
 *   （整只执行宿主）一起拖进工作台浏览器产物 —— ADR-0007 决定 4 禁的正是
 *   "面里能跑节点逻辑，就是协议之外的第二个执行宿主"。
 * - 上游 master 也做了同一刀（`duration.ts` 21 行）。本仓不引 master 的实现，
 *   **实现只从 noxide 那份抄**，这一条只借它的分法。
 *
 * `src/core.ts` 保留同名再导出，所以基线里从 `./core.js` 取这两条的消费者
 * （`src/interaction.ts:9-17`）不必改一行。
 *
 * @module xaihi-sleept/duration
 */

import type { SleeptInput } from "./core.ts"

export function countdownSeconds(input: Pick<SleeptInput, "hours" | "minutes" | "seconds">): number {
  return Math.max(0, Math.trunc(input.hours ?? 0) * 3600 + Math.trunc(input.minutes ?? 0) * 60 + Math.trunc(input.seconds ?? 0))
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.trunc(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}
