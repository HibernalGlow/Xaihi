import { useState } from "react"
import { tt } from "@/lib/i18nText"
import type { FormatvAction, FormatvData } from "@xiranite/node-formatv/core"
import { Copy, FolderOpen, Minus, Plus, RotateCcw, Search, ShieldAlert, Sparkles, Square, Terminal, Video } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eConnectedGroup,
  Md3eExpressiveHero,
  Md3eNodeShapePolicyPanel,
  Md3eNodeSurface,
  Md3eStageLensBar,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { OptionsPopover, PathInput } from "./controls"
import type { FormatvCardState, FormatvPhase, FormatvStatusMeta } from "./types"

export interface FormatvMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  configDirty: boolean
  configFilePath?: string
  data: FormatvCardState
  defaults?: Partial<FormatvCardState>
  dryRun: boolean
  logs: string[]
  pathCount: number
  phase: FormatvPhase
  prefixName: string
  progress: number
  recursive: boolean
  result: FormatvData | null
  running: boolean
  status: FormatvStatusMeta
  tNode: (key: string, fallback: string, vars?: Record<string, unknown>) => string
  onCopyLogs: () => void
  onCopyResults: () => void
  onExecute: (action: FormatvAction) => void
  onOpenConfigFile?: () => Promise<void> | void
  onPaste: () => void
  onPatch: (patch: Partial<FormatvCardState>) => void
  onReset: () => void
  onResetOverride: () => void
  onRestoreDefault: () => void
  onSaveDefault: () => void
}

