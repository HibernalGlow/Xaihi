// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest"
import {
  installNativeRangeProgressSync,
  syncAllNativeRangeProgress,
  syncNativeRangeProgress,
} from "./sliderSkin"

afterEach(() => {
  document.body.innerHTML = ""
  document.documentElement.removeAttribute("data-slider-style")
})

describe("native range slider skin progress", () => {
  test("writes --slider-progress from min/max/value", () => {
    const input = document.createElement("input")
    input.type = "range"
    input.min = "0"
    input.max = "100"
    input.value = "25"
    syncNativeRangeProgress(input)
    expect(input.style.getPropertyValue("--slider-progress")).toBe("25%")
    expect(input.dataset.sliderDirection).toBe("ltr")
    expect(input.style.getPropertyValue("--slider-direction")).toBe("ltr")
  })

  test("marks rtl direction for bottom-bar progress fill", () => {
    const input = document.createElement("input")
    input.type = "range"
    input.min = "0"
    input.max = "10"
    input.value = "3"
    input.dir = "rtl"
    syncNativeRangeProgress(input)
    expect(input.style.getPropertyValue("--slider-progress")).toBe("30%")
    expect(input.dataset.sliderDirection).toBe("rtl")
    expect(input.style.getPropertyValue("--slider-direction")).toBe("rtl")
  })

  test("does not create an attribute mutation when the range state is unchanged", async () => {
    const input = document.createElement("input")
    input.type = "range"
    document.body.append(input)
    syncNativeRangeProgress(input)

    let mutationCount = 0
    const observer = new MutationObserver((mutations) => { mutationCount += mutations.length })
    observer.observe(input, { attributes: true, attributeFilter: ["data-slider-direction"] })

    syncNativeRangeProgress(input)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mutationCount).toBe(0)
    observer.disconnect()
  })

  test("installs live listeners for input events and new range nodes", () => {
    document.documentElement.dataset.sliderStyle = "solid"
    const dispose = installNativeRangeProgressSync()
    const input = document.createElement("input")
    input.type = "range"
    input.min = "10"
    input.max = "50"
    input.value = "30"
    document.body.append(input)
    syncAllNativeRangeProgress(document)
    expect(input.style.getPropertyValue("--slider-progress")).toBe("50%")

    input.value = "50"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(input.style.getPropertyValue("--slider-progress")).toBe("100%")
    dispose()
  })
})
