import type { RepackuCompressMode, RepackuFolderNode } from "@xiranite/node-repacku/core"
import { FolderOpen, Maximize2 } from "lucide-react"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { CollapseButton, Tree, type TreeViewElement } from "@/components/ui/file-tree"

interface FileTreePreviewProps {
  root: RepackuFolderNode | null
}

export function FileTreePreview({ root }: FileTreePreviewProps) {
  if (!root) {
    return (
      <Empty className="h-full min-h-40 border-0 p-4">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderOpen />
          </EmptyMedia>
          <EmptyTitle>暂无目录树</EmptyTitle>
          <EmptyDescription>运行分析后会显示文件夹层级、压缩策略和文件统计。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  const elements = [toTreeElement(root)]
  const expandedItems = collectFolderIds(root)

  return (
    <div className="relative h-full min-h-0">
      <Tree
        actions={(
          <CollapseButton elements={elements}>
            <Maximize2 data-icon="inline-start" />
            展开
          </CollapseButton>
        )}
        className="text-xs"
        elements={elements}
        initialExpandedItems={expandedItems}
        sort="none"
      />
    </div>
  )
}

function collectFolderIds(node: RepackuFolderNode): string[] {
  return [node.path, ...node.children.flatMap(collectFolderIds)]
}

function toTreeElement(node: RepackuFolderNode): TreeViewElement {
  const extensionChildren = Object.entries(node.fileExtensions)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([extension, count]) => ({
      id: `${node.path}::${extension}`,
      name: `${extension || "no-ext"} x ${count}`,
      type: "file" as const,
      isSelectable: false,
    }))

  return {
    id: node.path,
    name: formatFolderLabel(node),
    type: "folder",
    children: [
      ...node.children.map(toTreeElement),
      ...extensionChildren,
    ],
  }
}

function formatFolderLabel(node: RepackuFolderNode): string {
  return `${node.name} · ${modeLabel(node.compressMode)} · ${node.totalFiles} files · ${formatSize(node.recursiveSize || node.totalSize)}`
}

function modeLabel(mode: RepackuCompressMode): string {
  if (mode === "entire") return "整包"
  if (mode === "selective") return "筛选"
  return "跳过"
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}
