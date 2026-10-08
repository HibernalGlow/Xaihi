/**
 * 节点定义的独立模块：GUI 面只要 `def`，而包根 barrel 还 `export * from "./core.ts"`，
 * 从裸包名取值会把那份引擎图一并拉进浏览器分块（ADR-0074 §5）。定义住在这里，面就能只取数据。
 */
import type { NodeDef } from "@hibernalglow/xaihi-contract"

export const def = {
  id: "timeu",
  name: "TimeU",
  version: "0.1.0",
  category: "file",
  description: "Back up and restore file timestamps from JSON records.",
  icon: "Clock3",
  keywords: ["timestamp", "backup", "restore", "mtime", "atime"],
} satisfies NodeDef
