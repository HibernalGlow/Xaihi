import { describe, expect, test } from "vitest"
import { browserPopupSessionKey, createBrowserPopupToken, isOwnedBrowserPopup } from "./browserPopup"

describe("browser popup ownership", () => {
  test("uses a per-component session key and accepts the matching token", () => {
    const token = createBrowserPopupToken()
    const values = new Map([[browserPopupSessionKey("component-1"), token]])
    const opener = {
      location: { origin: "http://127.0.0.1:5188" },
      sessionStorage: { getItem: (key: string) => values.get(key) ?? null },
    }

    expect(isOwnedBrowserPopup(opener, "http://127.0.0.1:5188", "component-1", token)).toBe(true)
    expect(isOwnedBrowserPopup(opener, "http://127.0.0.1:5188", "component-1", "stale")).toBe(false)
    expect(isOwnedBrowserPopup(opener, "http://127.0.0.1:5188", "component-2", token)).toBe(false)
  })

  test("rejects a restored popup from another origin", () => {
    const opener = {
      location: { origin: "http://127.0.0.1:5188" },
      sessionStorage: { getItem: () => "token" },
    }

    expect(isOwnedBrowserPopup(opener, "http://127.0.0.1:3199", "component-1", "token")).toBe(false)
    expect(isOwnedBrowserPopup(null, "http://127.0.0.1:5188", "component-1", "token")).toBe(false)
  })
})
