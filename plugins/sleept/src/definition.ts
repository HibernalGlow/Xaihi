/**
 * 节点定义的独立模块：GUI 面只要 `def`，而包根 barrel 还 `export * from "./core.ts"`，
 * 从裸包名取值会把那份引擎图一并拉进浏览器分块（ADR-0074 §5）。定义住在这里，面就能只取数据。
 */
import type { NodeDef } from "@hibernalglow/xaihi-contract"

export const def = {
  id: "sleept",
  name: "Sleept",
  version: "0.1.0",
  category: "system",
  description: "System timer for countdown, scheduled time, network, and CPU triggers.",
  icon: "Clock",
  keywords: ["timer", "sleep", "shutdown", "cpu", "network"],
} satisfies NodeDef
