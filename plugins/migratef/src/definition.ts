import type { NodeDef } from "@hibernalglow/xaihi-contract"

export const def = {
  id: "migratef",
  name: "MigrateF",
  version: "0.1.0",
  category: "file",
  description: "Move or copy files with preserve, flat, and direct modes plus undo history.",
  icon: "FolderSync",
  keywords: ["copy", "move", "migration", "undo"],
} satisfies NodeDef
