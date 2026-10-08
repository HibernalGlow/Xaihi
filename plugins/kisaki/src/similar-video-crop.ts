export type KisakiVideoCropDetect = "letterbox" | "motion" | "none"

export interface KisakiSimilarVideoCropInput {
  similarVideosLetterboxCrop?: unknown
  similarVideosCropDetect?: unknown
}

export interface KisakiSimilarVideoCropResolution {
  letterboxCrop: boolean
  motionDetectionRemoved: boolean
}

/**
 * Czkawka 12 replaced the three-mode crop detector with a letterbox toggle.
 * New data always uses the boolean; the legacy enum remains read-compatible.
 */
export function resolveKisakiSimilarVideoCrop(
  input: KisakiSimilarVideoCropInput,
): KisakiSimilarVideoCropResolution {
  if (typeof input.similarVideosLetterboxCrop === "boolean") {
    return { letterboxCrop: input.similarVideosLetterboxCrop, motionDetectionRemoved: false }
  }
  if (input.similarVideosCropDetect === "none") {
    return { letterboxCrop: false, motionDetectionRemoved: false }
  }
  return {
    letterboxCrop: true,
    motionDetectionRemoved: input.similarVideosCropDetect === "motion",
  }
}

export function toNativeVideoCropDetect(letterboxCrop: boolean): "letterbox" | "none" {
  return letterboxCrop ? "letterbox" : "none"
}
