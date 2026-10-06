import { describe, expect, test } from "vitest"

import {
  hasAdjacentSameAnim,
  MOSAIC_ANIM_CLASSES,
  MOSAIC_FOOTPRINTS,
  packMosaicFiller,
  type MosaicTile,
} from "./mosaicFiller"

const PREFERRED = new Map(MOSAIC_FOOTPRINTS.map((f) => [f.id, f.preferredAnim]))

function coverage(tiles: MosaicTile[], columns: number, rows: number): number[] {
  const g = Array.from({ length: rows }, () => new Array<number>(columns).fill(0))
  for (const t of tiles) {
    for (let r = t.row; r < t.row + t.rowSpan; r++) {
      for (let c = t.col; c < t.col + t.colSpan; c++) {
        if (r < rows && c < columns) g[r][c] += 1
      }
    }
  }
  return g.flat()
}

/** 共边邻居的下标集合（对角共点不算）。 */
function occupancy(tiles: MosaicTile[], columns: number, rows: number): number[][] {
  const g = Array.from({ length: rows }, () => new Array<number>(columns).fill(-1))
  tiles.forEach((t, i) => {
    for (let r = t.row; r < t.row + t.rowSpan; r++) {
      for (let c = t.col; c < t.col + t.colSpan; c++) {
        if (r < rows && c < columns) g[r][c] = i
      }
    }
  })
  return g
}

function neighborIndices(tiles: MosaicTile[], index: number): number[] {
  const rows = Math.max(...tiles.map((t) => t.row + t.rowSpan))
  const columns = Math.max(...tiles.map((t) => t.col + t.colSpan))
  const g = occupancy(tiles, columns, rows)
  const t = tiles[index]
  const found = new Set<number>()
  const note = (r: number, c: number) => {
    if (r < 0 || r >= rows || c < 0 || c >= columns) return
    const other = g[r][c]
    if (other >= 0 && other !== index) found.add(other)
  }
  for (let r = t.row; r < t.row + t.rowSpan; r++) {
    note(r, t.col - 1)
    note(r, t.col + t.colSpan)
  }
  for (let c = t.col; c < t.col + t.colSpan; c++) {
    note(t.row - 1, c)
    note(t.row + t.rowSpan, c)
  }
  return [...found]
}

