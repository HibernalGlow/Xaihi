/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react"
import { useEffect, useMemo, useState } from "react"
import type { WorkspaceSnapshotDTO } from "@xiranite/shared"
import {
  ClickTarget,
  TerminalTaskQueueScreen,
  TerminalThemeProvider,
  WorkbenchButton,
  WorkbenchPanel,
  resolveTerminalTheme,
  useTerminalTheme,
} from "@xiranite/cli-runtime/terminal/opentui"
import type { TerminalTaskQueueController } from "@xiranite/cli-runtime/terminal"

import type { NodeCliRegistration } from "./index.js"
import { deployNode, patchNodeLayout, projectTerminalLayout, removeNode } from "./workspace-tui-model.js"

export interface XiraniteWorkspaceController {
  available: boolean
  reason?: string
  load: () => Promise<WorkspaceSnapshotDTO>
  save: (snapshot: WorkspaceSnapshotDTO) => Promise<void>
}

export function XiraniteTui(props: {
  nodes: readonly NodeCliRegistration[]
  workspace: XiraniteWorkspaceController
  taskQueue: TerminalTaskQueueController
  onOpenNode: (nodeId: string) => void
  onExit: () => void
}) {
  return <TerminalThemeProvider theme={resolveTerminalTheme("nord")}><WorkspaceWorkbench {...props} /></TerminalThemeProvider>
}

function WorkspaceWorkbench({ nodes, workspace, taskQueue, onOpenNode, onExit }: Parameters<typeof XiraniteTui>[0]) {
  const theme = useTerminalTheme()
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshotDTO>({ workspaces: [], lanes: [], components: [] })
  const [workspaceId, setWorkspaceId] = useState("")
  const [selectedId, setSelectedId] = useState<string>()
  const [search, setSearch] = useState("")
  const [queueOpen, setQueueOpen] = useState(false)
  const [status, setStatus] = useState("正在连接工作区…")

  useEffect(() => {
    workspace.load().then((next) => {
      setSnapshot(next)
      setWorkspaceId(next.workspaces[0]?.id ?? "")
      setStatus(workspace.available ? "已连接 · 布局更改自动保存" : workspace.reason ?? "离线")
    }).catch((error) => setStatus(error instanceof Error ? error.message : String(error)))
  }, [workspace])

  useKeyboard((key) => {
    if (key.name === "escape") { if (queueOpen) setQueueOpen(false); else onExit() }
    if (key.name === "f9") setQueueOpen((value) => !value)
    if (key.name === "delete" && selectedId) void mutate(removeNode(snapshot, selectedId), undefined)
    if (key.name === "enter" && selectedId) {
      const component = snapshot.components.find((item) => item.id === selectedId)
      if (component) onOpenNode(component.moduleId)
    }
  })

  const mutate = async (next: WorkspaceSnapshotDTO, nextSelected = selectedId) => {
    setSnapshot(next)
    setSelectedId(nextSelected)
    if (workspace.available) {
      try { await workspace.save(next); setStatus("布局已保存") }
      catch (error) { setStatus(error instanceof Error ? error.message : String(error)) }
    }
  }
  const deploy = async (moduleId: string) => {
    if (!workspaceId) return
    const result = deployNode(snapshot, workspaceId, moduleId)
    await mutate(result.snapshot, result.componentId)
  }
  const selected = snapshot.components.find((item) => item.id === selectedId)
  const visibleNodes = nodes.filter((node) => `${node.id} ${node.description}`.toLowerCase().includes(search.toLowerCase())).slice(0, 80)
  const components = snapshot.components.filter((item) => item.workspaceId === workspaceId)
  const projected = useMemo(() => projectTerminalLayout(components, 70), [components])

  if (queueOpen) return <TerminalTaskQueueScreen controller={taskQueue} onBack={() => setQueueOpen(false)} />

  return (
    <box width="100%" height="100%" flexDirection="column" paddingLeft={1} paddingRight={1}>
      <box height={4} flexShrink={0} borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="space-between">
        <box flexDirection="column"><text fg={theme.colors.primary}><b>◆ XIRANITE // TERMINAL WORKSPACE</b></text><text fg={theme.colors.mutedForeground}>{status}</text></box>
        <box flexDirection="row">{snapshot.workspaces.map((item) => <ClickTarget key={item.id} id={`workspace-${item.id}`} selected={workspaceId === item.id} onClick={() => { setWorkspaceId(item.id); setSelectedId(undefined) }}>{item.label}</ClickTarget>)}<ClickTarget id="global-queue" bordered onClick={() => setQueueOpen(true)}>▤ 队列 F9</ClickTarget></box>
      </box>

      <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} marginTop={1}>
        <WorkbenchPanel title="节点库" description={`${nodes.length} 个可部署节点`} width="26%">
          <box height={3} flexShrink={0} borderStyle="rounded" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1}><input value={search} placeholder="搜索节点…" onInput={(value) => setSearch(String(value))} /></box>
          <scrollbox flexGrow={1}>{visibleNodes.map((node) => <box key={node.id} id={`library-${node.id}`} minHeight={3} flexDirection="column" paddingLeft={1} paddingRight={1} onMouseDown={() => void deploy(node.id)}><text fg={theme.colors.foreground}><b>{`＋ ${node.id}`}</b></text><text fg={theme.colors.mutedForeground}>{node.description}</text></box>)}</scrollbox>
        </WorkbenchPanel>

        <WorkbenchPanel title="动态工作区" description="共享 12 列 Bento 布局 · 点击选中 · Enter 打开节点" flexGrow={1}>
          <scrollbox flexGrow={1}>
            <box flexDirection="row" flexWrap="wrap" gap={1} alignItems="flex-start">
              {projected.length ? projected.map((component) => <box key={component.id} id={`deployed-${component.id}`} width={component.terminalWidth} height={component.terminalHeight} flexDirection="column" borderStyle={selectedId === component.id ? "double" : "rounded"} borderColor={selectedId === component.id ? theme.colors.focusRing : theme.colors.border} paddingLeft={1} paddingRight={1} onMouseDown={() => setSelectedId(component.id)}><text fg={theme.colors.primary}><b>{`◇ ${component.moduleId}`}</b></text><text fg={theme.colors.mutedForeground}>{`x${component.bentoLayout?.x ?? 0} y${component.bentoLayout?.y ?? 0} · ${component.bentoLayout?.w ?? 4}×${component.bentoLayout?.h ?? 4}`}</text><box flexGrow={1} /><text fg={theme.colors.mutedForeground}>Enter 进入节点 UI</text></box>) : <box width="100%" height={10} alignItems="center" justifyContent="center"><text fg={theme.colors.mutedForeground}>从左侧点击节点，将它部署到当前工作区。</text></box>}
            </box>
          </scrollbox>
        </WorkbenchPanel>

        <WorkbenchPanel title="布局检查器" description="移动、缩放或打开选中节点" width="24%">
          {selected ? <Inspector component={selected} onPatch={(patch) => void mutate(patchNodeLayout(snapshot, selected.id, patch))} onOpen={() => onOpenNode(selected.moduleId)} onRemove={() => void mutate(removeNode(snapshot, selected.id), undefined)} /> : <text fg={theme.colors.mutedForeground}>选择中间的节点卡片后，可在这里编辑布局。</text>}
        </WorkbenchPanel>
      </box>
      <box height={2} flexShrink={0} flexDirection="row" justifyContent="space-between"><text fg={theme.colors.mutedForeground}>鼠标优先 · Enter 打开 · Delete 删除 · F9 任务队列</text><ClickTarget id="exit" onClick={onExit}>× 退出</ClickTarget></box>
    </box>
  )
}

