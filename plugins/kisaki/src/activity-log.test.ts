import { describe, expect, test } from "vitest"
import { appendKisakiActivityLog, filterKisakiActivityLog, formatKisakiActivityLogEntry, formatKisakiActivityMessage, serializeKisakiActivityLog } from "./activity-log.js"

describe("Kisaki activity log", () => {
  test("appends immutable bounded history", () => {
    const first = appendKisakiActivityLog([], { tool: "duplicate-files", kind: "scan", level: "info", message: "start", timestamp: 100 }, 2)
    const second = appendKisakiActivityLog(first, { tool: "duplicate-files", kind: "progress", level: "info", message: "hash", progress: 50, timestamp: 200 }, 2)
    const third = appendKisakiActivityLog(second, { tool: "duplicate-files", kind: "scan", level: "success", message: "done", timestamp: 300 }, 2)
    expect(first).toHaveLength(1)
    expect(third.map((entry) => entry.message)).toEqual(["hash", "done"])
  })

  test("filters all searchable fields", () => {
    const entries = [
      appendKisakiActivityLog([], { tool: "similar-images", kind: "progress", level: "info", message: "hashing", timestamp: 1 })[0]!,
      appendKisakiActivityLog([], { tool: "empty-files", kind: "operation", level: "error", action: "delete", message: "failed", timestamp: 2 })[0]!,
    ]
    expect(filterKisakiActivityLog(entries, "hash")).toHaveLength(1)
    expect(filterKisakiActivityLog(entries, "delete")).toHaveLength(1)
    expect(filterKisakiActivityLog(entries, "EMPTY")).toHaveLength(1)
  })

  test("uses one stable formatter for GUI CLI and TUI", () => {
    const entry = appendKisakiActivityLog([], { tool: "big-files", kind: "operation", level: "warning", action: "move", message: "partial", affectedCount: 3, errorCount: 1, timestamp: 0 })[0]!
    expect(formatKisakiActivityMessage("info", "scan", 42)).toBe("· [42%] scan")
    expect(formatKisakiActivityLogEntry(entry)).toContain("! partial · 3 affected / 1 errors")
    expect(serializeKisakiActivityLog([entry])).toContain("big-files · operation")
  })
})
