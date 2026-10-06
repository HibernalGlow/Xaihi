/* @jsxImportSource @opentui/react */
import { testRender } from "@opentui/react/test-utils"
import { act } from "react"
import { expect, test } from "bun:test"
import { createLogEnvelope, createLogSession } from "./schema.js"
import { LogTui } from "./Tui.js"

test("LogTui renders sessions, queried events, and details", async () => {
  const session = createLogSession("2026-07-23T00:00:00.000Z")
  const event = createLogEnvelope({
    severityText: "error", eventName: "reader.failed", body: "Page decode failed",
    resource: { serviceName: "xiranite", processType: "frontend" }, scope: { name: "neoview.reader" }, session,
    error: { name: "DecodeError", message: "invalid image" },
  })
  const view = await testRender(<LogTui events={[event]} directory="D:/logs" onExit={() => undefined} />, { width: 140, height: 36 })
  try {
    await act(async () => view.renderOnce())
    const frame = view.captureCharFrame()
    expect(frame).toContain("XIRANITE LOG EXPLORER")
    expect(frame).toContain("reader.failed")
    expect(frame).toContain("DecodeError: invalid image")
  } finally {
    await act(async () => view.renderer.destroy())
  }
})
