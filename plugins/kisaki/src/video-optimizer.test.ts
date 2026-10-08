import { describe, expect, test } from "vitest"

import { createVideoOptimizationPlan } from "./video-optimizer.js"

describe("Kisaki video optimization plans", () => {
  const entries = [
    { id: "transcode", groupId: 0, path: "D:/videos/transcode.mp4", name: "transcode.mp4", size: 1, modifiedDate: 1, codec: "h264" },
    { id: "crop", groupId: 0, path: "D:/videos/crop.mp4", name: "crop.mp4", size: 1, modifiedDate: 1, codec: "h264", videoCropRect: { left: 0, top: 120, right: 1920, bottom: 960 } },
  ]

  test("keeps the crop operation bound to a selected scanned rectangle", () => {
    expect(createVideoOptimizationPlan(entries, ["D:/videos/transcode.mp4", "D:/videos/crop.mp4"], "crop")).toEqual([
      { path: "D:/videos/crop.mp4", codec: "h264", cropRect: { left: 0, top: 120, right: 1920, bottom: 960 } },
    ])
  })

  test("does not carry mutable scan entry objects into the operation plan", () => {
    const plan = createVideoOptimizationPlan(entries, ["D:/videos/crop.mp4"], "transcode")
    expect(plan).toEqual([{ path: "D:/videos/crop.mp4", codec: "h264", cropRect: { left: 0, top: 120, right: 1920, bottom: 960 } }])
    expect(plan[0]?.cropRect).not.toBe(entries[1]?.videoCropRect)
  })
})
