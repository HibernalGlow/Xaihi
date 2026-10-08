import type { CzkawkaInfo } from "./index.js"

export interface CzkawkaBindingRequirement {
  minimumApiVersion: number
  requiredCapabilities?: readonly string[]
}

export interface CzkawkaCompatibilityResult {
  compatible: boolean
  missingCapabilities: string[]
  message?: string
}

export function checkCzkawkaCompatibility(
  info: CzkawkaInfo,
  requirement: CzkawkaBindingRequirement,
): CzkawkaCompatibilityResult {
  if (info.apiVersion < requirement.minimumApiVersion) {
    return {
      compatible: false,
      missingCapabilities: [],
      message: `Czkawka Node-API v${info.apiVersion} is older than required v${requirement.minimumApiVersion}.`,
    }
  }
  const available = new Set(info.capabilities ?? [])
  const missingCapabilities = [...new Set(requirement.requiredCapabilities ?? [])].filter(
    (capability) => !available.has(capability),
  )
  return missingCapabilities.length
    ? {
        compatible: false,
        missingCapabilities,
        message: `Czkawka binding is missing: ${missingCapabilities.join(", ")}.`,
      }
    : { compatible: true, missingCapabilities: [] }
}

export function assertCzkawkaCompatibility(
  info: CzkawkaInfo,
  requirement: CzkawkaBindingRequirement,
): void {
  const result = checkCzkawkaCompatibility(info, requirement)
  if (!result.compatible) throw new Error(result.message)
}
