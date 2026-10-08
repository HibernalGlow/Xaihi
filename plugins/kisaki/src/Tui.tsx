/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react"
import { useState } from "react"
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal"
import type { TerminalInteractionDefinition } from "@hibernalglow/xaihi-cli-runtime/interaction"
import {
  ActionLauncher,
  ActionTabs,
  ClickTarget,
  ExecutionActions,
  ProgressBar,
  TerminalThemeProvider,
  WorkbenchField,
  WorkbenchPanel,
  resolveTerminalTheme,
  terminalIcon,
  useAnimation,
  useTerminalChromeActions,
  useTerminalTheme,
  useTerminalUiSession,
} from "@hibernalglow/xaihi-cli-runtime/terminal/opentui"
import { createTerminalTranslator } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type { TerminalLanguage } from "@hibernalglow/xaihi-cli-runtime/i18n"
import type {
  KisakiEntry,
  KisakiInput,
  KisakiResult,
  KisakiTerminalTool,
} from "./core.js"
import { smartSelect } from "./selection-strategies.js"
import { kisakiToolLabel } from "./interaction.js"
import { getKisakiTerminalToolOptions } from "./tool-options.js"
import { buildKisakiAnalysis } from "./analysis.js"
import { formatKisakiActivityMessage } from "./activity-log.js"

export function KisakiTui(props: TerminalUiScreenProps<KisakiInput, KisakiResult>): import('react').ReactNode {
  const [theme] = useState(props.theme ?? props.preferences?.current.theme ?? "nord")
  return (
    <TerminalThemeProvider theme={resolveTerminalTheme(theme === "inherit" ? "nord" : theme)}>
      <Workbench {...props} />
    </TerminalThemeProvider>
  )
}

export interface KisakiTerminalDefinition extends TerminalInteractionDefinition<KisakiInput, KisakiResult> {
  openPath?: (path: string) => Promise<void>
}

type SetupTab = "roots" | "filters" | "algorithm" | "operations"
type ResultView = "all" | "selected" | "operation"
type InspectorTab = "details" | "operation" | "logs"

/**
 * Terminal-native forensics console.
 *
 * Deliberately not a GUI swimlane clone: one interactive scanner palette,
 * a setup column, a dominant result table, and a stacked inspector/log deck.
 * Tool selection appears exactly once.
 */
