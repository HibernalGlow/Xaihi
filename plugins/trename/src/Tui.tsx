/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import { useMemo, useState } from "react";
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal";
import {
  ActionTabs, ClickTarget, ExecutionActions, PathDiff, ProgressBar,
  TerminalPreferencesScreen, TerminalThemeProvider, WorkbenchButton, WorkbenchField,
  WorkbenchPanel, resolveTerminalTheme, terminalIcon, useAnimation,
  useTerminalChromeActions, useTerminalTheme, useTerminalUiSession,
} from "@hibernalglow/xaihi-cli-runtime/terminal/opentui";
import { createTerminalTranslator } from "@hibernalglow/xaihi-cli-runtime/i18n";
import type { TrenameInput, TrenameNode, TrenameResult } from "./core.ts";
import { parseRenameJson } from "./core.ts";

export function TrenameTui(props: TerminalUiScreenProps<TrenameInput, TrenameResult>): import('react').ReactNode {
  const [theme, setTheme] = useState(props.theme ?? props.preferences?.current.theme ?? "inherit");
  return <TerminalThemeProvider theme={resolveTerminalTheme(theme === "inherit" ? "nord" : theme)}>
    <TrenameWorkbench {...props} onThemePreview={setTheme} />
  </TerminalThemeProvider>;
}

