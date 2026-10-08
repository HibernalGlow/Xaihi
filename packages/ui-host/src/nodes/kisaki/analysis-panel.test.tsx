// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, test } from "vitest"
import type { KisakiEntry, KisakiGroup } from "@hibernalglow/xaihi-kisaki/core"
import { KisakiAnalysisView } from "./analysis-panel"

afterEach(cleanup)

describe("KisakiAnalysisView", () => {
  test("renders a format donut, byte bars, similarity levels, and live selection stats", () => {
    render(<KisakiAnalysisView tool="similar-images" groups={[group]} selectedPaths={["b.png"]} hashSize={16} />)
    expect(screen.getByRole("img", { name: "格式体积环形图" })).toBeTruthy()
    expect(screen.getAllByText(/\.png/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/\.jpg/).length).toBeGreaterThan(0)
    expect(screen.getByText("原始/相同")).toBeTruthy()
    expect(screen.getByText("高")).toBeTruthy()
    expect(screen.getAllByText("20 B")).toHaveLength(2)
    expect(screen.getByText("预计")).toBeTruthy()
  })

  test("renders normalized similar-video distance intervals", () => {
    render(<KisakiAnalysisView tool="similar-videos" groups={[{ ...group, entries: [entry("a.mp4", 10, "0.00"), entry("b.mp4", 20, "2.80")] }]} selectedPaths={[]} />)
    expect(screen.getByText("原始/相同")).toBeTruthy()
    expect(screen.getByText("高")).toBeTruthy()
    expect(screen.getByText(/1 · ≤ 5/)).toBeTruthy()
  })

  test("uses a neutral empty state when no distance exists", () => {
    render(<KisakiAnalysisView tool="similar-videos" groups={[]} selectedPaths={[]} />)
    expect(screen.getByText("当前结果没有相似度数据")).toBeTruthy()
  })
})

const entries: KisakiEntry[] = [entry("a.jpg", 10, ""), entry("b.png", 20, "5"), entry("c.png", 30, undefined)]
const group: KisakiGroup = { id: 0, entries, totalBytes: 60, reclaimableBytes: 40 }
function entry(path: string, size: number, similarity: string | undefined): KisakiEntry { return { id: path, groupId: 0, path, name: path, size, modifiedDate: 1, similarity } }
