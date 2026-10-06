/**
 * 浏览器那侧能取的桥入口：只有契约与两半桥，不含 `defineNode`。
 *
 * 为什么要单独一条：barrel 会把 `defineNode` 一起带出去，而它 import
 * `@deepseek-ai/dsh-tools`（Node 侧工具管线，内部用 node:os / node:fs）。
 * 文档那一侧只想要桥，从 barrel 取就等于把宿主管线打进浏览器产物 ——
 * 实测 `rspack build` 因此剩 3 条 `Reading from "node:*" is not handled`。
 * 这与 `src/operations.ts` 单列一个入口是同一条理由（见 tsdown.config.ts 的注释）。
 *
 * @module xaihi-sdk/bridge
 */

export * from './host-bridge.ts'
export * from './bridge-document.ts'
export * from './bridge-shell.ts'
// `UiBundleFace` 的产地是 wire.ts（清单里那一格的形状），但 barrel 会把 Node 侧管线带进来，
// 所以浏览器那侧从这条入口取。`export type` 不产生运行时请求，产物形状不变。
export type { UiBundleFace } from './wire.ts'