function TrenameWorkbench({ definition, language, preferences, onExit, onThemePreview }: TerminalUiScreenProps<TrenameInput, TrenameResult> & { onThemePreview: (theme: string) => void }) {
  const theme = useTerminalTheme(), t = createTerminalTranslator(language), session = useTerminalUiSession(definition);
  const [settings, setSettings] = useState(false), [selectedDiff, setSelectedDiff] = useState(0);
  const pulse = useAnimation({ intervalMs: session.phase === "running" ? 100 : 500 });
  const result = session.result?.data;
  const operations = result?.operations ?? [];
  const conflicts = result?.conflicts ?? [];
  const jsonTree = useMemo(() => flattenJsonTree(String(session.values.jsonContent ?? "")), [session.values.jsonContent]);
  const controls = [...session.fields.map((field) => field.id), "execute", "settings"];
  useTerminalChromeActions({ onReset: session.reset, onExit, resetLabel: "↻ 重置", exitLabel: "× 退出" });
  useKeyboard((key) => {
    if (key.name === "escape") { if (settings) setSettings(false); else if (session.confirming) session.dismissConfirmation(); else onExit(); return; }
    if (key.name === "tab") session.moveFocus(controls, key.shift ? -1 : 1);
    if (key.name === "up" && operations.length) setSelectedDiff((value) => Math.max(0, value - 1));
    if (key.name === "down" && operations.length) setSelectedDiff((value) => Math.min(operations.length - 1, value + 1));
  });
  if (settings && preferences) return <TerminalPreferencesScreen controller={preferences} focusedId={session.focusedControlId} onFocus={session.focus} onPreviewTheme={onThemePreview} onBack={() => setSettings(false)} />;
  if (session.confirming) return <ConfirmRename count={operations.length} conflicts={conflicts.length} onConfirm={() => void session.confirmExecute()} onDismiss={session.dismissConfirmation} />;
  const field = (id: string) => definition.schema.fields.find((item) => item.id === id)!;
  const fieldBox = (id: string, width?: `${number}%`) => session.fields.some((item) => item.id === id) ? <box width={width} flexGrow={width ? 0 : 1}><WorkbenchField field={field(id)} value={session.values[id]} error={session.fieldErrors[id]} focused={session.focusedControlId === id} disabled={session.phase === "running"} t={t} onFocus={() => session.focus(id)} onChange={(value) => session.setField(id, value)} /></box> : null;
  const action = String(session.values.action ?? "scan");
  return <box width="100%" height="100%" flexDirection="column" paddingLeft={1} paddingRight={1} overflow="hidden">
    <box height={4} flexShrink={0} borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="space-between">
      <box flexDirection="column"><text fg={theme.colors.primary}><b>{`${terminalIcon("status")} TRENAME // 重命名审阅台`}</b></text><text fg={theme.colors.mutedForeground}>{session.status || "扫描目录、编辑 JSON、审阅路径差异后安全执行"}</text></box>
      <box flexDirection="column" alignItems="flex-end"><text fg={session.phase === "running" ? theme.colors.warning : theme.colors.success}>{`${phaseLabel(session.phase)} ${["◐", "◓", "◑", "◒"][pulse % 4]}`}</text>{preferences ? <WorkbenchButton id="settings" onClick={() => setSettings(true)}>{`${terminalIcon("settings")} 设置`}</WorkbenchButton> : null}</box>
    </box>
    <box height={3} flexShrink={0} marginTop={1} flexDirection="row" justifyContent="space-between">
      <ActionTabs id="field-action" options={field("action").options ?? []} value={action} focused={session.focusedControlId === "action"} disabled={session.phase === "running"} onFocus={() => session.focus("action")} onChange={(value) => session.setField("action", value)} />
      <text fg={theme.colors.mutedForeground}>{`${terminalIcon("result")} ${operations.length} 个差异 · ⚠ ${conflicts.length} 个冲突 · ${session.progress}%`}</text>
    </box>
    <box height={action === "scan" ? 8 : action === "rename" || action === "validate" ? 6 : 5} flexShrink={0} flexDirection="row" gap={1}>
      {fieldBox(action === "scan" ? "paths" : action === "undo" ? "batchId" : action === "history" ? "undoPath" : "basePath", "42%")}
      {action === "scan" ? <box flexGrow={1} flexDirection="row" gap={1}>{fieldBox("mode")}{fieldBox("includeHidden")}{fieldBox("includeRoot")}</box> : action === "rename" ? <box flexGrow={1} flexDirection="row" gap={1}>{fieldBox("dryRun")}{fieldBox("undoPath")}</box> : null}
      <box width="25%" flexDirection="column" borderStyle="rounded" borderColor={session.dangerous ? theme.colors.error : theme.colors.border} paddingLeft={1} paddingRight={1}><text fg={session.dangerous ? theme.colors.error : theme.colors.mutedForeground}>{session.dangerous ? "⚠ 真实文件移动" : "◇ 安全预演"}</text><box flexGrow={1}/><ExecutionActions session={session} executeLabel={actionLabel(action)} confirmLabel="⚠ 确认执行" /></box>
    </box>
    <box flexGrow={1} minHeight={0} marginTop={1} flexDirection="row" gap={1}>
      <WorkbenchPanel title="目录结构" description="扫描 JSON 中的文件与目录" width="27%"><scrollbox flexGrow={1}>{jsonTree.length ? jsonTree.map((item) => <text key={item.key} fg={item.ready ? theme.colors.primary : theme.colors.mutedForeground}>{`${"  ".repeat(item.depth)}${item.directory ? "▾" : "•"} ${item.name}${item.target ? ` → ${item.target}` : ""}`}</text>) : <text fg={theme.colors.mutedForeground}>扫描或粘贴 JSON 后显示目录树。</text>}</scrollbox></WorkbenchPanel>
      <WorkbenchPanel title="路径差异" description="Git 风格：红色为旧片段，绿色为新片段" flexGrow={1} headerActions={<text fg={theme.colors.mutedForeground}>↑↓ / 滚轮审阅</text>}><scrollbox flexGrow={1} onMouseScroll={(event) => { const delta = event.scroll?.direction === "down" ? 1 : -1; setSelectedDiff((value) => Math.max(0, Math.min(operations.length - 1, value + delta))); }}>{operations.length ? operations.map((operation, index) => <box key={`${operation.originalPath}-${operation.newPath}`} flexDirection="column" onMouseDown={() => setSelectedDiff(index)}><PathDiff oldPath={operation.originalPath} newPath={operation.newPath} selected={selectedDiff === index} status="ready" /></box>) : <text fg={theme.colors.mutedForeground}>运行“校验”或“重命名预演”后，这里显示完整 rename diff。</text>}</scrollbox><ProgressBar value={session.progress} label={session.status || "READY"} /></WorkbenchPanel>
      <WorkbenchPanel title={`冲突与状态 · ${conflicts.length}`} description="冲突项不会进入可执行计划" width="27%"><scrollbox flexGrow={1}>{conflicts.length ? conflicts.map((item, index) => <box key={`${item.srcPath}-${index}`} flexDirection="column" marginBottom={1}><text fg={theme.colors.error}><b>{`⚠ ${conflictLabel(item.type)}`}</b></text><text fg={theme.colors.mutedForeground}>{item.message}</text><PathDiff oldPath={item.srcPath} newPath={item.tgtPath} status="conflict" /></box>) : <text fg={operations.length ? theme.colors.success : theme.colors.mutedForeground}>{operations.length ? "✓ 未发现冲突，可以继续审阅并执行。" : "校验结果与执行状态会显示在这里。"}</text>}</scrollbox>{session.error ? <text fg={theme.colors.error}>{session.error}</text> : null}</WorkbenchPanel>
    </box>
  </box>;
}

