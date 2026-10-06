import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import type { CliHost } from "@xiranite/cli-runtime"
import { createLogEnvelope, createLogSession } from "./schema.js"
import { RotatingJsonlLogWriter } from "./node.js"
import { runProgram } from "./cli.js"

const directories: string[] = []

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe("xlogs CLI", () => {
  it("queries and aggregates the shared structured log source", async () => {
    const directory = await mkdtemp(join(tmpdir(), "xlogs-cli-"))
    directories.push(directory)
    const session = createLogSession("2026-07-23T00:00:00.000Z")
    const writer = new RotatingJsonlLogWriter({ directory, source: "test", sessionId: session.id, compress: false })
    await writer.append([
      createLogEnvelope({ severityText: "info", eventName: "app.started", resource: { serviceName: "xiranite", processType: "test" }, scope: { name: "app" }, session }),
      createLogEnvelope({ severityText: "error", eventName: "reader.failed", resource: { serviceName: "xiranite", processType: "test" }, scope: { name: "neoview.reader" }, session, error: { name: "Error", message: "failed" } }),
    ])
    await writer.close()

    const output: string[] = []
    const host = createTestHost(output)
    await runProgram(["query", "--dir", directory, "--level", "error", "--json"], host)
    const queried = JSON.parse(output.join("")) as Array<{ eventName: string }>
    expect(queried.map((event) => event.eventName)).toEqual(["reader.failed"])

    output.length = 0
    await runProgram(["doctor", "--dir", directory, "--json"], host)
    expect(JSON.parse(output.join(""))).toMatchObject({ files: 1, events: 2, issues: [] })
  })
})

function createTestHost(output: string[]): CliHost {
  return {
    cwd: process.cwd(), env: {}, stdin: { isTTY: false } as CliHost["stdin"],
    stdout: { isTTY: false, write: (chunk) => output.push(String(chunk)) },
    stderr: { isTTY: false, write: (chunk) => output.push(String(chunk)) },
  }
}
