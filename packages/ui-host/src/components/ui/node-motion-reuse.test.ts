import { readdirSync, readFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"

import { describe, expect, test } from "vitest"

/**
 * 状态动画与进度条在节点里必须是「用共享件」，不是各写各的。
 *
 * 存在理由：`audit:node-ui-quality` 只查文件存在性、`useNodeSurface`、`bg-card` 根与
 * 行数，看不见散写的 `animate-spin` 和手写动画条。本仓刚花一轮把 15 处散写图标动画收进
 * `RunStateIcon`、把三处动画宽度条收进 `Progress`，没有这把尺就会重新长回来。
 */

// 本文件在 src/components/ui/ 下 ⇒ 到仓库根是三层。
const ROOT = resolve(import.meta.dirname, "../../..")
const NODES = join(ROOT, "src/nodes")

/** 共享件自己的定义处就是唯一允许拼这些类名的地方。 */
const SANCTIONED = ["src/nodes/shared/controls.tsx"]

/**
 * 豁免表：必须写理由，且整条按「文件 + 规则」豁免，不放行任意新写法。
 */
const ALLOWED: Array<{ file: string; rule: string; reason: string }> = [
  {
    file: "src/nodes/recycleu/controls.tsx",
    rule: "animate-pulse",
    reason: "圆形 dial 的外环脉冲：RunStateIcon 是图标件、RunningTint/BorderBeam 是矩形流光，没有同形件可换；单点无重复可消除",
  },
]

const ANIMATED_WIDTH = /style=\{\{\s*width:\s*[`'"][^%]*%/

const RULES: Array<{ id: string; test: (line: string) => boolean; hint: string }> = [
  {
    id: "animate-spin",
    test: line => line.includes("animate-spin"),
    hint: "图标状态动画请走 RunStateIcon（src/nodes/shared/controls.tsx）",
  },
  {
    id: "animate-pulse",
    test: line => line.includes("animate-pulse"),
    hint: "图标状态动画请走 RunStateIcon；整块卡片染色请走 RunningTint",
  },
  {
    // 只抓「会动的宽度条」= 进度指示器。按类别着色的静态分布条是图表元素，
    // 换成 role=progressbar 反而是语义错，所以这里刻意不抓它。
    id: "animated-width-bar",
    test: line => line.includes("transition-[width]") && ANIMATED_WIDTH.test(line),
    hint: "进度条请用 @/components/ui/progress 的 Progress，不要自己拼宽度动画",
  },
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.tsx$/.test(entry.name)) out.push(full)
  }
  return out
}

function findViolations(sources: Map<string, string>): string[] {
  const hits: string[] = []
  for (const [file, text] of sources) {
    const lines = text.split("\n")
    for (const rule of RULES) {
      const n = lines.filter(rule.test).length
      if (!n) continue
      if (ALLOWED.some(a => a.file === file && a.rule === rule.id)) continue
      hits.push(`${file}: ${rule.id} ×${n} — ${rule.hint}`)
    }
  }
  return hits
}

function nodeSources(): Map<string, string> {
  const map = new Map<string, string>()
  for (const path of walk(NODES)) {
    const rel = relative(ROOT, path).replace(/\\/g, "/")
    if (/\.test\.tsx$|\.browser\.tsx$/.test(rel)) continue
    if (SANCTIONED.includes(rel)) continue
    map.set(rel, readFileSync(path, "utf8"))
  }
  return map
}

describe("nodes reuse the shared state-motion helpers", () => {
  test("the scanner can see every rule it claims to enforce (positive control)", () => {
    const fixture = new Map([
      ["src/nodes/__fixture__/Component.tsx", '<Icon className={cn("size-4", running && "animate-spin")} />'],
      ["src/nodes/__fixture__/panels.tsx", '<div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />'],
      ["src/nodes/__fixture__/badge.tsx", '<span className="animate-pulse">·</span>'],
    ])
    const hits = findViolations(fixture)

    expect(hits.map(h => h.split(": ")[1].split(" ×")[0]).sort()).toEqual([
      "animate-pulse",
      "animate-spin",
      "animated-width-bar",
    ])
  })

  test("an untouched line does not trigger the width rule (the rule is a conjunction)", () => {
    const fixture = new Map([["src/nodes/__fixture__/chart.tsx", '<div className="h-full rounded-full" style={{ width: `${share}%`, background: COLORS[i] }} />']])
    expect(findViolations(fixture)).toEqual([])
  })

  test("the sanctioned definition really spells those classes (the gate is not vacuous)", () => {
    const spelled = SANCTIONED.flatMap(f => (readFileSync(join(ROOT, f), "utf8").match(/animate-(spin|pulse)/g) ?? []))
    expect(spelled.length).toBeGreaterThan(0)
  })

  test("no node hand-rolls state animation or an animated width bar", () => {
    const hits = findViolations(nodeSources())
    expect(hits, `节点里又长出散写的状态动画/动画进度条：\n${hits.join("\n")}`).toEqual([])
  })

  test("every allow-list entry still has a reason and is still needed", () => {
    for (const entry of ALLOWED) {
      expect(entry.reason.length, `${entry.file} 的豁免没写理由`).toBeGreaterThan(12)
      const text = readFileSync(join(ROOT, entry.file), "utf8")
      expect(text, `${entry.file} 已不再使用 ${entry.rule}，把这条豁免删掉`).toContain(entry.rule)
    }
  })
})
