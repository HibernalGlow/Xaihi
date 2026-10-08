import type { NodeDef } from "@hibernalglow/xaihi-contract"

export const def = {
  id: "encodeb",
  name: "Encodeb",
  version: "0.1.0",
  category: "file",
  description: "Preview and recover garbled filenames by re-decoding path components.",
  icon: "FileText",
  keywords: ["encoding", "filename", "mojibake", "cp437", "cp936"],
} satisfies NodeDef
