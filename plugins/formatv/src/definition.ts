import type { NodeDef } from "@hibernalglow/xaihi-contract"

export const def = {
  id: "formatv",
  name: "FormatV",
  version: "0.1.0",
  category: "video",
  description: "Scan video folders, add/remove .nov suffixes, and check prefixed duplicates.",
  icon: "Video",
  keywords: ["video", "nov", "duplicate", "prefix"],
} satisfies NodeDef
