import type { TrenameJson, TrenameNode } from "@xiranite/node-trename/core"
import type { TreeViewElement } from "@/components/ui/file-tree"

export interface TrenameTreeModel {
  elements: TreeViewElement[]
  expandedItems: string[]
  parseError: string
  total: number
  pending: number
  ready: number
}

export function buildTreeModel(jsonText: string): TrenameTreeModel {
  if (!jsonText.trim()) return emptyModel("")

  try {
    const parsed = renameDocumentFromText(jsonText)
    const elements = parsed.root.map((node, index) => toTreeElement(node, `root:${index}`))
    return {
      elements,
      expandedItems: collectExpanded(parsed).slice(0, 32),
      parseError: "",
      ...countTree(parsed),
    }
  } catch (error) {
    return emptyModel(error instanceof Error ? error.message : String(error))
  }
}

function emptyModel(parseError: string): TrenameTreeModel {
  return {
    elements: [],
    expandedItems: [],
    parseError,
    total: 0,
    pending: 0,
    ready: 0,
  }
}

// GUI 面的 rename JSON 投影（纯 TS，不依赖 React）：把编辑框里的文本读成 `TrenameNode` 树，
// 只喂目录树、展开集合与条数徽标，不含任何改名判定。
//
// 为什么必须住在面侧：ADR-0074 §5 不许 GUI 值导入节点 core，否则浏览器里就有了第二个执行宿主。
// 权威解析仍然只在宿主那份 core 里——`parseRenameJson()`（`packages/nodes/trename/src/core.ts:256`）会在
// import / validate / rename 每个动作上对手里的 `jsonContent` 再跑一次（core.ts:412、418、429），
// 决定真正改哪些文件的是那一次，不是这里。
//
// 这里只搬「宽容读文档形状」这一件事，并按字段与宿主对齐，为的是界面报出的条数与颜色对上宿主实际会处理的条数：
// 非数组的 `root` 当作空、既无字符串 `src` 也无字符串 `src_dir` 的节点丢掉、`tgt`/`tgt_dir` 归一成字符串、
// 缺失的 `children` 当作空数组。改名语义一条都不在这里复刻——`sanitizeFilename()`、`fixExtensionPosition()`、
// `validateRenameJson()` 的冲突判定与撤销记录仍只有宿主那一份，所以即便投影漂移，改变的也只有显示，
// 不会改变执行集合，也不会出现第二份需要维持等价的实现（ADR-0074 §7 否决的是复刻被调方，不是这种文本投影）。
// 同写法前例：`src/nodes/encodeb/model.ts` 的 `encodebPathsFromText()`。
function renameDocumentFromText(jsonText: string): TrenameJson {
  const root = jsonObject(JSON.parse(jsonText) as unknown).root
  return { root: Array.isArray(root) ? renameNodesFromJson(root) : [] }
}

function renameNodesFromJson(values: unknown[]): TrenameNode[] {
  const nodes: TrenameNode[] = []
  for (const value of values) {
    const node = renameNodeFromJson(value)
    if (node) nodes.push(node)
  }
  return nodes
}

function renameNodeFromJson(value: unknown): TrenameNode | null {
  const record = jsonObject(value)
  if (typeof record.src === "string") return { src: record.src, tgt: stringFieldFromJson(record.tgt) }
  if (typeof record.src_dir === "string") {
    return {
      src_dir: record.src_dir,
      tgt_dir: stringFieldFromJson(record.tgt_dir),
      children: Array.isArray(record.children) ? renameNodesFromJson(record.children) : [],
    }
  }
  return null
}

function jsonObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function stringFieldFromJson(value: unknown): string {
  if (typeof value === "string") return value
  return value == null ? "" : String(value)
}

function toTreeElement(node: TrenameNode, id: string): TreeViewElement {
  if ("src" in node) {
    return {
      id,
      name: labelForNode(node.src, node.tgt, false),
      type: "file",
      isSelectable: true,
    }
  }

  return {
    id,
    name: labelForNode(node.src_dir, node.tgt_dir, true),
    type: "folder",
    isSelectable: true,
    children: node.children.map((child, index) => toTreeElement(child, `${id}/${index}`)),
  }
}

function collectExpanded(renameJson: TrenameJson): string[] {
  const ids: string[] = []
  function walk(node: TrenameNode, id: string) {
    if ("children" in node) {
      ids.push(id)
      node.children.forEach((child, index) => walk(child, `${id}/${index}`))
    }
  }
  renameJson.root.forEach((node, index) => walk(node, `root:${index}`))
  return ids
}

function countTree(renameJson: TrenameJson): Pick<TrenameTreeModel, "total" | "pending" | "ready"> {
  const counts = { total: 0, pending: 0, ready: 0 }
  function walk(node: TrenameNode) {
    counts.total += 1
    if ("src" in node) {
      applyStatus(counts, node.src, node.tgt)
      return
    }
    applyStatus(counts, node.src_dir, node.tgt_dir)
    node.children.forEach(walk)
  }
  renameJson.root.forEach(walk)
  return counts
}

function applyStatus(counts: { pending: number; ready: number }, source: string, target?: string) {
  const next = target?.trim() ?? ""
  if (!next) counts.pending += 1
  else if (next !== source) counts.ready += 1
}

function labelForNode(source: string, target: string | undefined, isDir: boolean): string {
  const suffix = isDir ? "/" : ""
  if (!target?.trim()) return `${source}${suffix} · 待翻译`
  if (target === source) return `${source}${suffix} · 不改名`
  return `${source}${suffix} -> ${target}${suffix}`
}
