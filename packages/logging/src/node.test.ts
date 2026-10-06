import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import { afterEach, describe, expect, it } from "vitest"

import { createLogEnvelope, type LogResource, type LogSession } from "./schema.js"
import { discoverLogFiles, LogWriteError, readLogDirectory, resolveLogDirectory, RotatingJsonlLogWriter } from "./node.js"

const tempDirectories: string[] = []
const resource: LogResource = { serviceName: "xiranite", processType: "test" }
const session: LogSession = { id: "session-writer", startedAt: "2026-07-23T00:00:00.000Z" }

afterEach(async () => {
  for (const directory of tempDirectories.splice(0)) await rm(directory, { recursive: true, force: true })
})

describe("RotatingJsonlLogWriter", () => {
  it("writes strict JSONL through rotating-file-stream and reads it through the shared parser", async () => {
    const directory = await mkdtemp(join(tmpdir(), "xiranite-logs-"))
    tempDirectories.push(directory)
    const writer = new RotatingJsonlLogWriter({ directory, source: "frontend", sessionId: session.id, size: "1M", compress: false })
    await writer.append([
      createLogEnvelope({ id: "event-one", timestamp: "2026-07-23T00:00:01.000Z", severityText: "info", eventName: "session.started", resource, scope: { name: "app" }, session }),
      createLogEnvelope({ id: "event-two", timestamp: "2026-07-23T00:00:02.000Z", severityText: "error", eventName: "reader.failed", resource, scope: { name: "neoview.reader" }, session, error: { name: "Error", message: "failed" } }),
    ])
    await writer.close()

    const files = await discoverLogFiles(directory)
    expect(files).toHaveLength(1)
    const text = await readFile(files[0]!, "utf8")
    expect(text.trim().split("\n")).toHaveLength(2)
    expect(text).not.toContain("---- session")
    const result = await readLogDirectory(directory)
    expect(result.issues).toEqual([])
    expect(result.events.map((event) => event.eventName)).toEqual(["session.started", "reader.failed"])
  })

  it("rotates only by size and names compressed files as JSONL gzip", async () => {
    const directory = await mkdtemp(join(tmpdir(), "xiranite-logs-"))
    tempDirectories.push(directory)
    const writer = new RotatingJsonlLogWriter({ directory, source: "frontend", sessionId: session.id, size: "1B" })
    await writer.append([
      createLogEnvelope({
        id: "event-rotated",
        timestamp: "2026-07-23T00:00:01.000Z",
        severityText: "info",
        eventName: "session.rotated",
        resource,
        scope: { name: "app" },
        session,
      }),
    ])
    await writer.close()

    const files = await discoverLogFiles(directory)
    expect(files.some((file) => file.endsWith(".jsonl.gz"))).toBe(true)
    expect(files.filter((file) => file.endsWith(".jsonl") && !file.endsWith(".current.jsonl"))).toEqual([])
    const result = await readLogDirectory(directory)
    expect(result.issues).toEqual([])
    expect(result.events.map((event) => event.eventName)).toEqual(["session.rotated"])
  })

  it("does not create empty time rotations in a positive-offset time zone", async () => {
    const directory = await mkdtemp(join(tmpdir(), "xiranite-logs-"))
    tempDirectories.push(directory)
    const previousTimezone = process.env.TZ
    process.env.TZ = "Asia/Hong_Kong"
    try {
      const writer = new RotatingJsonlLogWriter({ directory, source: "frontend", sessionId: session.id, size: "1M" })
      await writer.append([
        createLogEnvelope({
          id: "event-idle",
          timestamp: "2026-07-23T00:00:01.000Z",
          severityText: "info",
          eventName: "session.idle",
          resource,
          scope: { name: "app" },
          session,
        }),
      ])
      await new Promise((resolve) => setTimeout(resolve, 50))
      await writer.close()

      const files = await discoverLogFiles(directory)
      expect(files.map((file) => file.slice(directory.length + 1))).toEqual(["frontend-session-writer.current.jsonl"])
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ
      else process.env.TZ = previousTimezone
    }
  })

  it("identifies the exact log target and system cause when an append fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiranite-logs-error-"))
    tempDirectories.push(root)
    const blockingFile = join(root, "not-a-directory")
    const directory = join(blockingFile, "logs")
    await writeFile(blockingFile, "blocks directory creation")
    const writer = new RotatingJsonlLogWriter({ directory, source: "frontend", sessionId: session.id, size: "1M" })
    const event = createLogEnvelope({
      id: "event-write-error",
      timestamp: "2026-07-23T00:00:01.000Z",
      severityText: "error",
      eventName: "logging.write_failed",
      resource,
      scope: { name: "logging" },
      session,
    })

    try {
      const failure = await writer.append([event]).catch((error: unknown) => error)
      expect(failure).toMatchObject({
        name: "LogWriteError",
        operation: "logWriter.append",
        logFile: join(directory, "frontend-session-writer.current.jsonl"),
        eventCount: 1,
      } satisfies Partial<LogWriteError>)
      expect((failure as Error).message).toContain(JSON.stringify(join(directory, "frontend-session-writer.current.jsonl")))
      await expect(writer.append([event])).rejects.toMatchObject({
        name: "LogWriteError",
        logFile: join(directory, "frontend-session-writer.current.jsonl"),
      })
    } finally {
      await writer.close().catch(() => undefined)
    }
  })

  it("reads legacy gzip rotations that were incorrectly named as plain JSONL", async () => {
    const directory = await mkdtemp(join(tmpdir(), "xiranite-logs-"))
    tempDirectories.push(directory)
    const event = createLogEnvelope({
      id: "event-legacy-gzip",
      timestamp: "2026-07-23T00:00:01.000Z",
      severityText: "warn",
      eventName: "logging.legacy_gzip",
      resource,
      scope: { name: "logging" },
      session,
    })
    await writeFile(join(directory, "frontend-session.20260723.1.jsonl"), gzipSync(`${JSON.stringify(event)}\n`))
    await writeFile(join(directory, "frontend-session.20260723.2.jsonl"), gzipSync(""))

    const result = await readLogDirectory(directory)
    expect(result.issues).toEqual([])
    expect(result.events.map((item) => item.eventName)).toEqual(["logging.legacy_gzip"])
  })

  it("resolves the production log folder and environment override", () => {
    expect(resolveLogDirectory(undefined, { XIRANITE_LOG_DIR: "custom-logs" })).toBe(join(process.cwd(), "custom-logs"))
    expect(resolveLogDirectory()).toContain("logs")
  })
})
