/**
 * Marku 的 mdast 取样层，从 `<Xiranite>` tag `noxide` 基线
 * `.scratch/xiranite-noxide/packages/nodes/marku/src/markdown-ast.ts`（**93 行**）逐字搬来，
 * import 说明符一个都没改（`./…` 是本包邻居，`remark` / `mdast` 是第三方裸依赖）。
 *
 * **它要的第三方包本仓没装**：`remark@^15.0.1`（基线 `packages/nodes/marku/package.json`
 * 的 `dependencies.remark`）与 `@types/mdast`（`import type { Root }` 那一行）。
 * 按"新依赖只报请求、不擅自写进 package.json"的口径（`AGENTS.md` 门禁与证据那一节），
 * 这里保持**逐字**、不装、不自己手写一个 mdast 解析器替它——那正是"绕过缺口自己长一条通路"。
 * 请求与后果写在 `docs/service-mapping.md` 缺口台账（本包新增那条）与移植报告里。
 *
 * 语义钉子（都会被"顺手优化"改掉，逐条写清）：
 * - 它**不序列化 mdast**，而是把节点位置换成原文区间补丁（注释原话：preserving the user's
 *   untouched Markdown formatting），代码块边界因此天然被尊重。
 * - `paragraph` 里只有一个 `image` 孩子时，这条块被记成 `image`（不是 `paragraph`），
 *   去重那条腿（`content_dedup` 的 `dedup_images`）靠的就是这个判断。
 * - `visitMarkdownNode` 的 visit 返回 `false` 表示**不再下降**，三种块（heading/paragraph/image）
 *   都这样收，所以列表项里的段落不会被当成顶层段落。
 * - `addBlock` 要求 offset 是**非负整数**且 `end >= start`，切出来 `trim()` 后为空就丢弃。
 * - `applyMarkuMarkdownEdits` 先按 `start` 再按 `end` 升序排，然后**倒序**应用；区间重叠或越界
 *   直接抛 `Markdown edit ranges must be ordered, non-overlapping, and in bounds.`
 * - `rangeWithTrailingLineBreak` 认 `\r\n` 与 `\n` 两种换行，把块后那个换行一起吃掉。
 *
 * @module xaihi-marku/markdown-ast
 */
import { remark } from "remark"
import type { Root } from "mdast"

export type MarkuMarkdownBlockKind = "heading" | "image" | "paragraph"

export interface MarkuMarkdownBlock {
  kind: MarkuMarkdownBlockKind
  start: number
  end: number
  source: string
}

export interface MarkuMarkdownEdit {
  start: number
  end: number
  replacement: string
}

interface MarkdownNode {
  type: string
  position?: { start: { offset?: number }; end: { offset?: number } }
  children?: MarkdownNode[]
}

/**
 * Marku applies source-range patches instead of serializing mdast, preserving
 * the user's untouched Markdown formatting while respecting code boundaries.
 */
export function collectMarkuMarkdownBlocks(source: string): MarkuMarkdownBlock[] {
  const root = remark().parse(source) as unknown as Root as MarkdownNode
  const blocks: MarkuMarkdownBlock[] = []
  visitMarkdownNode(root, (node) => {
    if (node.type === "heading") {
      addBlock(blocks, "heading", source, node)
      return false
    }
    if (node.type === "paragraph") {
      const onlyChild = node.children?.[0]
      if (node.children?.length === 1 && onlyChild?.type === "image") addBlock(blocks, "image", source, node)
      else addBlock(blocks, "paragraph", source, node)
      return false
    }
    return true
  })
  return blocks
}

export function collectMarkuAtxHeadings(source: string): MarkuMarkdownBlock[] {
  return collectMarkuMarkdownBlocks(source).filter((block) => block.kind === "heading" && /^ {0,3}#{1,6}\s+/.test(block.source))
}

export function collectMarkuImages(source: string): MarkuMarkdownBlock[] {
  const root = remark().parse(source) as unknown as Root as MarkdownNode
  const images: MarkuMarkdownBlock[] = []
  visitMarkdownNode(root, (node) => {
    if (node.type === "image") addBlock(images, "image", source, node)
    return true
  })
  return images
}

export function rangeWithTrailingLineBreak(source: string, block: Pick<MarkuMarkdownBlock, "start" | "end">): MarkuMarkdownEdit {
  let end = block.end
  if (source.charCodeAt(end) === 13 && source.charCodeAt(end + 1) === 10) end += 2
  else if (source.charCodeAt(end) === 10) end += 1
  return { start: block.start, end, replacement: "" }
}

export function applyMarkuMarkdownEdits(source: string, edits: readonly MarkuMarkdownEdit[]): string {
  const ordered = [...edits].sort((left, right) => left.start - right.start || left.end - right.end)
  let previousEnd = 0
  for (const edit of ordered) {
    if (edit.start < previousEnd || edit.start < 0 || edit.end < edit.start || edit.end > source.length) {
      throw new Error("Markdown edit ranges must be ordered, non-overlapping, and in bounds.")
    }
    previousEnd = edit.end
  }
  return [...ordered].reverse().reduce((output, edit) => `${output.slice(0, edit.start)}${edit.replacement}${output.slice(edit.end)}`, source)
}

function visitMarkdownNode(node: MarkdownNode, visit: (node: MarkdownNode) => boolean): void {
  if (!visit(node)) return
  for (const child of node.children ?? []) visitMarkdownNode(child, visit)
}

function addBlock(blocks: MarkuMarkdownBlock[], kind: MarkuMarkdownBlockKind, source: string, node: MarkdownNode): void {
  const start = node.position?.start.offset
  const end = node.position?.end.offset
  if (typeof start !== "number" || typeof end !== "number" || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start) return
  const value = source.slice(start, end)
  if (!value.trim()) return
  blocks.push({ kind, start, end, source: value })
}
