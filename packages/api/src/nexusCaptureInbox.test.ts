import { describe, expect, test } from "vitest"
import { NexusCaptureInbox } from "./nexusCaptureInbox.js"

describe("NexusCaptureInbox", () => {
  test("queues, filters, and removes browser captures", () => {
    let nextId = 0
    const inbox = new NexusCaptureInbox(() => `capture-${++nextId}`, () => new Date("2026-07-23T12:00:00.000Z"))
    const lorat = inbox.add({
      version: 1,
      targetNodeId: "lorat",
      kind: "selection",
      source: { url: "https://example.com/model", capturedAt: "2026-07-23T11:59:00.000Z" },
      content: { text: "blue hair" },
    })
    inbox.add({
      version: 1,
      targetNodeId: "neoview",
      kind: "image",
      source: { url: "https://example.com/cover.jpg", capturedAt: "2026-07-23T11:59:00.000Z" },
    })

    expect(inbox.list("lorat")).toEqual([lorat])
    expect(inbox.remove(lorat.id)).toBe(true)
    expect(inbox.list("lorat")).toEqual([])
    expect(inbox.remove("missing")).toBe(false)
  })
})
