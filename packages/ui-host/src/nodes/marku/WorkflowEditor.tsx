// React Flow projection of a linear Marku workflow. The canvas is a visual
// projection only: node positions derive from step order via workflow-state
// and never persist; dragging a node horizontally reorders the steps. The
// selected node exposes inline module and config editing so the sidebar can
// stay collapsed while the canvas fills the card.
import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { GripVertical, Maximize2, Settings2 } from "lucide-react"
import { Background, BackgroundVariant, Controls, Handle, MarkerType, Panel as ReactFlowPanel, Position, ReactFlow, useNodesState, useReactFlow } from "@xyflow/react"
import type { Edge, Node, NodeProps, NodeTypes, Viewport } from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { MarkuWorkflow, MarkuWorkflowRunData } from "@xiranite/node-marku/core"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { findModuleMeta } from "./constants"
import { ModulePicker } from "./controls"
import type { MarkuWorkflowViewport } from "./types"
import { StepConfigField } from "./WorkflowInspector"
import type { WorkflowNodeDiffLine, WorkflowNodeResultProjection } from "./workflow-result-projection"
import { projectWorkflowRunToNodes } from "./workflow-result-projection"
import { projectWorkflowGraph, stepIndexForDragPosition } from "./workflow-state"

interface WorkflowEditorProps {
  running: boolean
  selectedStepId?: string
  viewport?: MarkuWorkflowViewport
  workflow: MarkuWorkflow
  run?: MarkuWorkflowRunData | null
  onChangeStepConfig: (stepId: string, config: Record<string, unknown>) => void
  onChangeStepModule: (stepId: string, module: string) => void
  onMoveStep: (stepId: string, targetIndex: number) => void
  onSelectStep: (stepId: string) => void
  onViewportChange: (viewport: MarkuWorkflowViewport) => void
}

type StepNodeData = {
  index: number
  module: string
  selected: boolean
  running: boolean
  config: Record<string, unknown>
  result?: WorkflowNodeResultProjection
  onChangeModule: (module: string) => void
  onChangeConfig: (config: Record<string, unknown>) => void
}
type StepFlowNode = Node<StepNodeData, "markuStep">

const NODE_TYPES: NodeTypes = { markuStep: StepFlowNodeCard }
const FLOW_STYLE = {
  "--xy-background-color": "transparent",
  "--xy-edge-stroke": "color-mix(in oklch, var(--primary) 72%, transparent)",
  "--xy-edge-stroke-width": "2",
  "--xy-controls-button-background-color": "var(--card)",
  "--xy-controls-button-color": "var(--foreground)",
  "--xy-controls-button-border-color": "var(--border)",
} as CSSProperties