export function FormatvMd3eView(props: FormatvMd3eViewProps) {
  const [lens, setLens] = useState<"files" | "results" | "logs" | "shapes">("files")
  const scanLabel = props.tNode("buttons.scan", tt("module:formatv.actionScanVideos", "扫描视频"))

  const scanButton = (compact?: boolean) =>
    props.running ? (
      <Button
        aria-label={props.tNode("aria.running", "formatv running")}
        disabled
        size={compact ? "icon-sm" : "sm"}
        variant="secondary"
        className="rounded-full"
      >
        <Square />
        {!compact && <span>{props.tNode("status.running", "运行中")}</span>}
      </Button>
    ) : (
      <Button
        aria-label={scanLabel}
        disabled={!props.pathCount}
        size={compact ? "icon-sm" : "sm"}
        className="rounded-full font-extrabold"
        onClick={() => props.onExecute("scan")}
      >
        <Search />
        {!compact && <span>{scanLabel}</span>}
      </Button>
    )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="formatv"
        surface={props.surface}
        testId="formatv-md3e-surface"
        collapsedTestId="formatv-collapsed-view"
        icon={Video}
        title="FormatV"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.pathCount} 条路径 · #${props.prefixName}`
        }
        progress={props.progress}
        running={props.running}
        action={scanButton(true)}
      />
    )
  }

  const files = buildFileRows(props.result, props.prefixName)
  const resultLines = buildResultLines(props.result, props.prefixName)

  const stats = [
    { label: props.tNode("stats.normal", "普通"), value: props.result?.normalCount ?? 0, tone: "primary" as const },
    { label: props.tNode("stats.nov", ".nov"), value: props.result?.novCount ?? 0, tone: "secondary" as const },
    { label: `#${props.prefixName}`, value: props.result?.prefixedCounts[props.prefixName] ?? 0, tone: "tertiary" as const },
    { label: props.tNode("stats.duplicates", "查重"), value: props.result?.duplicateCount ?? 0, tone: "danger" as const },
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
      nodeId="formatv"
      surface={props.surface}
      data-testid="formatv-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={Video}
          title="FormatV"
          domainTag="NOV & PREFIX STUDIO"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.pathCount} 路径 · ${props.dryRun ? "预演" : "真实执行"} · 前缀 #${props.prefixName}`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="formatv-header-toolbar"
          actions={
            <>
              <OptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <ActionIconButton
                shapeRole="secondary"
                disabled={props.running || !props.pathCount}
                icon={Copy}
                label={props.tNode("buttons.checkDuplicates", tt("module:shared.ui.findDuplicates", "查重"))}
                onClick={() => props.onExecute("check_duplicates")}
              />
              <ActionIconButton
                shapeRole="accent"
                disabled={!props.result && !props.logs.length}
                icon={RotateCcw}
                label={props.tNode("buttons.reset", tt("module:shared.ui.clearState", "清空状态"))}
                onClick={props.onReset}
              />
              <NodeConfigButton
                nodeKey="formatv"
                configDirty={props.configDirty}
                configFilePath={props.configFilePath}
                defaults={props.defaults}
                disabled={props.running}
                onOpenConfigFile={props.onOpenConfigFile}
                onResetOverride={props.onResetOverride}
                onRestoreDefault={props.onRestoreDefault}
                onSaveDefault={props.onSaveDefault}
              />
            </>
          }
        />
      </FloatingWindowNodeHeader>

      <div
        data-testid={
          props.compactSurface
            ? props.portraitCompact
              ? "formatv-portrait-view"
              : "formatv-compact-view"
            : "formatv-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/formatv:grid-cols-[minmax(280px,1fr)_minmax(0,1.42fr)]">
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
            <Md3eTonalZone
              tone="primary"
              eyebrow="VIDEO PATHS"
              title={props.tNode("sections.input", "视频目录输入")}
              badge={<Md3eStatusPill tone="primary">{props.pathCount} 路径</Md3eStatusPill>}
            >
              <PathInput
                compact={props.compactSurface}
                disabled={props.running}
                pathCount={props.pathCount}
                value={props.data.pathText ?? ""}
                onChange={(pathText) => props.onPatch({ pathText })}
                onClear={() => props.onPatch({ pathText: "" })}
                onPaste={props.onPaste}
              />
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="PREFIX & SWITCHES"
              title="后缀与前缀规则"
            >
              <div className="flex flex-col gap-2">
                <div>
                  <div className="mb-1 text-[10px] font-bold text-muted-foreground">自定义前缀标识</div>
                  <Input
                    aria-label="formatv prefix"
                    disabled={props.running}
                    value={props.prefixName}
                    onChange={(e) => props.onPatch({ prefixName: e.currentTarget.value })}
                    className="h-8 rounded-full border-0 bg-[var(--md3e-surface-lowest,var(--muted))] px-3 font-mono text-xs"
                  />
                </div>
                <Md3eConnectedGroup>
                  <Md3eSwitchRow
                    icon={FolderOpen}
                    label="递归扫描"
                    description="扫描子文件夹中的视频与 .nov 文件"
                    checked={props.recursive}
                    disabled={props.running}
                    onCheckedChange={(recursive) => props.onPatch({ recursive })}
                  />
                  <Md3eSwitchRow
                    icon={props.dryRun ? ShieldAlert : Sparkles}
                    label="预演模式"
                    description={props.dryRun ? "仅生成改名预览，不写入磁盘" : "真实修改 .nov 后缀"}
                    checked={props.dryRun}
                    disabled={props.running}
                    onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
                  />
                </Md3eConnectedGroup>
              </div>
            </Md3eTonalZone>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="VIDEO MANIFEST"
            title="视频状态与查重列表"
            actions={
              <Md3eStageLensBar
                items={[
                  { id: "files", label: props.tNode("tabs.files", "文件"), icon: Video, badge: files.length },
                  { id: "results", label: props.tNode("tabs.results", "重复"), icon: Copy, badge: resultLines.length },
                  { id: "logs", label: props.tNode("tabs.logs", "日志"), icon: Terminal, badge: props.logs.length },
                  { id: "shapes", label: "形状" },
                ]}
                value={lens}
                onChange={setLens}
              />
            }
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              {lens === "files" ? (
                <ScrollArea className="h-full">
                  {files.length ? (
                    <div className="flex flex-col gap-1.5 p-1">
                      {files.map((f) => (
                        <div
                          key={f.path}
                          className="flex items-center justify-between gap-2 rounded-[14px] bg-[var(--md3e-surface-high,var(--card))] px-3 py-2 text-xs"
                        >
                          <span className="truncate font-mono" title={f.path}>
                            {f.path.split(/[\\/]/).at(-1)}
                          </span>
                          <Md3eStatusPill tone={f.state === "重复" ? "danger" : "secondary"}>
                            {f.state}
                          </Md3eStatusPill>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-40 items-center justify-center text-center text-xs text-muted-foreground">
                      {props.tNode("empty.results", "扫描后会显示文件列表。")}
                    </div>
                  )}
                </ScrollArea>
              ) : lens === "results" ? (
                <ScrollArea className="h-full">
                  <pre className="p-2 font-mono text-xs text-muted-foreground">
                    {resultLines.length
                      ? resultLines.join("\n")
                      : props.tNode("empty.results", "扫描、加/移除 .nov 或查重后会显示文件列表和操作结果。")}
                  </pre>
                </ScrollArea>
              ) : lens === "logs" ? (
                <ScrollArea className="h-full">
                  <pre className="p-2 font-mono text-xs text-muted-foreground">
                    {props.logs.length ? props.logs.join("\n") : props.tNode("empty.logs", "运行日志会显示在这里。")}
                  </pre>
                </ScrollArea>
              ) : (
                <Md3eNodeShapePolicyPanel nodeId="formatv" />
              )}
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex flex-wrap items-center gap-2">
              <Md3eStatusPill tone={props.dryRun ? "secondary" : "danger"}>
                {props.dryRun ? "DRY-RUN 预演" : "LIVE 真实改缀"}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                前缀 #{props.prefixName}
              </span>
            </div>
          }
          trailing={
            <div className="flex flex-wrap items-center gap-1.5">
              {scanButton(props.compactSurface)}
              <ExecuteButton
                compact
                dangerous={!props.dryRun}
                disabled={props.running || !props.pathCount}
                label={props.tNode("buttons.addNov", "添加 .nov")}
                idleIcon={<Plus />}
                onExecute={() => props.onExecute("add_nov")}
              />
              <ExecuteButton
                compact
                dangerous={!props.dryRun}
                disabled={props.running || !props.pathCount}
                label={props.tNode("buttons.removeNov", "移除 .nov")}
                idleIcon={<Minus />}
                onExecute={() => props.onExecute("remove_nov")}
              />
            </div>
          }
        />
      </div>
    </Md3eNodeSurface>
  )
}

function buildResultLines(result: FormatvData | null, prefixName: string): string[] {
  if (!result) return []
  if (result.operations.length) {
    return result.operations.map((item) => `${item.status} ${item.sourcePath} -> ${item.targetPath}${item.reason ? ` / ${item.reason}` : ""}`)
  }
  if (result.duplicates.length) {
    return result.duplicates.map((item) => `duplicate ${item}`)
  }
  return [
    ...result.normalFiles.map((file) => `normal ${file}`),
    ...result.novFiles.map((file) => `.nov ${file}`),
    ...(result.prefixedFiles[prefixName] ?? []).map((file) => `${prefixName} ${file}`),
  ]
}

function buildFileRows(result: FormatvData | null, prefixName: string): Array<{ path: string; state: string }> {
  if (!result) return []
  const duplicates = new Set(result.duplicates)
  return [
    ...result.normalFiles.map((path) => ({ path, state: duplicates.has(path) ? tt("module:shared.ui.duplicate", "重复") : tt("module:formatv.visibleLabel", "可见") })),
    ...result.novFiles.map((path) => ({ path, state: tt("module:formatv.hiddenNovState", "隐藏 (.nov)") })),
    ...(result.prefixedFiles[prefixName] ?? []).map((path) => ({ path, state: tt("module:formatv.prefixedFiles", "前缀文件") })),
  ]
}
