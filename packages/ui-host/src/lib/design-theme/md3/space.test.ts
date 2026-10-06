import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, test } from "vitest"

import { MD3_SPACE_STEPS, MD3_SPACE_UNIT_VALUE, md3SpaceVars } from "./space"

/**
 * 这张表的判据不是「看起来对」，而是「和 Google 那份生成物逐条相等」。
 * 上游文件是 `@material/web/labs/gb/styles/space/md-space-tokens.scss`
 * （稳定字典 v0_192 里没有 spacing 组，只有这份 CSS 形态的表）。
 */
const UPSTREAM = path.resolve(
  import.meta.dirname,
  "../../../../node_modules/@material/web/labs/gb/styles/space/md-space-tokens.scss",
)

function upstreamDeclarations(): Record<string, string> {
  const text = readFileSync(UPSTREAM, "utf8")
  const out: Record<string, string> = {}
  for (const match of text.matchAll(/--md-sys-space-([a-z0-9]+):\s*([^;]+);/g)) {
    out[match[1] as string] = (match[2] as string).replace(/\s+/g, " ").trim()
  }
  return out
}

describe("md3 space scale provenance", () => {
  test("the local table has exactly the upstream set of steps", () => {
    const upstream = upstreamDeclarations()
    expect(Object.keys(MD3_SPACE_STEPS).sort()).toEqual(
      Object.keys(upstream).filter((key) => key !== "unit").sort(),
    )
    expect(upstream.unit).toBe(MD3_SPACE_UNIT_VALUE)
  })

  test("every emitted declaration is byte-equal to upstream", () => {
    const upstream = upstreamDeclarations()
    const vars = md3SpaceVars()
    expect(vars["--md-sys-space-unit"]).toBe(upstream.unit)
    for (const step of Object.keys(MD3_SPACE_STEPS)) {
      const name = `--md-sys-space-${step}`
      // 直接比整条声明：包含式断言会让 *5 混过 *0.5 这类错。
      expect(vars[name], name).toBe(upstream[step])
    }
  })

  test("the gauge can fail: a wrong multiplier is caught against upstream", () => {
    const upstream = upstreamDeclarations()
    const tampered = md3SpaceVars()
    tampered["--md-sys-space-400"] = "calc(var(--md-sys-space-unit) * 3.5)"
    const mismatches = Object.keys(MD3_SPACE_STEPS)
      .map((step) => `--md-sys-space-${step}`)
      .filter((name) => tampered[name] !== upstream[name.slice("--md-sys-space-".length)])
    expect(mismatches).toEqual(["--md-sys-space-400"])
  })
})