export function WorkflowEditor(props: WorkflowEditorProps) {
  const [selectedRunSourceId, setSelectedRunSourceId] = useState("")
  const selectedRunSource = props.run?.sources.find((source) => source.sourceId === selectedRunSourceId) ?? props.run?.sources[0]
  const projection = useMemo(
    () => projectWorkflowGraph(props.workflow, props.selectedStepId),
    [props.workflow, props.selectedStepId],
  )
  const resultProjection = useMemo(
    () => projectWorkflowRunToNodes(props.workflow, props.run, selectedRunSource?.sourceId ?? ""),
    [props.run, props.workflow, selectedRunSource?.sourceId],
  )
  const flowNodes = useMemo<StepFlowNode[]>(
    () => projection.nodes.map((node) => {
      const step = props.workflow.steps.find((item) => item.id === node.id)
      return {
        id: node.id,
        type: "markuStep" as const,
        position: node.position,
        data: {
          index: node.index,
          module: node.module,
          selected: node.selected,
          running: props.running,
          config: step?.config ?? {},
          result: resultProjection.get(node.id),
          onChangeModule: (module: string) => props.onChangeStepModule(node.id, module),
          onChangeConfig: (config: Record<string, unknown>) => props.onChangeStepConfig(node.id, config),
        },
        draggable: !props.running,
        dragHandle: ".marku-workflow-node-drag-handle",
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projection, props.running, props.workflow, props.onChangeStepModule, props.onChangeStepConfig, resultProjection],
  )
  const flowEdges = useMemo<Edge[]>(
    () => projection.edges.map((edge) => ({
      ...edge,
      type: "default",
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
    })),
    [projection],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState<StepFlowNode>(flowNodes)
  // The projection is the source of truth: any draft change snaps nodes back
  // onto the ordered lane instead of preserving free-form drag positions.
  useEffect(() => {
    setNodes(flowNodes)
  }, [flowNodes, setNodes])

  return (
    <div className="h-full min-h-0" data-testid="marku-workflow-editor">
      <ReactFlow<StepFlowNode, Edge>
        nodes={nodes}
        edges={flowEdges}
        nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange}
        onNodeClick={(_event, node) => props.onSelectStep(node.id)}
        onNodeDragStop={(_event, node) => props.onMoveStep(node.id, stepIndexForDragPosition(node.position.x, props.workflow.steps.length))}
        onMoveEnd={(_event, viewport: Viewport) => props.onViewportChange({ x: viewport.x, y: viewport.y, zoom: viewport.zoom })}
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        minZoom={0.5}
        maxZoom={1.5}
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
        style={FLOW_STYLE}
        {...(props.viewport
          ? { defaultViewport: props.viewport }
          : { fitView: true, fitViewOptions: { padding: 0.2, maxZoom: 1 } })}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="color-mix(in oklch, var(--muted-foreground) 22%, transparent)" />
        {props.run && selectedRunSource && (
          <ReactFlowPanel className="nodrag nopan nowheel rounded-md border bg-card/95 p-1 shadow-sm" position="top-left">
            <Select value={selectedRunSource.sourceId} onValueChange={setSelectedRunSourceId}>
              <SelectTrigger aria-label="marku workflow canvas result source" size="sm" className="w-52 border-0 bg-transparent shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {props.run.sources.map((source) => (
                  <SelectItem key={source.sourceId} value={source.sourceId}>{source.sourceLabel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ReactFlowPanel>
        )}
        <FitWorkflowAfterStepCountChange stepCount={props.workflow.steps.length} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
    </div>
  )
}

/** Keep newly added or removed steps reachable without resetting manual pans or reorders. */
function FitWorkflowAfterStepCountChange({ stepCount }: { stepCount: number }) {
  const { fitView } = useReactFlow()
  const previousStepCount = useRef(stepCount)

  useEffect(() => {
    if (previousStepCount.current === stepCount) return
    previousStepCount.current = stepCount
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.2, maxZoom: 1, duration: 0 })
    })
    return () => cancelAnimationFrame(frame)
  }, [fitView, stepCount])

  return null
}