function Inspector({ component, onPatch, onOpen, onRemove }: { component: WorkspaceSnapshotDTO["components"][number]; onPatch: (patch: { x?: number; y?: number; w?: number; h?: number }) => void; onOpen: () => void; onRemove: () => void }) {
  const layout = component.bentoLayout ?? { x: 0, y: 0, w: 4, h: 4 }
  return <box flexDirection="column" gap={1}><text><b>{component.moduleId}</b></text><text>{component.id}</text><text>位置</text><box flexDirection="row"><WorkbenchButton id="move-left" onClick={() => onPatch({ x: layout.x - 1 })}>← 左</WorkbenchButton><WorkbenchButton id="move-right" onClick={() => onPatch({ x: layout.x + 1 })}>右 →</WorkbenchButton></box><box flexDirection="row"><WorkbenchButton id="move-up" onClick={() => onPatch({ y: layout.y - 1 })}>↑ 上</WorkbenchButton><WorkbenchButton id="move-down" onClick={() => onPatch({ y: layout.y + 1 })}>下 ↓</WorkbenchButton></box><text>尺寸</text><box flexDirection="row"><WorkbenchButton id="width-minus" onClick={() => onPatch({ w: layout.w - 1 })}>宽 −</WorkbenchButton><WorkbenchButton id="width-plus" onClick={() => onPatch({ w: layout.w + 1 })}>宽 ＋</WorkbenchButton></box><box flexDirection="row"><WorkbenchButton id="height-minus" onClick={() => onPatch({ h: layout.h - 1 })}>高 −</WorkbenchButton><WorkbenchButton id="height-plus" onClick={() => onPatch({ h: layout.h + 1 })}>高 ＋</WorkbenchButton></box><box flexGrow={1} /><WorkbenchButton id="open-node" onClick={onOpen}>↗ 打开节点 TUI</WorkbenchButton><WorkbenchButton id="remove-node" danger onClick={onRemove}>× 删除部署</WorkbenchButton></box>
}
