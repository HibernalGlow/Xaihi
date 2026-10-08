import type { NodeDef } from "@hibernalglow/xaihi-contract"

export const def = {
  id: "cleanf",
  name: "Cleanf",
  version: "0.1.0",
  category: "file",
  description: "Remove empty folders, backup files, temp folders, and trash patterns.",
  icon: "Brush",
  keywords: ["cleanup", "empty-folders", "backup", "temp"],
} satisfies NodeDef