function StepFlowNodeCard({ data, id }: NodeProps<StepFlowNode>) {
  const meta = findModuleMeta(data.module)
  const Icon = meta.icon
  return (
    <div
      data-step-index={data.index}
      data-testid={`marku-flow-node-${id}`}
      className={cn(
        "w-[22rem] rounded-lg border bg-card/95 px-3 py-2 shadow-md",
        data.selected ? "border-primary ring-2 ring-primary/25" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="!size-2.5 !border-2 !border-background !bg-primary" />
      <div className="flex items-center gap-2">
        <span
          aria-label={`拖拽步骤 ${data.index + 1} 以重排`}
          className="marku-workflow-node-drag-handle flex shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
          data-testid={`marku-flow-node-drag-handle-${id}`}
          title="拖拽以重排步骤"
        >
          <GripVertical className="size-4" />
        </span>
        <Badge variant="outline" className="shrink-0 tabular-nums">{data.index + 1}</Badge>
        <Icon className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold">{meta.shortLabel}</span>
        {data.selected && (
          <Popover>
            <PopoverTrigger asChild>
              <Button aria-label="编辑步骤配置" className="nodrag nopan shrink-0" disabled={data.running} size="icon-sm" variant="outline">
                <Settings2 />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="nodrag nopan nowheel w-72 p-3" side="bottom">
              <StepConfigField
                ariaLabel="marku workflow node config"
                config={data.config}
                disabled={data.running}
                inputId="marku-workflow-node-config"
                seedKey={id}
                onConfigChange={data.onChangeConfig}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>
      {data.selected && (
        <div className="nodrag nopan mt-2">
          <ModulePicker compact disabled={data.running} module={meta.id} onModuleChange={data.onChangeModule} />
        </div>
      )}
      {data.result && <StepNodeDiff result={data.result} />}
      <Handle type="source" position={Position.Right} isConnectable={false} className="!size-2.5 !border-2 !border-background !bg-primary" />
    </div>
  )
}

const NODE_DIFF_PREVIEW_LINES = 10

function StepNodeDiff({ result }: { result: WorkflowNodeResultProjection }) {
  const previewLines = result.diffLines.slice(0, NODE_DIFF_PREVIEW_LINES)
  const hiddenLineCount = result.diffLines.length - previewLines.length

  return (
    <div data-testid={`marku-flow-node-diff-${result.stepId}`} className="nodrag nopan nowheel mt-2 border-t pt-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px]">
        <span className="min-w-0 flex-1 truncate font-medium" title={result.sourceLabel}>{result.sourceLabel}</span>
        <Badge variant={result.changedSourceCount ? "secondary" : "outline"} className="shrink-0">
          {result.changedSourceCount}/{result.sourceCount} 变更
        </Badge>
        {result.errorSourceCount > 0 && <Badge variant="destructive" className="shrink-0">{result.errorSourceCount} 错误</Badge>}
      </div>

      {!result.result ? (
        <div className="rounded-md border border-dashed px-2 py-2 text-center text-[11px] text-muted-foreground">此来源未执行到该步骤</div>
      ) : result.result.error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive">{result.result.error}</div>
      ) : !result.result.changed ? (
        <div className="rounded-md border border-dashed px-2 py-2 text-center text-[11px] text-muted-foreground">无文本变化</div>
      ) : (
        <>
          <CompactDiff lines={previewLines} />
          {hiddenLineCount > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button aria-label="展开完整步骤差异" title="展开完整步骤差异" className="mt-1.5 w-full" size="xs" variant="ghost">
                  <Maximize2 />
                  另有 {hiddenLineCount} 行
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="nodrag nopan nowheel max-h-80 w-[min(42rem,calc(100vw-2rem))] overflow-auto p-2" side="bottom">
                <div className="mb-2 truncate text-xs font-medium" title={result.sourceLabel}>{result.sourceLabel}</div>
                <CompactDiff lines={result.diffLines} />
              </PopoverContent>
            </Popover>
          )}
        </>
      )}
    </div>
  )
}

function CompactDiff({ lines }: { lines: WorkflowNodeDiffLine[] }) {
  return (
    <div className="overflow-hidden rounded-md border bg-muted/20 font-mono text-[10px] leading-4">
      {lines.map((line, index) => (
        <div
          key={`${line.type}-${line.oldLineNumber ?? ""}-${line.newLineNumber ?? ""}-${index}`}
          data-diff-type={line.type}
          className={cn(
            "grid grid-cols-[2rem_2rem_1rem_minmax(0,1fr)]",
            line.type === "delete" && "bg-destructive/10 text-destructive",
            line.type === "insert" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
            line.type === "normal" && "text-muted-foreground",
          )}
        >
          <span className="border-r px-1 text-right tabular-nums opacity-60">{line.oldLineNumber ?? ""}</span>
          <span className="border-r px-1 text-right tabular-nums opacity-60">{line.newLineNumber ?? ""}</span>
          <span className="text-center select-none">{line.type === "delete" ? "-" : line.type === "insert" ? "+" : " "}</span>
          <span className="min-w-0 whitespace-pre-wrap break-all pr-1">{line.content || " "}</span>
        </div>
      ))}
    </div>
  )
}
