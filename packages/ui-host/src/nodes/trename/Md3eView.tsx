import type { TrenameAction, TrenameData, TrenameScanMode } from "@xiranite/node-trename/core"
import { Copy, FilePenLine, History, Play, RotateCcw, ScanSearch, Search, ShieldAlert, Sparkles } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eConnectedGroup,
  Md3eExpressiveHero,
  Md3eNodeSurface,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import { tNode, type useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { AdvancedOptionsPopover, KeySwitches, ModePicker, PathInput } from "./controls"
import { FileTreePanel } from "./FileTreePanel"
import { JsonEditorDialog } from "./JsonEditorDialog"
import { TrenameDisplayTabs } from "./ResultPanels"
import type { buildTreeModel } from "./treeModel"
import type { TrenameCardState, TrenamePhase, TrenameStatusMeta } from "./types"

export interface TrenameMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  configDirty: boolean
  configFilePath?: string
  data: TrenameCardState
  defaults?: Partial<TrenameCardState>
  dryRun: boolean
  jsonText: string
  logs: string[]
  mode: TrenameScanMode
  pathCount: number
  phase: TrenamePhase
  progress: number
  result: TrenameData | null
  running: boolean
  status: TrenameStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  tree: ReturnType<typeof buildTreeModel>
  onCopyJson: () => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action: TrenameAction, override?: Partial<TrenameCardState>) => void
  onModeChange: (mode: TrenameScanMode) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPasteJson: () => void
  onPastePath: () => void
  onPatch: (patch: Partial<TrenameCardState>) => void
  onReset: () => void
  onReloadDefaults: () => Promise<void>
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

