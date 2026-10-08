import type { NodeDef } from "@hibernalglow/xaihi-contract"

export const def = {
  id: "bitv",
  name: "BitV",
  version: "0.1.0",
  category: "video",
  description: "Analyze video bitrate with ffprobe and classify files without overwriting existing data.",
  icon: "Gauge",
  keywords: ["video", "bitrate", "ffprobe", "classification"],
} satisfies NodeDef
