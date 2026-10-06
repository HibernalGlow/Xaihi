/* @jsxImportSource @opentui/react */
import { useEffect, useState, type ReactNode } from "react"

import type { TerminalTaskQueueController, TerminalTaskQueueItem } from "../task-queue.js"
import { useTerminalTheme } from "../theme.js"
import { ClickTarget, WorkbenchButton, WorkbenchPanel } from "./workbench-controls.js"

export function TerminalTaskQueueScreen({ controller, onBack, nodeId }: { controller: TerminalTaskQueueController; onBack: () => void; nodeId?: string }): ReactNode {
  const theme = useTerminalTheme()
  const [allItems, setAllItems] = useState<TerminalTaskQueueItem[]>([])
  const [selected, setSelected] = useState<string>()
  const [error, setError] = useState<string>()
  const refresh = async () => {
    try { setAllItems(await controller.list()); setError(undefined) }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 1_000)
    return () => clearInterval(timer)
  }, [controller])
  const items = nodeId ? allItems.filter((item) => item.nodeId === nodeId) : allItems
  const current = items.find((item) => item.operationId === selected) ?? items[0]
  const control = async (action: "pause" | "resume" | "cancel") => {
    if (!current) return
    try { await controller[action](current.operationId); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  return (
    <box width="100%" height="100%" paddingLeft={1} paddingRight={1} flexDirection="column">
      <box height={3} flexShrink={0} borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="space-between">
        <text fg={theme.colors.primary}><b>▤ 全局任务队列</b></text>
        <box flexDirection="row"><ClickTarget id="task-refresh" onClick={() => void refresh()}>↻ 刷新</ClickTarget><ClickTarget id="task-back" onClick={onBack}>× 返回</ClickTarget></box>
      </box>
      {!controller.available ? <text fg={theme.colors.warning}>{controller.unavailableReason}</text> : null}
      {error ? <text fg={theme.colors.error}>{error}</text> : null}
      <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} marginTop={1}>
        <WorkbenchPanel title={`任务 (${items.length})`} width="58%">
          <scrollbox flexGrow={1}>{items.length ? items.map((item) => <box key={item.operationId} id={`task-${item.operationId}`} height={2} paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="space-between" backgroundColor={(selected ?? items[0]?.operationId) === item.operationId ? theme.colors.border : undefined} onMouseDown={() => setSelected(item.operationId)}><text fg={phaseColor(item.phase, theme)}>{`${phaseIcon(item.phase)} ${item.nodeId}`}</text><text fg={theme.colors.mutedForeground}>{`${item.phase} · ${item.eventCount} events`}</text></box>) : <text fg={theme.colors.mutedForeground}>暂无任务。</text>}</scrollbox>
        </WorkbenchPanel>
        <WorkbenchPanel title="任务控制" flexGrow={1}>
          {current ? <><text fg={theme.colors.foreground}><b>{current.nodeId}</b></text><text fg={theme.colors.mutedForeground}>{current.operationId}</text><text fg={phaseColor(current.phase, theme)}>{`状态：${current.phase}`}</text><text>{current.result?.message ?? "等待任务事件…"}</text><box flexGrow={1} /><box flexDirection="row" gap={1}>{current.phase === "running" ? <WorkbenchButton id="task-pause" onClick={() => void control("pause")}>Ⅱ 暂停</WorkbenchButton> : null}{current.phase === "paused" ? <WorkbenchButton id="task-resume" onClick={() => void control("resume")}>▶ 继续</WorkbenchButton> : null}{current.phase === "running" || current.phase === "paused" || current.phase === "queued" ? <WorkbenchButton id="task-cancel" danger onClick={() => void control("cancel")}>■ 取消</WorkbenchButton> : null}</box></> : <text fg={theme.colors.mutedForeground}>选择任务以查看状态和控制。</text>}
        </WorkbenchPanel>
      </box>
    </box>
  )
}

function phaseIcon(phase: TerminalTaskQueueItem["phase"]) { return phase === "running" ? "▶" : phase === "paused" ? "Ⅱ" : phase === "completed" ? "✓" : phase === "error" ? "!" : phase === "cancelled" ? "■" : "…" }
function phaseColor(phase: TerminalTaskQueueItem["phase"], theme: ReturnType<typeof useTerminalTheme>) { return phase === "running" ? theme.colors.success : phase === "paused" ? theme.colors.warning : phase === "error" || phase === "cancelled" ? theme.colors.error : theme.colors.mutedForeground }