export function TrenameMd3eView(props: TrenameMd3eViewProps) {
  const disabled = !props.jsonText
  const dangerous = !props.dryRun
  const label = props.dryRun
    ? tNode("trename", "actions.dryRename", "预演重命名")
    : tNode("trename", "actions.liveRename", "真实重命名")

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      dangerous={dangerous}
      running={props.running}
      disabled={disabled}
      compact={compact}
      label={label}
      idleIcon={dangerous ? <ShieldAlert /> : <Play />}
      onExecute={() => props.onExecute("rename")}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="trename"
        surface={props.surface}
        testId="trename-md3e-surface"
        collapsedTestId="trename-collapsed-view"
        icon={FilePenLine}
        title="Trename"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.tree.total} 项 · 就绪 ${props.tree.ready} · ${props.dryRun ? "预演" : "真实"}`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const stats = [
    { label: tNode("trename", "statTotal", "总计"), value: props.result?.totalItems ?? props.tree.total, tone: "primary" as const },
    { label: tNode("trename", "statPending", "待填"), value: props.result?.pendingCount ?? props.tree.pending, tone: "neutral" as const },
    { label: tNode("trename", "statReady", "就绪"), value: props.result?.readyCount ?? props.tree.ready, tone: "secondary" as const },
    { label: tNode("trename", "statOk", "成功"), value: props.result?.successCount ?? 0, tone: "tertiary" as const },
    { label: tNode("trename", "statConflicts", "冲突"), value: props.result?.conflicts.length ?? 0, tone: "danger" as const },
  ]

  const statusTone =
    props.status.tone === "error"
      ? "danger"
      : props.status.tone === "running"
        ? "primary"
        : props.status.tone === "success"
          ? "secondary"
          : "neutral"

  return (
    <Md3eNodeSurface
      nodeId="trename"
      surface={props.surface}
      data-testid="trename-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={FilePenLine}
          title="Trename"
          domainTag="JSON TREE RENAME"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.pathCount} 条路径 · 树节点 ${props.tree.total} · 就绪 ${props.tree.ready}`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="trename-header-toolbar"
          actions={
            <>
              <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <ActionIconButton
                shapeRole="primary"
                disabled={props.running || !props.pathCount}
                icon={ScanSearch}
                label={tNode("trename", "actions.scanPaths", "扫描路径")}
                onClick={() => props.onExecute("scan")}
              />
              <JsonEditorDialog
                disabled={props.running}
                jsonText={props.jsonText}
                pendingCount={props.tree.pending}
                readyCount={props.tree.ready}
                totalCount={props.tree.total}
                onChange={(jsonText) => props.onPatch({ jsonText })}
                onCopy={props.onCopyJson}
                onImport={() => props.onExecute("import")}
                onPaste={props.onPasteJson}
              />
              <ActionIconButton
                shapeRole="secondary"
                disabled={props.running || !props.jsonText}
                icon={Search}
                label={tNode("trename", "actions.validate", "校验冲突")}
                onClick={() => props.onExecute("validate")}
              />
              <ActionIconButton
                shapeRole="tertiary"
                disabled={props.running}
                icon={History}
                label={tNode("trename", "actions.history", "读取历史")}
                onClick={() => props.onExecute("history")}
              />
              <ActionIconButton
                shapeRole="utility"
                disabled={!props.jsonText}
                icon={Copy}
                label={tNode("trename", "copyJson", "复制 JSON")}
                onClick={props.onCopyJson}
              />
              <ActionIconButton
                shapeRole="accent"
                disabled={!props.result && !props.logs.length}
                icon={RotateCcw}
                label={tNode("trename", "actions.clearState", "清空状态")}
                onClick={props.onReset}
              />
              <NodeConfigPopover
                configPath={props.configFilePath}
                defaults={props.defaults}
                dirty={props.configDirty}
                disabled={props.running}
                t={props.t}
                onOpenFile={props.onOpenConfigFile}
                onReload={props.onReloadDefaults}
                onRestore={props.onRestoreDefault}
                onSave={props.onSaveDefault}
              />
            </>
          }
        />
      </FloatingWindowNodeHeader>

      <div
        data-testid={
          props.compactSurface
            ? props.portraitCompact
              ? "trename-portrait-view"
              : "trename-compact-view"
            : "trename-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/trename:grid-cols-[minmax(270px,0.98fr)_minmax(0,1.42fr)]">
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
            <Md3eTonalZone
              tone="primary"
              eyebrow="SCAN TARGET & MODE"
              title="扫描路径与导出格式"
              badge={<Md3eStatusPill tone="primary">{props.pathCount} 路径</Md3eStatusPill>}
            >
              <div className="flex flex-col gap-2">
                <ModePicker
                  disabled={props.running}
                  mode={props.mode}
                  onModeChange={props.onModeChange}
                />
                <PathInput
                  compact={props.compactSurface}
                  disabled={props.running}
                  pathCount={props.pathCount}
                  value={props.data.pathText ?? ""}
                  onChange={(pathText) => props.onPatch({ pathText })}
                  onClear={() => props.onPatch({ pathText: "" })}
                  onPaste={props.onPastePath}
                />
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="RENAME SWITCHES"
              title="关键开关与安全闸门"
            >
              <div className="flex flex-col gap-2">
                <KeySwitches
                  compact={props.compactSurface}
                  data={props.data}
                  disabled={props.running}
                  onPatch={props.onPatch}
                />
                <Md3eConnectedGroup>
                  <Md3eSwitchRow
                    icon={props.dryRun ? ShieldAlert : Sparkles}
                    label="预演模式"
                    description={props.dryRun ? "仅校验差异与冲突，不改动磁盘" : "真实按 JSON 映射批量重命名"}
                    checked={props.dryRun}
                    disabled={props.running}
                    onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
                  />
                </Md3eConnectedGroup>
              </div>
            </Md3eTonalZone>

            {!props.compactSurface ? (
              <Md3eTonalZone
                tone="tertiary"
                eyebrow="TREE SNAPSHOT"
                title="JSON 结构树快照"
                className="min-h-40 flex-1"
                bodyClassName="flex min-h-0 flex-col overflow-hidden"
              >
                <FileTreePanel jsonText={props.jsonText} />
              </Md3eTonalZone>
            ) : null}
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="DIFF QUEUE & CONFLICTS"
            title="差异队列、冲突热区与批次记录"
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              <TrenameDisplayTabs
                compact={props.compactSurface}
                jsonText={props.jsonText}
                logs={props.logs}
                phase={props.phase}
                result={props.result}
                running={props.running}
                onCopyLogs={props.onCopyLogs}
                onCopyResults={props.onCopyResults}
                onUndoBatch={(batchId) => props.onExecute("undo", { batchId })}
              />
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex flex-wrap items-center gap-2">
              <Md3eStatusPill tone={props.dryRun ? "secondary" : "danger"}>
                {props.dryRun ? "预演" : "真实"}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                {props.data.progressText || `树总计 ${props.tree.total} 项 · 就绪 ${props.tree.ready} 项`}
              </span>
            </div>
          }
          trailing={primaryCta(props.compactSurface)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
