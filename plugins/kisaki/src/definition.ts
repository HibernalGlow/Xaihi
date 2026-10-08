import type { NodeDef } from "./contract.js"

export const def = {
  id: "kisaki",
  name: "Kisaki",
  version: "0.1.0",
  category: "file",
  description: "Scan files with eleven Czkawka tools and manage results safely.",
  icon: "ScanSearch",
  keywords: ["duplicate", "empty", "similar", "broken", "cleanup", "czkawka"],
} satisfies NodeDef
