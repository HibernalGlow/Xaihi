import { useMemo } from "react"
import { FolderOpen, Maximize2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { CollapseButton, Tree } from "@/components/ui/file-tree"
import { Separator } from "@/components/ui/separator"
import { buildTreeModel } from "./treeModel"

export function FileTreePanel(props: {
  compact?: boolean
  jsonText: string
}) {
  const model = useMemo(() => buildTreeModel(props.jsonText), [props.jsonText])

  if (!model.elements.length) {
    return (
      <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
        <Empty className="h-full min-h-36 border-0 p-4">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FolderOpen />
            </EmptyMedia>
            <EmptyTitle className="text-base">等待 rename JSON</EmptyTitle>
            <EmptyDescription>
              扫描目录或导入 JSON 后，这里会显示目录树、待翻译项和已准备重命名项。
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    )
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border bg-background/70">
      <div className={props.compact ? "flex shrink-0 items-center justify-between gap-2 px-2 py-1.5" : "flex shrink-0 items-center justify-between gap-2 px-3 py-2"}>
        <div className="flex min-w-0 items-center gap-2">
          <FolderOpen className="size-4 text-muted-foreground" />
          <div className="truncate text-xs font-medium">文件树</div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant="outline">{model.total} 项</Badge>
          <Badge variant={model.ready ? "default" : "secondary"}>{model.ready} 就绪</Badge>
          <Badge variant={model.pending ? "outline" : "secondary"}>{model.pending} 待填</Badge>
        </div>
      </div>
      <Separator />
      <div className="min-h-0 flex-1">
        <Tree
          actions={(
            <CollapseButton elements={model.elements}>
              <Maximize2 data-icon="inline-start" />
              展开
            </CollapseButton>
          )}
          className="text-xs"
          elements={model.elements}
          initialExpandedItems={model.expandedItems}
          sort="none"
        />
      </div>
    </section>
  )
}
