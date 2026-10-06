/**
 * 空白区马赛克补位器：把瀑布流里真实卡片下方的剩余空间，用「变尺寸格子」铺满。
 *
 * 两件顾虑刻意分开解，因为它们原来的耦合是第一个版本失败的根因：
 * ① **放多大**：bottom-left（行主序第一个空位）bin-packing，尺寸库按「大 → 小」排，
 *    1×1 永远垫底所以任何空位都装得下；
 * ② **用哪个动画**：对格子的共边邻接图做贪心着色。格子铺满矩形 ⇒ 邻接图是平面图 ⇒
 *    5-degenerate，所以按「退化序」反向着色只需 6 类、无需回溯。着色时先试该尺寸自己的
 *    偏好类（所以 2×2、2×3、1×1… 各自倾向于固定一款动画），被邻格占了再退到别的类。
 *
 * 纯函数、不依赖 DOM、可单测。真实卡片不进这里——它们按内容/持久化尺寸走最短列布局。
 */

export interface MosaicFootprint {
  /** 稳定标识；参与 size→动画的默认映射 */
  id: string
  colSpan: number
  rowSpan: number
  /** 该尺寸偏好的动画类：着色时第一个尝试的类 */
  preferredAnim: number
}

export interface MosaicTile {
  col: number
  row: number
  colSpan: number
  rowSpan: number
  footprint: string
  /** 动画类序号 0..MOSAIC_ANIM_CLASSES-1；共边格子必不相同 */
  anim: number
}

/** 尺寸库：列跨度 × 行跨度。1×1 必须在最后一项，它是「任何空位都装得下」的不变式来源。 */
export const MOSAIC_FOOTPRINTS: readonly MosaicFootprint[] = [
  { id: "t2x2", colSpan: 2, rowSpan: 2, preferredAnim: 0 },
  { id: "t2x3", colSpan: 2, rowSpan: 3, preferredAnim: 1 },
  { id: "t3x2", colSpan: 3, rowSpan: 2, preferredAnim: 2 },
  { id: "t1x2", colSpan: 1, rowSpan: 2, preferredAnim: 3 },
  { id: "t2x1", colSpan: 2, rowSpan: 1, preferredAnim: 4 },
  { id: "t1x1", colSpan: 1, rowSpan: 1, preferredAnim: 5 },
]

/**
 * 某个空位按什么顺序试尺寸。
 *
 * 必须按位置轮转：纯「先装大的」会在偶×偶网格里一路选 2×2 把版面铺满（实测 8×24 = 48 块全是
 * 2×2），那就退化成正交网格，正是用户点名叫停的「不像瀑布流」。轮转起点后同一行里先试的尺寸
 * 各不相同，尺寸自然混起来；1×1 永远挪到队尾兜底，所以全覆盖不变式不受影响。
 */
function footprintsFor(cellIndex: number): readonly MosaicFootprint[] {
  const last = MOSAIC_FOOTPRINTS.length - 1
  const rotating = MOSAIC_FOOTPRINTS.slice(0, last)
  const offset = (((cellIndex % rotating.length) + rotating.length) % rotating.length)
  return [...rotating.slice(offset), ...rotating.slice(0, offset), MOSAIC_FOOTPRINTS[last]]
}

/** 动画类总数。平面邻接图 5-degenerate ⇒ 6 类是「贪心必可解」的下界。 */
export const MOSAIC_ANIM_CLASSES = 6

function makeOccupancy(rows: number, columns: number): number[][] {
  return Array.from({ length: rows }, () => new Array<number>(columns).fill(-1))
}

function regionFree(
  occ: number[][],
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
): boolean {
  const rows = occ.length
  const cols = occ[0]?.length ?? 0
  if (col + colSpan > cols || row + rowSpan > rows) return false
  for (let r = row; r < row + rowSpan; r++) {
    for (let c = col; c < col + colSpan; c++) {
      if (occ[r][c] !== -1) return false
    }
  }
  return true
}

/** 共边邻接表：只认「共享一段边界」，对角共点不算相邻。 */
function buildAdjacency(count: number, occ: number[][]): number[][] {
  const rows = occ.length
  const cols = occ[0]?.length ?? 0
  const sets = Array.from({ length: count }, () => new Set<number>())
  const link = (a: number, b: number) => {
    if (a >= 0 && b >= 0 && a !== b) {
      sets[a].add(b)
      sets[b].add(a)
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const here = occ[r][c]
      if (here < 0) continue
      if (c + 1 < cols) link(here, occ[r][c + 1])
      if (r + 1 < rows) link(here, occ[r + 1][c])
    }
  }
  return sets.map((set) => [...set])
}

