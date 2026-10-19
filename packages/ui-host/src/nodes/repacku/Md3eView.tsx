import { useState } from "react"
import type { RepackuAction, RepackuData } from "@xiranite/node-repacku/core"
import { Copy, FileImage, FileText, Film, FolderTree, ListTodo, Package, RotateCcw, ShieldAlert, Sparkles, Terminal } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigPopover } from "@/nodes/shared/NodeConfigPopover"
import { NodeRunHistoryPopover } from "@/nodes/shared/NodeRunHistoryPopover"
import {
  ActionIconButton,
  Md3eChoiceChips,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eConnectedGroup,
  Md3eExpressiveHero,
  Md3eNodeSurface,
  Md3eStageLensBar,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import type { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { ACTIONS } from "./constants"
import { ConfigFilePanel, OptionsPanel, PathInput } from "./controls"
import { FileTreePreview } from "./FileTreePreview"
import type { RepackuCardState, RepackuStatusMeta } from "./types"

export interface RepackuMd3eViewProps {
  surface: NodeSurface
  componentId: string
  action: RepackuAction
  configDirty: boolean
  configFilePath?: string
  data: RepackuCardState
  defaults?: Partial<RepackuCardState>
  logs: string[]
  operationPreview: RepackuData["operations"]
  progress: number
  result: RepackuData | null
  running: boolean
  status: RepackuStatusMeta
  types: string[]
  t: ReturnType<typeof useNodeI18n>["t"]
  onActionChange: (value: RepackuAction) => void
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action?: RepackuAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onLoadDefaults: () => Promise<void>
  onPaste: () => void
  onPatch: (patch: Partial<RepackuCardState>) => void
  onReset: () => void
  onRestoreDefault: () => void
  onRestoreHistory: (input: unknown) => void
  onSaveDefault: () => void
  onResetOverride: () => void
}

export function RepackuMd3eView(props: RepackuMd3eViewProps) {
  const [lens, setLens] = useState<"operations" | "tree" | "logs">("operations")
  const modeMeta = ACTIONS.find((item) => item.value === props.action) ?? ACTIONS[1]!
  const ModeIcon = modeMeta.icon
  const dryRun = props.data.dryRun ?? true
  const dangerous = Boolean(props.data.deleteAfter) && !dryRun

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      compact={compact}
      dangerous={dangerous}
      disabled={props.running}
      running={props.running}
      idleIcon={<ModeIcon />}
      label={compact ? "快速启动" : `启动 ${modeMeta.label}`}
      onExecute={() => props.onExecute(props.action)}
    />
  )

  if (props.surface.mode === "collapsed") {
    return (
      <Md3eCollapsedCapsule
        nodeId="repacku"
        surface={props.surface}
        testId="repacku-md3e-surface"
        icon={Package}
        title="Repacku"
        badgeText={modeMeta.label}
        statusText={
          props.data.progressText ||
          `${props.result?.totalFolders ?? 0} 目录 · ${props.result?.totalOperations ?? 0} 操作`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const fileTypes = props.result?.folderTree?.fileTypes ?? {}
  const stats = [
    { label: "文件夹", value: props.result?.totalFolders ?? 0, tone: "primary" as const },
    { label: "操作", value: props.result?.totalOperations ?? 0, tone: "secondary" as const },
    { label: "图像", value: fileTypes.image ?? 0, tone: "tertiary" as const },
    { label: "视频", value: fileTypes.video ?? 0, tone: "neutral" as const },
    { label: "失败", value: props.result?.failedCount ?? 0, tone: "danger" as const },
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
      nodeId="repacku"
      surface={props.surface}
      data-testid={props.surface.mode === "portrait" ? "repacku-portrait-surface" : "repacku-md3e-surface"}
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={Package}
          title="Repacku"
          domainTag="ARCHIVE REPACKER"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.types.length ? props.types.join(", ") : "全部文件"} · 至少 ${props.data.minCount ?? 2} 个 · ${dryRun ? "预演" : "写入"}`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="repacku-header-toolbar"
          actions={
            <>
              <NodeRunHistoryPopover
                nodeId="repacku"
                componentId={props.componentId}
                disabled={props.running}
                onRestore={props.onRestoreHistory}
              />
              <NodeConfigPopover
                configPath={props.configFilePath}
                defaults={props.defaults as Record<string, unknown> | undefined}
                dirty={props.configDirty}
                disabled={props.running}
                t={props.t}
                onOpenFile={props.onOpenConfigFile}
                onReload={props.onLoadDefaults}
                onRestore={props.onRestoreDefault}
                onSave={props.onSaveDefault}
              />
              <ActionIconButton
                shapeRole="accent"
                icon={RotateCcw}
                label="清空运行状态"
                onClick={props.onReset}
              />
            </>
          }
        />
      </FloatingWindowNodeHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/repacku:grid-cols-[minmax(280px,1.02fr)_minmax(0,1.42fr)]">
        <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
          <Md3eTonalZone
            tone="primary"
            eyebrow="TARGET FOLDER & WORKFLOW"
            title="打包目标与流程阶段"
          >
            <div className="flex flex-col gap-2">
              <PathInput
                compact={props.surface.mode === "compact" || props.surface.mode === "portrait"}
                data={props.data}
                disabled={props.running}
                onPaste={props.onPaste}
                onPatch={props.onPatch}
              />
              <Md3eChoiceChips
                ariaLabel="Repacku 流程阶段"
                options={ACTIONS.map((a) => ({ value: a.value, label: a.label, icon: a.icon }))}
                value={props.action}
                disabled={props.running}
                onChange={props.onActionChange}
              />
            </div>
          </Md3eTonalZone>

          <Md3eTonalZone
            tone="secondary"
            eyebrow="PACKING OPTIONS"
            title="打包配置与条件"
          >
            <div className="flex flex-col gap-2.5">
              <OptionsPanel data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <ConfigFilePanel
                compact
                configFilePath={props.configFilePath}
                configDirty={props.configDirty}
                data={props.data}
                defaults={props.defaults}
                disabled={props.running}
                onOpenConfigFile={props.onOpenConfigFile}
                onPatch={props.onPatch}
                onReset={props.onReset}
                onRestoreDefault={props.onRestoreDefault}
                onSaveDefault={props.onSaveDefault}
                onResetOverride={props.onResetOverride}
              />
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eTonalZone
          tone="default"
          eyebrow="REPACK PLAN & TREE"
          title="重打包计划与目录矩阵"
          testId="repacku-portrait-results"
          actions={
            <Md3eStageLensBar
              items={[
                { id: "operations", label: "计划", icon: ListTodo, badge: props.operationPreview.length },
                { id: "tree", label: "目录树", icon: FolderTree },
                { id: "logs", label: "日志", icon: Terminal, badge: props.logs.length },
              ]}
              value={lens}
              onChange={setLens}
            />
          }
          bodyClassName="flex min-h-0 flex-col gap-2 overflow-hidden"
        >
          <div className="grid shrink-0 grid-cols-3 gap-1.5">
            <div className="flex items-center gap-2 rounded-[14px] bg-[var(--md3e-surface-lowest,var(--muted))] px-2.5 py-1.5 text-xs">
              <FileImage className="size-3.5 text-[var(--md3e-primary,var(--primary))]" />
              <span className="truncate text-[10px] text-muted-foreground">图像</span>
              <strong className="ml-auto font-mono">{fileTypes.image ?? 0}</strong>
            </div>
            <div className="flex items-center gap-2 rounded-[14px] bg-[var(--md3e-surface-lowest,var(--muted))] px-2.5 py-1.5 text-xs">
              <Film className="size-3.5 text-[var(--md3e-primary,var(--primary))]" />
              <span className="truncate text-[10px] text-muted-foreground">视频</span>
              <strong className="ml-auto font-mono">{fileTypes.video ?? 0}</strong>
            </div>
            <div className="flex items-center gap-2 rounded-[14px] bg-[var(--md3e-surface-lowest,var(--muted))] px-2.5 py-1.5 text-xs">
              <FileText className="size-3.5 text-[var(--md3e-primary,var(--primary))]" />
              <span className="truncate text-[10px] text-muted-foreground">文本</span>
              <strong className="ml-auto font-mono">
                {(fileTypes.text ?? 0) + (fileTypes.document ?? 0) + (fileTypes.meta ?? 0)}
              </strong>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
            {lens === "operations" ? (
              <ScrollArea className="h-full">
                {props.operationPreview.length ? (
                  <div className="flex flex-col gap-1.5 p-1">
                    {props.operationPreview.map((item) => (
                      <div
                        key={`${item.sourcePath}:${item.targetPath}`}
                        className="flex items-center justify-between gap-2 rounded-[14px] bg-[var(--md3e-surface-high,var(--card))] px-3 py-2 font-mono text-xs"
                      >
                        <span className="truncate text-muted-foreground">{item.sourcePath}</span>
                        <span className="shrink-0 text-[var(--md3e-primary,var(--primary))]">→</span>
                        <span className="truncate font-bold text-foreground">
                          {item.targetPath || "— 清理 —"}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-40 items-center justify-center p-4 text-center text-xs text-muted-foreground">
                    运行分析或完整流程后，会在此显示重打包计划。
                  </div>
                )}
              </ScrollArea>
            ) : lens === "tree" ? (
              <FileTreePreview root={props.result?.folderTree ?? null} />
            ) : (
              <ScrollArea className="h-full">
                <pre className="p-2 font-mono text-xs leading-5 text-muted-foreground">
                  {props.logs.length ? props.logs.join("\n") : "运行日志会显示在这里。"}
                </pre>
              </ScrollArea>
            )}
          </div>
        </Md3eTonalZone>
      </div>

      <Md3eCommandDock
        leading={
          <div className="flex flex-wrap items-center gap-2">
            <Md3eStatusPill tone={dangerous ? "danger" : "secondary"}>
              {dryRun ? "预演模式" : "真实打包"}
            </Md3eStatusPill>
            <span className="truncate text-xs text-muted-foreground">
              {props.data.progressText || modeMeta.description}
            </span>
          </div>
        }
        trailing={
          <div className="flex items-center gap-1.5">
            <ActionIconButton
              shapeRole="secondary"
              disabled={!props.operationPreview.length}
              icon={Copy}
              label="复制计划"
              onClick={props.onCopyResults}
            />
            {primaryCta(false)}
          </div>
        }
      />
    </Md3eNodeSurface>
  )
}
