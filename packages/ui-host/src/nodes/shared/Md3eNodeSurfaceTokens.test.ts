// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest"
import { ensureMd3eNodeStylesInjected } from "./Md3eShapeContext"

function declaration(styles: string, token: string): string | undefined {
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return styles.match(new RegExp(`(?:^|\\n)\\s*${escaped}:\\s*([^;]+);`))?.[1]?.trim()
}

function usesSystemRole(styles: string, token: string, role: string): boolean {
  return declaration(styles, token)?.startsWith(`var(--md-sys-color-${role},`) ?? false
}

afterEach(() => {
  document.getElementById("xaihi-md3e-node-surface-styles")?.remove()
})

describe("MD3E node surface color roles", () => {
  test("injects complete MD3 system-role aliases instead of falling through to Wuling accents", () => {
    ensureMd3eNodeStylesInjected()
    const styles = document.getElementById("xaihi-md3e-node-surface-styles")?.textContent ?? ""
    const roles = [
      ["primary", "primary"], ["on-primary", "on-primary"], ["primary-container", "primary-container"], ["on-primary-container", "on-primary-container"],
      ["secondary", "secondary"], ["on-secondary", "on-secondary"], ["secondary-container", "secondary-container"], ["on-secondary-container", "on-secondary-container"],
      ["tertiary", "tertiary"], ["on-tertiary", "on-tertiary"], ["tertiary-container", "tertiary-container"], ["on-tertiary-container", "on-tertiary-container"],
      ["error", "error"], ["on-error", "on-error"], ["error-container", "error-container"], ["on-error-container", "on-error-container"], ["outline", "outline"],
      ["surface-lowest", "surface-container-lowest"], ["surface-low", "surface-container-low"], ["surface", "surface-container"],
      ["surface-high", "surface-container-high"], ["surface-highest", "surface-container-highest"],
    ]

    for (const [alias, role] of roles) {
      expect(usesSystemRole(styles, `--md3e-${alias}`, role), alias).toBe(true)
    }
  })

  test("rejects the previous secondary-container alias for primary-container", () => {
    const historicalMapping = "--md3e-primary-container: color-mix(in oklab, var(--md-sys-color-secondary-container, var(--secondary)) 72%, var(--md-sys-color-surface-container-high, var(--muted)));"
    expect(usesSystemRole(historicalMapping, "--md3e-primary-container", "primary-container")).toBe(false)

    ensureMd3eNodeStylesInjected()
    const styles = document.getElementById("xaihi-md3e-node-surface-styles")?.textContent ?? ""
    expect(usesSystemRole(styles, "--md3e-primary-container", "primary-container")).toBe(true)
  })
})