describe("packMosaicFiller", () => {
  test("反证：hasAdjacentSameAnim 能抓到两块共边同动画类", () => {
    const bad: MosaicTile[] = [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1, footprint: "t1x1", anim: 2 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1, footprint: "t2x1", anim: 2 }, // 尺寸不同但共边同动画
    ]
    expect(hasAdjacentSameAnim(bad, 2, 1)).toBe(true)

    const ok: MosaicTile[] = [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1, footprint: "t1x1", anim: 2 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1, footprint: "t1x1", anim: 5 },
    ]
    expect(hasAdjacentSameAnim(ok, 2, 1)).toBe(false)

    // 只共点（对角）不算相邻——这是「共边」的定义，写错就会把整片判红
    const diagonal: MosaicTile[] = [
      { col: 0, row: 0, colSpan: 1, rowSpan: 1, footprint: "t1x1", anim: 1 },
      { col: 1, row: 1, colSpan: 1, rowSpan: 1, footprint: "t1x1", anim: 1 },
      { col: 1, row: 0, colSpan: 1, rowSpan: 1, footprint: "t1x1", anim: 0 },
      { col: 0, row: 1, colSpan: 1, rowSpan: 1, footprint: "t1x1", anim: 2 },
    ]
    expect(hasAdjacentSameAnim(diagonal, 2, 2)).toBe(false)
  })

  test.each([
    [3, 6],
    [4, 8],
    [2, 5],
    [5, 5],
    [1, 7],
    [8, 24],
  ])("%i 列 × %i 行：不相邻同动画 + 全覆盖 + 不越界 + 尺寸多样", (columns, rows) => {
    const tiles = packMosaicFiller(columns, rows)

    expect(hasAdjacentSameAnim(tiles, columns, rows)).toBe(false)
    expect(coverage(tiles, columns, rows).every((n) => n === 1)).toBe(true)

    for (const t of tiles) {
      expect(t.anim).toBeGreaterThanOrEqual(0)
      expect(t.anim).toBeLessThan(MOSAIC_ANIM_CLASSES)
      expect(t.col + t.colSpan).toBeLessThanOrEqual(columns)
      expect(t.row + t.rowSpan).toBeLessThanOrEqual(rows)
    }

    // 多样性：不止一种尺寸（否则退化成整齐网格，不像马赛克）
    expect(new Set(tiles.map((t) => t.footprint)).size).toBeGreaterThan(1)
  })

  test("尺寸与动画解耦：同一种尺寸可以拿到不同动画（旧耦合版做不到）", () => {
    const tiles = packMosaicFiller(8, 24)
    const byFootprint = new Map<string, Set<number>>()
    for (const t of tiles) {
      if (!byFootprint.has(t.footprint)) byFootprint.set(t.footprint, new Set())
      byFootprint.get(t.footprint)!.add(t.anim)
    }
    // 混尺寸（不是清一色 2×2）+ 同一尺寸出现多种动画 ⇒ anim 不是 footprint 的同义词
    expect(byFootprint.size).toBe(MOSAIC_FOOTPRINTS.length)
    const mixed = [...byFootprint].filter(([, anims]) => anims.size > 1)
    expect(mixed.length).toBeGreaterThan(0)

    // 反向也成立：某个动画类被多种尺寸共用
    const perClass = new Map<number, Set<string>>()
    for (const t of tiles) {
      if (!perClass.has(t.anim)) perClass.set(t.anim, new Set())
      perClass.get(t.anim)!.add(t.footprint)
    }
    expect(Math.max(...[...perClass.values()].map((s) => s.size))).toBeGreaterThan(1)
  })

  test("只有被邻格占了才放弃该尺寸的偏好动画类", () => {
    const tiles = packMosaicFiller(5, 9)
    const unjustified: string[] = []
    for (let i = 0; i < tiles.length; i++) {
      const preferred = PREFERRED.get(tiles[i].footprint)!
      if (tiles[i].anim === preferred) continue
      const forced = neighborIndices(tiles, i).some((n) => tiles[n].anim === preferred)
      if (!forced) unjustified.push(`${tiles[i].footprint}@${tiles[i].col},${tiles[i].row}`)
    }
    expect(unjustified).toEqual([])
  })

  test("结果是确定性的（同输入同输出，便于快照/回归）", () => {
    expect(packMosaicFiller(4, 6)).toEqual(packMosaicFiller(4, 6))
  })

  test("空网格 → 空结果", () => {
    expect(packMosaicFiller(0, 5)).toEqual([])
    expect(packMosaicFiller(3, 0)).toEqual([])
  })

  test("尺寸库覆盖用户点名的 1×1 / 1×2 / 2×2 / 2×3，且 1×1 垫底、动画类不重复", () => {
    const sizes = MOSAIC_FOOTPRINTS.map((f) => `${f.colSpan}x${f.rowSpan}`)
    for (const want of ["1x1", "1x2", "2x1", "2x2", "2x3", "3x2"]) expect(sizes).toContain(want)
    expect(sizes[sizes.length - 1]).toBe("1x1")
    expect(new Set(MOSAIC_FOOTPRINTS.map((f) => f.preferredAnim)).size).toBe(MOSAIC_FOOTPRINTS.length)
    for (const f of MOSAIC_FOOTPRINTS) {
      expect(f.preferredAnim).toBeLessThan(MOSAIC_ANIM_CLASSES)
      expect(f.preferredAnim).toBeGreaterThanOrEqual(0)
    }
  })

  test("1 列窄网格退化成 1×N 竖条仍然干净", () => {
    const tiles = packMosaicFiller(1, 6)
    expect(tiles.length).toBeGreaterThan(1)
    expect(hasAdjacentSameAnim(tiles, 1, 6)).toBe(false)
    expect(coverage(tiles, 1, 6).every((n) => n === 1)).toBe(true)
  })
})