function ConfirmRename({ count, conflicts, onConfirm, onDismiss }: { count: number; conflicts: number; onConfirm: () => void; onDismiss: () => void }) {
  const theme = useTerminalTheme();
  return <box width="100%" height="100%" alignItems="center" justifyContent="center"><box width="68%" height={11} flexDirection="column" borderStyle="double" borderColor={theme.colors.error} paddingLeft={2} paddingRight={2}><text fg={theme.colors.error}><b>⚠ 确认真实移动文件</b></text><text>{`将执行 ${count} 个重命名操作；${conflicts} 个冲突会跳过。`}</text><text fg={theme.colors.mutedForeground}>请确认已审阅路径差异。执行后可通过 Trename 历史记录撤销。</text><box flexGrow={1}/><box flexDirection="row" gap={2}><WorkbenchButton id="confirm-execute" danger onClick={onConfirm}>确认移动文件</WorkbenchButton><WorkbenchButton id="confirm-dismiss" onClick={onDismiss}>返回审阅</WorkbenchButton></box></box></box>;
}

export function flattenJsonTree(json: string) {
  if (!json.trim()) return [] as Array<{ key: string; depth: number; name: string; target?: string; directory: boolean; ready: boolean }>;
  try {
    const root = parseRenameJson(json).root, rows: Array<{ key: string; depth: number; name: string; target?: string; directory: boolean; ready: boolean }> = [];
    const visit = (node: TrenameNode, depth: number, parent: string) => {
      if ("src_dir" in node) { const key = `${parent}/${node.src_dir}`; rows.push({ key, depth, name: node.src_dir, target: node.tgt_dir, directory: true, ready: Boolean(node.tgt_dir) }); node.children.forEach((child) => visit(child, depth + 1, key)); }
      else rows.push({ key: `${parent}/${node.src}`, depth, name: node.src, target: node.tgt, directory: false, ready: Boolean(node.tgt) });
    };
    root.forEach((node) => visit(node, 0, "")); return rows;
  } catch { return []; }
}
function phaseLabel(phase: string) { return phase === "running" ? "执行中" : phase === "paused" ? "已暂停" : phase === "result" ? "已完成" : "等待审阅"; }
function actionLabel(action: string) { return action === "scan" ? "⌕ 扫描目录" : action === "validate" ? "✓ 校验差异" : action === "rename" ? "↳ 生成计划" : action === "undo" ? "↶ 撤销" : action === "history" ? "◷ 查看历史" : "⇩ 导入 JSON"; }
function conflictLabel(type: string) { return type === "target_exists" ? "目标已存在" : type === "duplicate_target" ? "目标重复" : type === "illegal_chars" ? "非法字符" : type === "invalid_extension" ? "扩展名异常" : "源文件不存在"; }
