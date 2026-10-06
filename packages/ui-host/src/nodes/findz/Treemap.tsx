import { useEffect, useRef } from "react"
import { TreeMap, type WebTreemapNode } from "webtreemap-cdt/build/index.js"
import type { FindzTreemapNode } from "@xiranite/findz-native"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import "./treemap.css"

interface RenderNode extends WebTreemapNode {
  source: FindzTreemapNode
  children?: RenderNode[]
}

export function FindzTreemap({ projection, selectedArchiveId, onSelectArchive, onDrill }: {
  projection?: FindzTreemapNode
  selectedArchiveId?: number
  onSelectArchive(archiveId: number): void
  onDrill(pathPrefix: string): void
}) {
  const { t, language } = useNodeI18n("findz")
  const containerRef = useRef<HTMLDivElement>(null)
  const zoomedNodeID = useRef("root")

  useEffect(() => {
    const container = containerRef.current
    if (!container || !projection || !container.clientWidth || !container.clientHeight) return
    const paint = () => {
      container.replaceChildren()
      const root = toRenderNode(projection)
      const treeMap = new TreeMap(root, {
        padding: [18, 2, 2, 2],
        caption: (node) => (node as RenderNode).source.name,
        applyMutations: (node) => {
          const rendered = node as RenderNode
          if (!rendered.dom) return
          const { source, dom } = rendered
          dom.dataset.findzNodeId = source.id
          dom.dataset.findzSelected = String(source.archiveId === selectedArchiveId)
          dom.dataset.findzAnomaly = anomalyBand(source.color)
          dom.dataset.findzZoomed = "false"
          dom.dataset.testid = `findz-treemap-node-${source.id.replaceAll(/[^a-zA-Z0-9]+/g, "-")}`
          dom.firstElementChild?.setAttribute("data-testid", `findz-treemap-caption-${source.id.replaceAll(/[^a-zA-Z0-9]+/g, "-")}`)
          dom.setAttribute("role", "button")
          dom.tabIndex = 0
          dom.setAttribute("aria-label", source.archiveId
            ? t("workspace.treemapPanel.openArchive", "Open archive {{name}}", { name: source.name })
            : t("workspace.treemapPanel.drillInto", "Drill into {{name}}", { name: source.name }))
          const select = () => {
            if (source.archiveId !== undefined) onSelectArchive(source.archiveId)
          }
          const drill = () => {
            if (source.id.startsWith("folder:")) onDrill(source.id.slice("folder:".length))
          }
          const isOwnNodeEvent = (event: Event) => event.target instanceof Element && event.target.closest(".webtreemap-node") === dom
          dom.addEventListener("click", (event) => {
            if (!isOwnNodeEvent(event)) return
            zoomedNodeID.current = source.id
            select()
          })
          dom.addEventListener("dblclick", (event) => {
            if (isOwnNodeEvent(event)) drill()
          })
          dom.addEventListener("keydown", (event) => {
            if (!isOwnNodeEvent(event)) return
            if (event.key !== "Enter" && event.key !== " ") return
            event.preventDefault()
            zoomedNodeID.current = source.id
            if (source.archiveId !== undefined) select()
            else drill()
          })
        },
      })
      treeMap.render(container)
      const savedAddress = findNodeAddress(root, zoomedNodeID.current)
      if (savedAddress) {
        treeMap.zoom(savedAddress)
        findRenderNode(root, zoomedNodeID.current)?.dom?.setAttribute("data-findz-zoomed", "true")
      }
    }
    paint()
    const observer = new ResizeObserver(paint)
    observer.observe(container)
    return () => observer.disconnect()
  }, [language, onDrill, onSelectArchive, projection, selectedArchiveId])

  if (!projection?.children?.length) {
    return <div data-testid="findz-treemap-empty" className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">{t("workspace.treemapPanel.empty", "No indexed archive area for this view.")}</div>
  }
  return <div ref={containerRef} data-testid="findz-treemap" className="findz-treemap relative min-h-56 flex-1 overflow-hidden" />
}

function toRenderNode(node: FindzTreemapNode): RenderNode {
  return {
    id: node.id,
    size: Math.max(node.value, 1),
    source: node,
    children: node.children?.map(toRenderNode),
  }
}

function anomalyBand(value: number): "none" | "medium" | "high" {
  if (value >= 0.2) return "high"
  if (value > 0) return "medium"
  return "none"
}

function findNodeAddress(node: RenderNode, targetID: string, address: number[] = []): number[] | undefined {
  if (node.source.id === targetID) return address
  for (const [index, child] of node.children?.entries() ?? []) {
    const childAddress = findNodeAddress(child, targetID, [...address, index])
    if (childAddress) return childAddress
  }
  return undefined
}

function findRenderNode(node: RenderNode, targetID: string): RenderNode | undefined {
  if (node.source.id === targetID) return node
  for (const child of node.children ?? []) {
    const result = findRenderNode(child, targetID)
    if (result) return result
  }
  return undefined
}
