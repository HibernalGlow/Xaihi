import { describe, expect, it } from "vitest"
import { appendUrlPath } from "./http-url.js"

describe("appendUrlPath", () => {
  it("preserves a base path while resolving an absolute-style API path", () => {
    const url = appendUrlPath(
      "http://wails.localhost/_xiranite/backend",
      "/reader/s/session%2F1/page/page%202?token=secret",
    )

    expect(url.href).toBe(
      "http://wails.localhost/_xiranite/backend/reader/s/session%2F1/page/page%202?token=secret",
    )
  })

  it("keeps direct listener URLs unchanged apart from the appended path", () => {
    expect(appendUrlPath("http://127.0.0.1:4319", "/health").href).toBe("http://127.0.0.1:4319/health")
  })
})
