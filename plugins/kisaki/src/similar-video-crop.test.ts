import { describe, expect, test } from "vitest"

import { resolveKisakiSimilarVideoCrop, toNativeVideoCropDetect } from "./similar-video-crop.js"

describe("similar-video crop compatibility", () => {
  test.each([
    [{ similarVideosCropDetect: "none" }, { letterboxCrop: false, motionDetectionRemoved: false }],
    [{ similarVideosCropDetect: "letterbox" }, { letterboxCrop: true, motionDetectionRemoved: false }],
    [{ similarVideosCropDetect: "motion" }, { letterboxCrop: true, motionDetectionRemoved: true }],
    [{}, { letterboxCrop: true, motionDetectionRemoved: false }],
    [{ similarVideosLetterboxCrop: false, similarVideosCropDetect: "motion" }, { letterboxCrop: false, motionDetectionRemoved: false }],
  ])("normalizes %o", (input, expected) => {
    expect(resolveKisakiSimilarVideoCrop(input)).toEqual(expected)
  })

  test("only sends Czkawka 12 crop modes to the native adapter", () => {
    expect(toNativeVideoCropDetect(true)).toBe("letterbox")
    expect(toNativeVideoCropDetect(false)).toBe("none")
  })
})
