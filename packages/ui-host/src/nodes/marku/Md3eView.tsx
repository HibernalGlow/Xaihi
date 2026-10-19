import type { MarkuAction } from "@xiranite/node-marku/core"
import { Copy, FileCode, FolderTree, History, Play, RotateCcw, ShieldAlert, Sparkles, Undo2 } from "lucide-react"
import { FloatingWindowNodeHeader } from "@/components/workspace/FloatingWindowFrame"
import { ExecuteButton } from "@/nodes/shared/ExecuteButton"
import { NodeConfigButton } from "@/nodes/shared/NodeConfigPopover"
import {
  ActionIconButton,
  Md3eChoiceChips,
  Md3eCollapsedCapsule,
  Md3eCommandDock,
  Md3eConnectedGroup,
  Md3eExpressiveHero,
  Md3eNodeSurface,
  Md3eStatusPill,
  Md3eSwitchRow,
  Md3eTonalZone,
} from "@/nodes/shared/controls"
import type { NodeSurface } from "@/nodes/shared/useNodeSurface"
import { MODULES } from "./constants"
import { AdvancedOptionsPopover, ConfigField, PathInput, ResultTabs, TextInput } from "./controls"
import type { MarkuViewProps } from "./normal-views"

export interface MarkuMd3eViewProps extends MarkuViewProps {
  surface: NodeSurface
  forceCollapsedSurface: boolean
  compactSurface: boolean
  portraitCompact: boolean
}