function Workbench({ definition, language, onExit }: TerminalUiScreenProps<KisakiInput, KisakiResult>) {
  const theme = useTerminalTheme()
  const t = createTerminalTranslator(language)
  const session = useTerminalUiSession(definition)
  const data = session.result?.data
  const zh = language === "zh"
  const l = (zhText: string, enText: string) => (zh ? zhText : enText)
  const pulse = useAnimation({ intervalMs: session.phase === "running" ? 110 : 600 })

  const [setupTab, setSetupTab] = useState<SetupTab>("roots")
  const [resultView, setResultView] = useState<ResultView>("all")
  const [inspector, setInspector] = useState<InspectorTab>("details")
  const [resultFocused, setResultFocused] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [activePath, setActivePath] = useState<string>()

  useTerminalChromeActions({ onReset: session.reset, onExit })

  const field = (id: string) => definition.schema.fields.find((item) => item.id === id)!
  const Field = ({ id }: { id: string }) => (
    <WorkbenchField
      field={field(id)}
      value={session.values[id]}
      error={session.fieldErrors[id]}
      focused={session.focusedControlId === id}
      disabled={session.phase === "running"}
      t={t}
      onFocus={() => {
        setResultFocused(false)
        session.focus(id)
      }}
      onChange={(value) => session.setField(id, value)}
    />
  )

  const tool = session.values.tool as KisakiTerminalTool
  const action = String(session.values.action ?? "scan")
  // The scanner palette reads the vocabulary the node publishes in its interaction contract (the `tool`
  // field's options), rather than importing `core.js` as a value: one list for the prompts, this palette and
  // the host's own input validation, and no second engine inside the face process (ADR-0074 §5).
  const toolList = (field("tool").options ?? []).map((option) => String(option.value) as KisakiTerminalTool)
  const toolIndex = Math.max(0, toolList.indexOf(tool))
  const entries = data?.entries ?? []
  const activeEntry = entries.find((entry) => entry.path === activePath) ?? entries[0]
  const activeIndex = Math.max(0, activeEntry ? entries.indexOf(activeEntry) : 0)
  const selectedSet = new Set(selectedPaths)
  const resultEntries =
    resultView === "selected"
      ? entries.filter((entry) => selectedSet.has(entry.path))
      : resultView === "operation"
        ? entries.filter((entry) => entry.status || data?.action !== "scan")
        : entries
  const analysis = data ? buildKisakiAnalysis(data.groups, selectedPaths, data.tool) : undefined
  const openPath = (definition as KisakiTerminalDefinition).openPath
  const running = session.phase === "running"
  const spinner = ["◐", "◓", "◑", "◒"][pulse % 4]

  function updateSelection(paths: string[]) {
    const next = [...new Set(paths)]
    setSelectedPaths(next)
    session.setField("selectedPathsText", next.join("\n"))
  }

  function toggleSelection(path: string) {
    updateSelection(selectedSet.has(path) ? selectedPaths.filter((item) => item !== path) : [...selectedPaths, path])
  }

  function moveActive(delta: number) {
    if (!entries.length) return
    const next = entries[Math.max(0, Math.min(entries.length - 1, activeIndex + delta))]
    if (next) setActivePath(next.path)
  }

  function selectTool(next: KisakiTerminalTool) {
    if (running) return
    setResultFocused(false)
    session.setField("tool", next)
    session.focus("tool")
  }

  function cycleTool(delta: number) {
    const next = toolList[(toolIndex + delta + toolList.length) % toolList.length]!
    selectTool(next)
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      onExit()
      return
    }
    if (key.name === "tab") {
      setResultFocused((current) => !current)
      return
    }
    // [ ] cycle scanners when the result list is not focused
    if (!resultFocused && (key.raw === "[" || key.raw === "]")) {
      cycleTool(key.raw === "]" ? 1 : -1)
      return
    }
    if (!resultFocused) return
    if (key.name === "up" || key.name === "k") moveActive(-1)
    else if (key.name === "down" || key.name === "j") moveActive(1)
    else if (key.name === "space" && activeEntry) toggleSelection(activeEntry.path)
    else if (key.name === "a") updateSelection(entries.filter((entry) => !entry.isReference).map((entry) => entry.path))
    else if (key.name === "s" && data) updateSelection(smartSelect(data.groups, "all-except-first"))
    else if (key.name === "c") updateSelection([])
    else if (key.name === "o" && activeEntry && openPath) void openPath(activeEntry.path)
  })

  const summaryLine = l(
    `▦ ${data?.groupCount ?? 0} 组 · ▣ ${data?.fileCount ?? 0} 文件 · 已选 ${selectedPaths.length} · 可回收 ${formatBytes(data?.reclaimableBytes ?? 0)}`,
    `▦ ${data?.groupCount ?? 0} groups · ▣ ${data?.fileCount ?? 0} files · sel ${selectedPaths.length} · ${formatBytes(data?.reclaimableBytes ?? 0)} reclaimable`,
  )

  return (
    <box width="100%" height="100%" paddingLeft={1} paddingRight={1} flexDirection="column" overflow="hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <box
        height={3}
        flexShrink={0}
        borderStyle="single"
        borderColor={theme.colors.border}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        justifyContent="space-between"
        alignItems="center"
      >
        <box flexDirection="column">
          <text fg={theme.colors.primary}>
            <b>{`${terminalIcon("status")} CZKAWKA // FILE FORENSICS`}</b>
          </text>
          <text fg={theme.colors.mutedForeground}>
            {l("终端取证台 · 选工具 → 配条件 → 扫结果 → 安全操作", "Terminal forensics · tool → setup → results → safe ops")}
          </text>
        </box>
        <box alignItems="flex-end" flexDirection="column">
          <text fg={running ? theme.colors.warning : theme.colors.success}>
            {running ? `${action.toUpperCase()} ${spinner}` : l("就绪", "READY")}
          </text>
          <text fg={theme.colors.focusRing}>{`${action.toUpperCase()} · ${kisakiToolLabel(tool, language)}`}</text>
        </box>
      </box>

      {/* ── Commands + live summary ────────────────────────────── */}
      <box height={3} flexShrink={0} marginTop={1} flexDirection="row" justifyContent="space-between" alignItems="center">
        <ActionLauncher id="czkawka-command" field={field("action")} session={session} />
        {session.confirming || running || session.phase === "paused" ? (
          <ExecutionActions
            session={session}
            confirmLabel={action === "scan" ? l("▶ 开始扫描", "▶ Start scan") : l("▶ 执行操作", "▶ Execute operation")}
          />
        ) : (
          <text fg={theme.colors.mutedForeground}>{summaryLine}</text>
        )}
      </box>

      {/* ── Single scanner palette (the only tool picker) ─────── */}
      <box
        height={5}
        flexShrink={0}
        marginTop={1}
        borderStyle="rounded"
        borderColor={theme.colors.border}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="column"
        overflow="hidden"
      >
        <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between">
          <text fg={theme.colors.primary}>
            <b>{l("⌕ 扫描工具", "⌕ SCANNERS")}</b>
          </text>
          <text fg={theme.colors.mutedForeground}>
            {l(`[ ] 切换 · ${toolIndex + 1}/${toolList.length}`, `[ ] cycle · ${toolIndex + 1}/${toolList.length}`)}
          </text>
        </box>
        <box id="czkawka-tool-palette" flexGrow={1} flexDirection="row" flexWrap="wrap" alignItems="center">
          {toolList.map((value) => {
            const selected = value === tool
            return (
              <ClickTarget
                key={value}
                id={`czkawka-tool-${value}`}
                selected={selected}
                focused={session.focusedControlId === "tool" && selected}
                disabled={running}
                onClick={() => selectTool(value)}
              >
                {shortToolLabel(value, language)}
              </ClickTarget>
            )
          })}
        </box>
      </box>

      {/* ── Main workbench: setup | results + inspector ───────── */}
      <box flexGrow={1} minHeight={0} marginTop={1} flexDirection="row" gap={1}>
        {/* Setup column — no second tool list */}
        <WorkbenchPanel
          title={l("▣ 扫描条件", "▣ SETUP")}
          description={l(`${kisakiToolLabel(tool, language)} · 目录 / 过滤 / 算法 / 操作`, `${kisakiToolLabel(tool, language)} · dirs / filters / algo / ops`)}
          width="32%"
        >
          <ActionTabs
            id="czkawka-input-tabs"
            options={[
              { value: "roots", label: l("目录", "Dirs") },
              { value: "filters", label: l("过滤", "Filters") },
              { value: "algorithm", label: l("算法", "Algo") },
              { value: "operations", label: l("操作", "Ops") },
            ]}
            value={setupTab}
            focused={false}
            onFocus={() => undefined}
            onChange={(value) => setSetupTab(value as SetupTab)}
          />
          <scrollbox flexGrow={1} minHeight={0} marginTop={1}>
            <box flexDirection="column" gap={1}>
              {setupTab === "roots" ? (
                <>
                  <Field id="includedDirectoriesText" />
                  <Field id="includedDirectoriesReferencedText" />
                  <Field id="excludedDirectoriesText" />
                  <Field id="threadCount" />
                  <box height={3} flexShrink={0} flexDirection="row" gap={1}>
                    <box width="50%">
                      <Field id="recursive" />
                    </box>
                    <box flexGrow={1}>
                      <Field id="useCache" />
                    </box>
                  </box>
                </>
              ) : setupTab === "filters" ? (
                <>
                  <Field id="excludedItemsText" />
                  <Field id="allowedExtensions" />
                  <Field id="excludedExtensions" />
                  <box height={3} flexShrink={0} flexDirection="row" gap={1}>
                    <box width="50%">
                      <Field id="minimumFileSize" />
                    </box>
                    <box flexGrow={1}>
                      <Field id="maximumFileSize" />
                    </box>
                  </box>
                  <Field id="filterText" />
                </>
              ) : setupTab === "algorithm" ? (
                getKisakiTerminalToolOptions(tool).length ? (
                  getKisakiTerminalToolOptions(tool).map((option) => <Field key={option.id} id={option.id} />)
                ) : (
                  <text fg={theme.colors.mutedForeground}>
                    {l("当前工具没有专属算法参数。", "This scanner has no algorithm-specific options.")}
                  </text>
                )
              ) : (
                <>
                  {action === "rename" ? <Field id="renameItemsText" /> : <Field id="selectedPathsText" />}
                  {action === "move" ? (
                    <>
                      <Field id="destinationDirectory" />
                      <Field id="copyMode" />
                      <Field id="preserveStructure" />
                      <Field id="conflictPolicy" />
                    </>
                  ) : null}
                  {action === "delete" ? <Field id="deleteMode" /> : null}
                  {action === "save" ? (
                    <>
                      <Field id="outputPath" />
                      <Field id="exportScope" />
                    </>
                  ) : null}
                  {action === "delete" || action === "move" || action === "rename" ? <Field id="dryRun" /> : null}
                  {action === "scan" ? (
                    <text fg={theme.colors.mutedForeground}>
                      {l("切换顶部命令到删除 / 移动 / 导出后配置操作参数。", "Switch the top command to delete / move / export to configure ops.")}
                    </text>
                  ) : null}
                </>
              )}
            </box>
          </scrollbox>

          {/* Compact analysis strip — replaces the tall right ANALYSIS card */}
          <box height={7} flexShrink={0} marginTop={1} borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="column" overflow="hidden">
            <box height={1} flexShrink={0}>
              <text fg={theme.colors.mutedForeground}>{l("◇ 摘要", "◇ SUMMARY")}</text>
            </box>
            <MetricLine label={l("文件", "Files")} value={String(data?.fileCount ?? 0)} color={theme.colors.primary} />
            <MetricLine label={l("分组", "Groups")} value={String(data?.groupCount ?? 0)} color={theme.colors.success} />
            <MetricLine
              label={l("已选", "Selected")}
              value={`${analysis?.selection.selectedCount ?? selectedPaths.length} / ${formatBytes(analysis?.selection.selectedBytes ?? 0)}`}
              color={theme.colors.focusRing}
            />
            <MetricLine label={l("可回收", "Reclaimable")} value={formatBytes(data?.reclaimableBytes ?? 0)} color={theme.colors.warning} />
          </box>
          <ProgressBar value={session.progress} label={session.status || l("扫描器就绪", "SCANNER READY")} />
        </WorkbenchPanel>

        {/* Results + inspector stack */}
        <box flexGrow={1} minWidth={0} flexDirection="column" gap={1}>
          <WorkbenchPanel
            title={l(`▦ 结果 · ${data?.groupCount ?? 0} 组`, `▦ RESULTS · ${data?.groupCount ?? 0} groups`)}
            description={l(
              "Tab 聚焦 · ↑↓/jk 导航 · Space 选择 · a 全选 · s 智能 · c 清空 · o 打开",
              "Tab focus · ↑↓/jk nav · Space select · a all · s smart · c clear · o open",
            )}
            flexGrow={1}
          >
            <ActionTabs
              id="czkawka-result-tabs"
              options={[
                { value: "all", label: l(`全部 ${entries.length}`, `All ${entries.length}`) },
                { value: "selected", label: l(`已选 ${selectedPaths.length}`, `Selected ${selectedPaths.length}`) },
                { value: "operation", label: l(`操作 ${data?.affectedCount ?? 0}`, `Ops ${data?.affectedCount ?? 0}`) },
              ]}
              value={resultView}
              focused={resultFocused}
              onFocus={() => setResultFocused(true)}
              onChange={(value) => setResultView(value as ResultView)}
            />
            <box height={1} flexShrink={0} flexDirection="row" marginTop={1}>
              <box width={8}>
                <text fg={theme.colors.mutedForeground}>{l("分组", "GROUP")}</text>
              </box>
              <box width="18%">
                <text fg={theme.colors.mutedForeground}>{l("大小", "SIZE")}</text>
              </box>
              <box width="48%">
                <text fg={theme.colors.mutedForeground}>{l("路径", "PATH")}</text>
              </box>
              <text fg={theme.colors.mutedForeground}>{l("详情", "DETAIL")}</text>
            </box>
            <scrollbox id="czkawka-results" flexGrow={1}>
              {resultEntries.length ? (
                resultEntries.map((entry) => (
                  <box
                    key={entry.id}
                    id={`czkawka-result-${entry.id}`}
                    height={2}
                    flexShrink={0}
                    flexDirection="row"
                    backgroundColor={entry.path === activeEntry?.path ? theme.colors.border : undefined}
                    onMouseDown={() => {
                      setResultFocused(true)
                      setActivePath(entry.path)
                      toggleSelection(entry.path)
                    }}
                  >
                    <box width={8}>
                      <text
                        fg={
                          entry.status === "error"
                            ? theme.colors.error
                            : entry.status === "skipped"
                              ? theme.colors.warning
                              : groupColor(entry.groupId, theme)
                        }
                      >
                        {`${selectedSet.has(entry.path) ? "●" : entry.isReference ? "★" : "○"} ${String(entry.groupId + 1).padStart(2, "0")}`}
                      </text>
                    </box>
                    <box width="18%">
                      <text>{entry.status ?? formatBytes(entry.size)}</text>
                    </box>
                    <box width="48%">
                      <text fg={theme.colors.foreground}>{entry.path}</text>
                    </box>
                    <text fg={entry.error ? theme.colors.error : theme.colors.mutedForeground}>
                      {entry.error ?? entry.secondaryPath ?? entry.detail ?? entry.properExtension ?? entry.similarity ?? ""}
                    </text>
                  </box>
                ))
              ) : (
                <text fg={theme.colors.mutedForeground}>
                  {resultView === "selected"
                    ? l("尚未选择结果；点击行或按 Space。", "No results selected; click a row or press Space.")
                    : resultView === "operation"
                      ? l("运行文件操作后显示逐项状态与目标。", "Run a file operation to show item statuses and targets.")
                      : l("选择扫描工具与目录，然后开始扫描。", "Pick a scanner and directories, then start a scan.")}
                </text>
              )}
            </scrollbox>
          </WorkbenchPanel>

          <box height={14} flexShrink={0}>
            <WorkbenchPanel
              title={l("▦ 检查器", "▦ INSPECTOR")}
              description={l("元数据 / 操作结果 / 日志", "Metadata / operation results / logs")}
              flexGrow={1}
            >
              <ActionTabs
                id="czkawka-inspector-tabs"
                options={[
                  { value: "details", label: l("详情", "Details") },
                  { value: "operation", label: l("操作", "Operation") },
                  { value: "logs", label: l("日志", "Logs") },
                ]}
                value={inspector}
                focused={false}
                onFocus={() => undefined}
                onChange={(value) => setInspector(value as InspectorTab)}
              />
              {inspector === "logs" ? (
                <scrollbox flexGrow={1} minHeight={0}>
                  {session.logs.length ? (
                    session.logs.map((line, index) => (
                      <text key={`${line}-${index}`} fg={theme.colors.mutedForeground}>
                        {`${String(index + 1).padStart(2, "0")} ${formatKisakiActivityMessage("info", line)}`}
                      </text>
                    ))
                  ) : (
                    <text fg={theme.colors.mutedForeground}>{l("尚无日志。", "No logs yet.")}</text>
                  )}
                </scrollbox>
              ) : inspector === "operation" ? (
                <scrollbox flexGrow={1} minHeight={0}>
                  <DetailLine label={l("动作", "Action")} value={data?.action ?? "—"} />
                  <DetailLine label={l("影响", "Affected")} value={String(data?.affectedCount ?? 0)} />
                  <DetailLine label={l("错误", "Errors")} value={String(data?.errorCount ?? 0)} />
                  <DetailLine label={l("状态", "Status")} value={activeEntry?.status ?? "—"} />
                  <DetailLine label={l("方式", "Method")} value={activeEntry?.operation ?? "—"} />
                  <DetailLine label={l("目标", "Target")} value={activeEntry?.secondaryPath ?? "—"} />
                  <DetailLine label={l("冲突", "Conflict")} value={activeEntry?.conflictPolicy ?? "—"} />
                  <DetailLine label={l("错误详情", "Error detail")} value={activeEntry?.error ?? "—"} />
                </scrollbox>
              ) : (
                <scrollbox flexGrow={1} minHeight={0}>
                  {activeEntry ? (
                    <>
                      <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between">
                        <text fg={theme.colors.primary}>
                          <b>{activeEntry.name}</b>
                        </text>
                        <box
                          id="czkawka-open-active"
                          onMouseDown={openPath ? () => void openPath(activeEntry.path) : undefined}
                        >
                          <text fg={openPath ? theme.colors.focusRing : theme.colors.mutedForeground}>
                            {openPath
                              ? l("↗ 打开 (o)", "↗ Open (o)")
                              : l("无法打开", "Unavailable")}
                          </text>
                        </box>
                      </box>
                      {entryDetails(activeEntry, language).map(([label, value]) => (
                        <DetailLine key={label} label={label} value={value} />
                      ))}
                    </>
                  ) : (
                    <text fg={theme.colors.mutedForeground}>
                      {l("选择结果后显示完整元数据。", "Select a result to show complete metadata.")}
                    </text>
                  )}
                </scrollbox>
              )}
            </WorkbenchPanel>
          </box>
        </box>
      </box>
    </box>
  )
}

function MetricLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <box height={1} flexShrink={0} flexDirection="row" justifyContent="space-between">
      <text>{label}</text>
      <text fg={color}>
        <b>{value}</b>
      </text>
    </box>
  )
}

function DetailLine({ label, value }: { label: string; value: string }) {
  const theme = useTerminalTheme()
  return (
    <box height={1} flexShrink={0} flexDirection="row">
      <box width={9}>
        <text fg={theme.colors.mutedForeground}>{label}</text>
      </box>
      <text fg={theme.colors.foreground}>{value}</text>
    </box>
  )
}

function entryDetails(entry: KisakiEntry, language: TerminalLanguage): Array<[string, string]> {
  const zh = language === "zh"
  const l = (zhText: string, enText: string) => (zh ? zhText : enText)
  return [
    [l("路径", "Path"), entry.path],
    [l("标题", "Title"), entry.title ?? "—"],
    [l("艺术家", "Artist"), entry.artist ?? "—"],
    [l("分辨率", "Resolution"), entry.width && entry.height ? `${entry.width}×${entry.height}` : "—"],
    [l("相似度", "Similarity"), entry.similarity ?? "—"],
    [l("流派", "Genre"), entry.genre ?? "—"],
    [l("年份", "Year"), entry.year ?? "—"],
    [l("时长", "Duration"), entry.length ?? "—"],
    [l("码率", "Bitrate"), entry.bitrate === undefined ? "—" : `${entry.bitrate} kbps`],
    [l("分组", "Group"), String(entry.groupId + 1)],
    [l("大小", "Size"), formatBytes(entry.size)],
    [l("修改时间", "Modified"), entry.modifiedDate ? new Date(entry.modifiedDate * 1000).toLocaleString() : "—"],
    ["Hash", entry.hash ?? "—"],
    [l("参考项", "Reference"), entry.isReference ? l("是", "Yes") : l("否", "No")],
    [l("正确扩展名", "Proper extension"), entry.properExtension ?? "—"],
    [l("详情", "Detail"), entry.detail ?? "—"],
  ]
}