/**
 * 退化序着色：反复摘掉「在剩余图里度数最小」的顶点，再反向着色。
 * 反向时一个顶点的已着色邻居 ≤ 摘它时剩余图里的度数 ≤ 5 ⇒ 6 类必然有空位，不需要回溯。
 */
function assignAnimClasses(
  adjacency: readonly (readonly number[])[],
  preferences: readonly number[],
): number[] {
  const anims = new Array<number>(preferences.length).fill(-1)
  const remaining = new Set(preferences.map((_, i) => i))
  const order: number[] = []

  while (remaining.size > 0) {
    let pick = -1
    let best = Number.POSITIVE_INFINITY
    for (const candidate of remaining) {
      let degree = 0
      for (const n of adjacency[candidate]) {
        if (remaining.has(n)) degree++
      }
      if (degree < best) {
        best = degree
        pick = candidate
      }
    }
    remaining.delete(pick)
    order.push(pick)
  }

  for (let i = order.length - 1; i >= 0; i--) {
    const index = order[i]
    const used = new Set<number>()
    for (const n of adjacency[index]) {
      if (anims[n] >= 0) used.add(anims[n])
    }
    const preferred = preferences[index]
    let chosen = used.has(preferred) ? -1 : preferred
    if (chosen < 0) {
      for (let c = 0; c < MOSAIC_ANIM_CLASSES; c++) {
        if (!used.has(c)) {
          chosen = c
          break
        }
      }
    }
    if (chosen < 0) {
      // 理论上不可达（6 类对平面邻接图恒够）；真到了也不能把空白当动画类编号。
      const counts = new Array<number>(MOSAIC_ANIM_CLASSES).fill(0)
      for (const n of adjacency[index]) {
        if (anims[n] >= 0) counts[anims[n]]++
      }
      chosen = counts.indexOf(Math.min(...counts))
    }
    anims[index] = chosen
  }

  return anims
}

/**
 * 从 (0,0) 起按行主序扫描第一个空格，放一个「该位置优先序里第一个装得下」的格子。
 * `blocked[row][col]` = 该格已被真实卡片占住（瀑布流的参差下沿就靠它表达），补位块只填空格。
 */
export function packMosaicFiller(
  columns: number,
  rows: number,
  blocked?: boolean[][],
): MosaicTile[] {
  if (columns <= 0 || rows <= 0) return []
  const occ = makeOccupancy(rows, columns)
  if (blocked) {
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        if (blocked[row]?.[col]) occ[row][col] = -2
      }
    }
  }
  const placed: MosaicTile[] = []
  const preferences: number[] = []

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      if (occ[row][col] !== -1) continue
      const fit = footprintsFor(row * columns + col).find(
        (f) => regionFree(occ, col, row, f.colSpan, f.rowSpan),
      )
      if (!fit) continue

      const idx = placed.length
      placed.push({
        col,
        row,
        colSpan: fit.colSpan,
        rowSpan: fit.rowSpan,
        footprint: fit.id,
        anim: fit.preferredAnim,
      })
      preferences.push(fit.preferredAnim)
      for (let r = row; r < row + fit.rowSpan; r++) {
        for (let c = col; c < col + fit.colSpan; c++) {
          occ[r][c] = idx
        }
      }
    }
  }

  const anims = assignAnimClasses(buildAdjacency(placed.length, occ), preferences)
  return placed.map((tile, i) => ({ ...tile, anim: anims[i] }))
}

/** 校验用：是否存在两个共边格子同动画类（不变式，测试里断言为 false）。 */
export function hasAdjacentSameAnim(tiles: MosaicTile[], columns: number, rows: number): boolean {
  const grid = makeOccupancy(rows, columns)
  const at = (r: number, c: number): number => (r < 0 || r >= rows || c < 0 || c >= columns ? -1 : grid[r][c])
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i]
    for (let r = t.row; r < t.row + t.rowSpan; r++) {
      for (let c = t.col; c < t.col + t.colSpan; c++) {
        if (r < rows && c < columns) grid[r][c] = i
      }
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const here = at(r, c)
      if (here < 0) continue
      for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
        const other = at(r + dr, c + dc)
        if (other >= 0 && other !== here && tiles[other].anim === tiles[here].anim) return true
      }
    }
  }
  return false
}
