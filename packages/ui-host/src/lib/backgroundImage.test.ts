// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest"
import {
  normalizePersistedBackgroundImageUrl,
  sanitizePersistedBackgroundImageUrl,
  toBackgroundImageCssUrl,
} from "./backgroundImage"

afterEach(() => {
  delete window.__XIRANITE_BACKEND__
})

describe("background image config", () => {
  test("persists inline image URLs but not transient blob URLs", () => {
    expect(normalizePersistedBackgroundImageUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc")
    expect(normalizePersistedBackgroundImageUrl("blob:http://localhost/abc")).toBeUndefined()
    expect(sanitizePersistedBackgroundImageUrl("data:image/jpeg;base64,abc")).toBe("data:image/jpeg;base64,abc")
  })

  test("persists local paths and external URLs", () => {
    expect(normalizePersistedBackgroundImageUrl(" C:/Images/bg.jpg ")).toBe("C:/Images/bg.jpg")
    expect(normalizePersistedBackgroundImageUrl("https://example.com/bg.jpg")).toBe("https://example.com/bg.jpg")
  })

  test("serves local paths through the local backend when rendering CSS", () => {
    window.__XIRANITE_BACKEND__ = { baseUrl: "http://127.0.0.1:41000", token: "token" }

    expect(toBackgroundImageCssUrl("D:/Images/bg.jpg")).toBe(
      "http://127.0.0.1:41000/local-files?path=D%3A%2FImages%2Fbg.jpg&token=token",
    )
    expect(toBackgroundImageCssUrl("https://example.com/bg.jpg")).toBe("https://example.com/bg.jpg")
  })
})