/** Compact palette labels so 11 scanners fit without a second tool list. */
function shortToolLabel(tool: KisakiTerminalTool, language: TerminalLanguage): string {
  if (language === "zh") {
    const labels: Record<KisakiTerminalTool, string> = {
      "duplicate-files": "重复文件",
      "empty-folders": "空文件夹",
      "big-files": "大文件",
      "empty-files": "空文件",
      "temporary-files": "临时文件",
      "similar-images": "相似图片",
      "similar-videos": "相似视频",
      "duplicate-music": "重复音频",
      "invalid-symlinks": "无效链接",
      "broken-files": "损坏文件",
      "bad-extensions": "错误扩展名",
    }
    return labels[tool]
  }
  const labels: Record<KisakiTerminalTool, string> = {
    "duplicate-files": "Duplicates",
    "empty-folders": "Empty dirs",
    "big-files": "Big files",
    "empty-files": "Empty files",
    "temporary-files": "Temp files",
    "similar-images": "Sim images",
    "similar-videos": "Sim videos",
    "duplicate-music": "Music",
    "invalid-symlinks": "Symlinks",
    "broken-files": "Broken",
    "bad-extensions": "Bad ext",
  }
  return labels[tool]
}

function groupColor(id: number, theme: ReturnType<typeof useTerminalTheme>) {
  return [theme.colors.primary, theme.colors.success, theme.colors.warning, theme.colors.focusRing][id % 4]!
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  let value = bytes / 1024
  let unit = units[0]!
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024
    unit = units[index]!
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${unit}`
}
