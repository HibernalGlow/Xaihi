import { readFileSync } from "node:fs"
import { resolve } from "node:path"

import { describe, expect, test } from "vitest"

/**
 * 端口件的颜色必须走设计 token，否则覆盖型皮肤接管不了它。
 *
 * 这把尺只查「默认值里的字面色」——端口件允许在运行时按实测色值换算（见
 * `src/lib/theme-color.ts`），但组件的默认外观不许把主题写死。
 */
const PORTED = [
  "rubber-segment.tsx",
  "hold-button.tsx",
  "lattice-loader.tsx",
  "status-mark.tsx",
  "option-wheel.tsx",
  "magnet-lines.tsx",
  "star-border.tsx",
  "spotlight-card.tsx",
  "magnet.tsx",
  "scroll-expand.tsx",
  "gradual-blur.tsx",
  "glass-surface.tsx",
  "noise.tsx",
  "border-glow.tsx",
  "glare-hover.tsx",
  "electric-border.tsx",
  "click-spark.tsx",
  "slosh-gauge.tsx",
]

/**
 * 这些件的默认色不是喂给 CSS，而是被 parseInt 或画进 canvas，所以走
 * `themeColourHex()` 现算。它们必须真的经过那座桥 —— 少了 import 就等于悄悄退回字面色。
 */
const BRIDGED = ["border-glow.tsx", "glare-hover.tsx", "electric-border.tsx", "click-spark.tsx", "slosh-gauge.tsx"]

/**
 * 例外表：每条例外必须写明为什么字面值不是主题色。
 * glass-surface 的两处是 SVG 渐变里的全透明停靠点（#0000 == rgba(0,0,0,0)），
 * 它表达的是「透明」而不是某个主题色，换成 var() 反而不会被解析。
 */
const ALLOWED_LITERALS: Record<string, string[]> = {
  "glass-surface.tsx": ['stop-color="#0000"'],
}

const HEX_DEFAULT = /\w+\s*=\s*["']#[0-9a-fA-F]{3,8}["']/g

function offendingLines(source: string): string[] {
  return source.split("\n").filter(line => HEX_DEFAULT.test(line))
}

const TW_BUILTINS = new Set(["spin", "pulse", "ping", "bounce"])

/**
 * 命名动画类（`animate-foo`，不含任意值 `animate-[...]`）若在本文件里没有同名
 * `@keyframes`、又不是 Tailwind 内建，就是「哑弹」——接上去动效静默不跑。
 */
function dudAnimations(source: string): string[] {
  // 先剥注释：端口文件里会提到上游用的类名（如 star-border 注释里的 animate-star-movement-*），
  // 那不是真实使用。
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
  const named = new Set((code.match(/animate-(?!\[)[a-zA-Z0-9_-]+/g) ?? []))
  return [...named].filter(cls => {
    const tail = cls.slice("animate-".length)
    if (TW_BUILTINS.has(tail)) return false
    return !new RegExp(`@keyframes\\s+${tail}\\b`).test(source)
  })
}

function exportsName(source: string, pascal: string): boolean {
  return new RegExp(`export \\{[^}]*\\b${pascal}\\b|export (?:default )?(?:function|const) ${pascal}\\b`).test(source)
}

describe("ported reactbits components keep colour on design tokens", () => {
  test("the scanner itself can see a violation (positive control)", () => {
    const control = `const x = { trackColor = '#27272a' }`
    expect(offendingLines(control)).toHaveLength(1)
    expect(offendingLines(`const y = { trackColor = "var(--muted)" }`)).toHaveLength(0)
  })

  test("the export-name check can see a mismatch (positive control)", () => {
    expect(exportsName("export { GradualBlurMemo }\nexport default GradualBlurMemo", "GradualBlur")).toBe(false)
    expect(exportsName("export { GradualBlurMemo, GradualBlurMemo as GradualBlur }", "GradualBlur")).toBe(true)
    expect(exportsName("export function RubberSegment() {}", "RubberSegment")).toBe(true)
  })

  /**
   * 端口件对外必须叫文件名那个名字。reactbits 里有组件的真名带后缀
   * （gradual-blur 的实现叫 `GradualBlurMemo`），只 re-export 默认值的话，
   * 消费者按目录习惯 import { GradualBlur } 会在构建期才炸。
   */
  test.each(PORTED)("%s exports the name its filename implies", file => {
    const source = readFileSync(resolve(import.meta.dirname, file), "utf8")
    const pascal = file.replace(/\.tsx$/, "").split("-").map(part => part[0].toUpperCase() + part.slice(1)).join("")
    expect(exportsName(source, pascal), `${file} 没有具名导出 ${pascal}`).toBe(true)
  })

  test.each(PORTED)("%s has no hardcoded colour default", file => {
    const source = readFileSync(resolve(import.meta.dirname, file), "utf8")
    const allowed = ALLOWED_LITERALS[file] ?? []
    const violations = offendingLines(source).filter(line => !allowed.some(literal => line.includes(literal)))

    expect(violations, `${file} 的默认值里写死了色值：\n${violations.join("\n")}`).toEqual([])
  })

  test("canvas-parsing ports really route their defaults through the token bridge", () => {
    for (const name of BRIDGED) {
      const source = readFileSync(resolve(import.meta.dirname, name), "utf8")
      const bridges = source.split('from "@/lib/theme-color"').length - 1
      expect(bridges, `${name} 的 themeColourHex import 应当恰好一条`).toBe(1)
      expect(source, `${name} 声明了桥却没用到`).toContain("themeColourHex(")
    }
  })

  test("no port relies on an animation utility this repo never defines (dud guard)", () => {
    // 正控：命名动画类若同文件没有 @keyframes 就必须被抓到；任意值 animate-[...] 与
    // Tailwind 内建（spin/pulse/ping/bounce）放行。
    expect(dudAnimations('className="animate-star-movement-bottom"')).toEqual(["animate-star-movement-bottom"])
    expect(dudAnimations('className="animate-[sm-breathe_1s]"')).toEqual([])
    expect(dudAnimations('className="animate-spin"')).toEqual([])
    expect(dudAnimations('@keyframes hb-pulse{}<div className="animate-hb-pulse" />')).toEqual([])

    for (const name of PORTED) {
      const source = readFileSync(resolve(import.meta.dirname, name), "utf8")
      const duds = dudAnimations(source)
      expect(duds, `${name} 引用了本仓不存在的动画类：${duds.join(", ")}`).toEqual([])
    }
  })

  test("every ported file records its provenance and licence condition", () => {
    for (const name of PORTED) {
      const source = readFileSync(resolve(import.meta.dirname, name), "utf8")
      expect(source, `${name} 缺出处注释`).toContain("reactbits")
      expect(source, `${name} 缺许可条件注释`).toContain("Commons Clause")
    }
  })
})
