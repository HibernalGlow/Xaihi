import type { LinedupFilterResult } from "@xiranite/node-linedup/core"
import { ArrowDownAZ, CaseSensitive, Clipboard, Copy, Eraser, Filter, RotateCcw, Zap } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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
import type { useNodeI18n } from "@/nodes/shared/useNodeI18n"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { LinedupDisplayTabs } from "./ResultPanels"
import type { LinedupCardState, LinedupPhase, LinedupStatusMeta } from "./types"

export interface LinedupMd3eViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
  configDirty: boolean
  configLoading: boolean
  configPath?: string
  caseSensitive: boolean
  defaults?: Record<string, unknown>
  filterCount: number
  filterText: string
  logs: string[]
  phase: LinedupPhase
  progress: number
  result: LinedupFilterResult | null
  running: boolean
  sort: boolean
  sourceCount: number
  sourceText: string
  status: LinedupStatusMeta
  t: ReturnType<typeof useNodeI18n>["t"]
  onCopyKept: () => void
  onCopyRemoved: () => void
  onDownload: () => void
  onLoadDefaults: () => Promise<void>
  onOpenConfigFile: () => Promise<void>
  onRestoreDefaults: () => void
  onSaveDefault: () => Promise<void>
  onExecute: () => void
  onPasteFilter: () => void
  onPasteSource: () => void
  onPatch: (patch: Partial<LinedupCardState>) => void
  onReset: () => void
}

export function LinedupMd3eView(props: LinedupMd3eViewProps) {
  const runBtn = (
    <Button
      disabled={!props.sourceCount || props.running}
      size="sm"
      className="rounded-full font-extrabold"
      onClick={props.onExecute}
    >
      <Zap className="size-3.5" />
      运行过滤
    </Button>
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="linedup"
        surface={props.surface}
        testId="linedup-md3e-surface"
        collapsedTestId="linedup-collapsed-view"
        icon={Filter}
        title="Linedup"
        badgeText={props.status.label}
        statusText={
          props.result
            ? `保留 ${props.result.keptCount} / 移除 ${props.result.removedCount}`
            : `${props.sourceCount} 源 / ${props.filterCount} 过滤词`
        }
        progress={props.progress}
        running={props.running}
        action={
          <ActionIconButton
            shapeRole="primary"
            disabled={!props.sourceCount || props.running}
            icon={Zap}
            label="运行过滤"
            onClick={props.onExecute}
          />
        }
      />
    )
  }

  const stats = [
    { label: "源行数", value: props.sourceCount, tone: "primary" as const },
    { label: "过滤词", value: props.filterCount, tone: "secondary" as const },
    { label: "保留", value: props.result?.keptCount ?? 0, tone: "tertiary" as const },
    { label: "移除", value: props.result?.removedCount ?? 0, tone: "danger" as const },
  ]

  const statusTone =
    props.status.tone === "error"
      ? "danger"
      : props.status.tone === "success"
        ? "secondary"
        : "neutral"

  return (
    <Md3eNodeSurface
      nodeId="linedup"
      surface={props.surface}
      data-testid="linedup-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={Filter}
          title="Linedup"
          domainTag="LINE SIEVE"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.result
              ? `保留 ${props.result.keptCount} 行 · 移除 ${props.result.removedCount} 行`
              : `${props.sourceCount} 源行 · ${props.filterCount} 过滤词`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="linedup-header-toolbar"
          actions={
            <>
              <ActionIconButton
                shapeRole="secondary"
                disabled={!props.result}
                icon={Copy}
                label="复制保留结果"
                onClick={props.onCopyKept}
              />
              <ActionIconButton
                shapeRole="accent"
                disabled={!props.result}
                icon={RotateCcw}
                label="清空状态"
                onClick={props.onReset}
              />
              <NodeConfigPopover
                configPath={props.configPath}
                defaults={props.defaults}
                dirty={props.configDirty}
                loading={props.configLoading}
                t={props.t}
                onOpenFile={props.onOpenConfigFile}
                onReload={props.onLoadDefaults}
                onRestore={props.onRestoreDefaults}
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
              ? "linedup-portrait-view"
              : "linedup-compact-view"
            : "linedup-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/linedup:grid-cols-[minmax(280px,1.02fr)_minmax(0,1.38fr)]">
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
            <Md3eTonalZone
              tone="primary"
              eyebrow="RAW INPUT STREAM"
              title="源文本"
              badge={<Md3eStatusPill tone="primary">{props.sourceCount} 行</Md3eStatusPill>}
              actions={
                <>
                  <ActionIconButton
                    shapeRole="secondary"
                    icon={Clipboard}
                    label="粘贴源文本"
                    onClick={props.onPasteSource}
                  />
                  <ActionIconButton
                    shapeRole="accent"
                    disabled={!props.sourceText}
                    icon={Eraser}
                    label="清空源文本"
                    onClick={() => props.onPatch({ sourceText: "" })}
                  />
                </>
              }
            >
              <Textarea
                aria-label="源文本"
                className="h-24 min-h-24 resize-none rounded-[16px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
                placeholder="每行一条"
                value={props.sourceText}
                onChange={(e) => props.onPatch({ sourceText: e.currentTarget.value })}
              />
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="FILTER TOKENS"
              title="过滤词"
              badge={<Md3eStatusPill tone="secondary">{props.filterCount} 词</Md3eStatusPill>}
              actions={
                <>
                  <ActionIconButton
                    shapeRole="secondary"
                    icon={Clipboard}
                    label="粘贴过滤词"
                    onClick={props.onPasteFilter}
                  />
                  <ActionIconButton
                    shapeRole="accent"
                    disabled={!props.filterText}
                    icon={Eraser}
                    label="清空过滤词"
                    onClick={() => props.onPatch({ filterText: "" })}
                  />
                </>
              }
            >
              <Textarea
                aria-label="过滤词"
                className="h-20 min-h-20 resize-none rounded-[16px] border-0 bg-[var(--md3e-surface-lowest,var(--muted))] font-mono text-xs"
                placeholder="移除包含这些词的源行"
                value={props.filterText}
                onChange={(e) => props.onPatch({ filterText: e.currentTarget.value })}
              />
            </Md3eTonalZone>

            <Md3eConnectedGroup>
              <Md3eSwitchRow
                icon={CaseSensitive}
                label="区分大小写"
                description="beta 不会匹配 Beta"
                checked={props.caseSensitive}
                onCheckedChange={(caseSensitive) => props.onPatch({ caseSensitive })}
              />
              <Md3eSwitchRow
                icon={ArrowDownAZ}
                label="结果排序"
                description="保留与移除的结果按自然顺序排列"
                checked={props.sort}
                onCheckedChange={(sort) => props.onPatch({ sort })}
              />
            </Md3eConnectedGroup>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="FILTERED OUTPUT"
            title="处理输出与行级对比"
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              <LinedupDisplayTabs
                compact={props.compactSurface}
                logs={props.logs}
                phase={props.phase}
                result={props.result}
                sourceText={props.sourceText}
                onCopyKept={props.onCopyKept}
                onCopyRemoved={props.onCopyRemoved}
                onDownload={props.onDownload}
              />
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex flex-wrap items-center gap-2">
              <Md3eStatusPill tone="secondary">
                {props.caseSensitive ? "大小写敏感" : "忽略大小写"} · {props.sort ? "自然排序" : "原序保留"}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                {props.status.description}
              </span>
            </div>
          }
          trailing={runBtn}
        />
      </div>
    </Md3eNodeSurface>
  )
}