export function MarkuMd3eView(props: MarkuMd3eViewProps) {
  const disabled = props.hasText ? !props.data.inputText?.trim() : !props.pathCount
  const dangerous = !props.dryRun && !props.hasText
  const label = props.dryRun ? "预演处理" : "真实写回"
  const action: MarkuAction = props.hasText ? "text" : "run"

  const primaryCta = (compact?: boolean) => (
    <ExecuteButton
      dangerous={dangerous}
      running={props.running}
      disabled={disabled}
      compact={compact}
      label={label}
      idleIcon={dangerous ? <ShieldAlert /> : <Play />}
      onExecute={() => props.onExecute(action)}
    />
  )

  if (props.surface.mode === "collapsed" || props.forceCollapsedSurface) {
    return (
      <Md3eCollapsedCapsule
        nodeId="marku"
        surface={props.surface}
        testId="marku-md3e-surface"
        collapsedTestId="marku-collapsed-view"
        icon={FileCode}
        title="Marku"
        badgeText={props.status.label}
        statusText={
          props.data.progressText ||
          `${props.moduleMeta.shortLabel} · ${props.hasText ? "文本模式" : `${props.pathCount} 路径`}`
        }
        progress={props.progress}
        running={props.running}
        action={primaryCta(true)}
      />
    )
  }

  const stats = [
    { label: "已处理", value: props.result?.filesProcessed ?? 0, tone: "primary" as const },
    { label: "已变更", value: props.result?.filesChanged ?? 0, tone: "secondary" as const },
    { label: "差异", value: props.result?.diffs.filter((item) => item.changed).length ?? 0, tone: "tertiary" as const },
    { label: "历史", value: props.result?.history.length ?? 0, tone: "neutral" as const },
    { label: "错误", value: props.result?.errors.length ?? 0, tone: "danger" as const },
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
      nodeId="marku"
      surface={props.surface}
      data-testid="marku-md3e-surface"
      data-ui-variant="md3e"
      className="flex h-full min-h-0 w-full flex-col gap-2.5 p-2.5"
    >
      <FloatingWindowNodeHeader>
        <Md3eExpressiveHero
          icon={FileCode}
          title="Marku"
          domainTag="MARKDOWN PIPELINE"
          statusLabel={props.status.label}
          statusTone={statusTone}
          subtitle={
            props.data.progressText ||
            `${props.moduleMeta.label} · ${props.hasText ? "文本模式" : "路径模式"} · ${props.dryRun ? "预演" : "真实执行"}`
          }
          progress={props.progress}
          running={props.running}
          stats={stats}
          toolbarTestId="marku-header-toolbar"
          actions={
            <>
              <AdvancedOptionsPopover data={props.data} disabled={props.running} onPatch={props.onPatch} />
              <ActionIconButton
                shapeRole="secondary"
                disabled={props.running}
                icon={History}
                label="读取历史"
                onClick={() => props.onExecute("history")}
              />
              <ActionIconButton
                shapeRole="tertiary"
                disabled={props.running}
                icon={Undo2}
                label="撤销最近"
                onClick={() => props.onExecute("undo")}
              />
              <ActionIconButton
                shapeRole="utility"
                disabled={!props.result?.outputText && !props.result?.diffText && !props.result?.diffs.length}
                icon={Copy}
                label="复制输出"
                onClick={props.onCopyOutput}
              />
              <ActionIconButton
                shapeRole="accent"
                disabled={!props.logs.length}
                icon={RotateCcw}
                label="清空状态"
                onClick={props.onReset}
              />
              <NodeConfigButton
                nodeKey="marku"
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
              ? "marku-portrait-view"
              : "marku-compact-view"
            : "marku-full-view"
        }
        className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden"
      >
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-2.5 @3xl/marku:grid-cols-[minmax(280px,1.04fr)_minmax(0,1.38fr)]">
          <div className="flex min-h-0 flex-col gap-2.5 overflow-auto pr-0.5">
            <Md3eTonalZone
              tone="primary"
              eyebrow="TRANSFORM MODULE"
              title="Markdown 转换模块矩阵"
              badge={<Md3eStatusPill tone="primary">{props.moduleMeta.shortLabel}</Md3eStatusPill>}
            >
              <div className="flex flex-col gap-2">
                <Md3eChoiceChips
                  ariaLabel="Markdown 转换模块"
                  options={MODULES.map((m) => ({ value: m.id, label: m.shortLabel, icon: m.icon }))}
                  value={props.moduleMeta.id}
                  disabled={props.running}
                  onChange={props.onModuleChange}
                />
                <ConfigField
                  disabled={props.running}
                  value={props.data.configText ?? ""}
                  onChange={(configText) => props.onPatch({ configText })}
                />
              </div>
            </Md3eTonalZone>

            <Md3eTonalZone
              tone="secondary"
              eyebrow="MARKDOWN SOURCE"
              title="文本与文件输入"
              badge={
                <Md3eStatusPill tone="secondary">
                  {props.hasText ? "内联文本" : `${props.pathCount} 路径`}
                </Md3eStatusPill>
              }
            >
              <div className="flex flex-col gap-2">
                <TextInput
                  compact={props.compactSurface}
                  disabled={props.running}
                  value={props.data.inputText ?? ""}
                  onChange={(inputText) => props.onPatch({ inputText })}
                  onClear={() => props.onPatch({ inputText: "" })}
                  onPaste={props.onPasteText}
                />
                <PathInput
                  compact={props.compactSurface}
                  disabled={props.running || props.hasText}
                  pathCount={props.pathCount}
                  value={props.data.pathText ?? ""}
                  onChange={(pathText) => props.onPatch({ pathText })}
                  onClear={() => props.onPatch({ pathText: "" })}
                  onPaste={props.onPastePath}
                />
              </div>
            </Md3eTonalZone>

            <Md3eConnectedGroup>
              <Md3eSwitchRow
                icon={FolderTree}
                label="递归扫描"
                description="递归处理子目录中的 .md 文件"
                checked={props.data.recursive ?? true}
                disabled={props.running || props.hasText}
                onCheckedChange={(recursive) => props.onPatch({ recursive })}
              />
              <Md3eSwitchRow
                icon={History}
                label="记录撤销快照"
                description="真实写回前保存备份以便一键还原"
                checked={props.data.enableUndo ?? true}
                disabled={props.running || props.hasText}
                onCheckedChange={(enableUndo) => props.onPatch({ enableUndo })}
              />
              <Md3eSwitchRow
                icon={props.dryRun ? ShieldAlert : Sparkles}
                label="预演模式"
                description={props.dryRun ? "仅生成 Diff 与输出预览" : "真实写回 Markdown 文件"}
                checked={props.dryRun}
                disabled={props.running}
                onCheckedChange={(dryRun) => props.onPatch({ dryRun })}
              />
            </Md3eConnectedGroup>
          </div>

          <Md3eTonalZone
            tone="default"
            eyebrow="DIFF & OUTPUT STREAM"
            title="Markdown 差异与输出预览"
            bodyClassName="flex min-h-0 flex-col overflow-hidden"
          >
            <div className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-[var(--md3e-surface-lowest,var(--muted))]/65 p-2">
              <ResultTabs
                compact={props.compactSurface}
                logs={props.logs}
                result={props.result}
                onCopyLogs={props.onCopyLogs}
                onCopyOutput={props.onCopyOutput}
              />
            </div>
          </Md3eTonalZone>
        </div>

        <Md3eCommandDock
          leading={
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 overflow-hidden">
              <Md3eStatusPill tone={dangerous ? "danger" : "secondary"}>
                {props.dryRun ? "DRY-RUN 预演" : "LIVE 真实写回"}
              </Md3eStatusPill>
              <span className="truncate text-xs text-muted-foreground">
                {props.data.progressText || props.moduleMeta.description}
              </span>
            </div>
          }
          trailing={primaryCta(props.compactSurface)}
        />
      </div>
    </Md3eNodeSurface>
  )
}
