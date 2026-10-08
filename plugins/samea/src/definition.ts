/**
 * 节点定义的独立模块：GUI 面只要 `def`，而包根 barrel 还 `export * from "./core.ts"`，
 * 从裸包名取值会把那份引擎图一并拉进浏览器分块（ADR-0074 §5）。定义住在这里，面就能只取数据。
 * 形状保持包内原样（同一份 def 从 index.ts 整体搬来，未重排字段）。
 */
import type { NodeDef } from "@hibernalglow/xaihi-contract"

export const def = {
  id: "samea", name: "SameA", version: "0.1.0", category: "file",
  description: "Extract artist metadata from archive names and organize matching archives.", icon: "ScanSearch",
  keywords: ["artist", "archive", "organize", "extract", "classification"],
} satisfies NodeDef
