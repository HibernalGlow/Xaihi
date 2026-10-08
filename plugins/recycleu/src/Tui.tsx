/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import { useState } from "react";

import {
  ClickTarget,
  ExecutionActions,
  ActionTabs,
  NumberInput,
  ProgressBar,
  TerminalPreferencesScreen,
  TerminalThemeProvider,
  WorkbenchButton,
  useTerminalChromeActions,
  WorkbenchPanel,
  resolveTerminalTheme,
  terminalIcon,
  useTerminalTheme,
  useTerminalUiSession,
  useAnimation,
} from "@hibernalglow/xaihi-cli-runtime/terminal/opentui";
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal";
import { createTerminalTranslator } from "@hibernalglow/xaihi-cli-runtime/i18n";

import type { RecycleuInput, RecycleuResult } from "./core.ts";

export function RecycleuTui(
  props: TerminalUiScreenProps<RecycleuInput, RecycleuResult>,
): import('react').ReactNode {
  const [theme, setTheme] = useState(
    props.theme ?? props.preferences?.current.theme ?? "inherit",
  );
  return (
    <TerminalThemeProvider
      theme={resolveTerminalTheme(theme === "inherit" ? "nord" : theme)}
    >
      <RecycleuWorkbench {...props} onThemePreview={setTheme} />
    </TerminalThemeProvider>
  );
}

function RecycleuWorkbench({
  definition,
  language,
  preferences,
  onExit,
  onThemePreview,
}: TerminalUiScreenProps<RecycleuInput, RecycleuResult> & {
  onThemePreview: (theme: string) => void;
}) {
  const theme = useTerminalTheme();
  const t = createTerminalTranslator(language);
  const session = useTerminalUiSession(definition);
  useTerminalChromeActions({ onReset: session.reset, onExit });
  const animationFrame = useAnimation({
    intervalMs: session.phase === "running" ? 120 : 420,
  });
  const [settings, setSettings] = useState(false);
  const display = definition.schema.view?.dashboard.display(session.values);
  const remainingSeconds = Number(
    session.status.match(/next clean in\s+(\d+)s/i)?.[1] ??
      session.values.interval ??
      10,
  );
  const motionEnabled =
    typeof process === "undefined" || process.env.NO_MOTION !== "1";
  const motionIndex = motionEnabled ? animationFrame : 0;
  const braille = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][
    motionIndex % 10
  ];
  const motionColors =
    motionIndex % 2
      ? [theme.colors.focusRing, theme.colors.primary]
      : [theme.colors.primary, theme.colors.focusRing];
  const controls = [
    ...session.fields.map((field) => field.id),
    "execute",
    "pause",
    "resume",
    "cancel",
    "settings",
    "reset",
    "exit",
  ];

  useKeyboard((key) => {
    if (key.name === "escape") {
      if (settings) setSettings(false);
      else if (session.confirming) session.dismissConfirmation();
      else if (session.phase === "running" || session.phase === "paused")
        void session.cancel();
      else onExit();
      return;
    }
    if (key.name === "tab") session.moveFocus(controls, key.shift ? -1 : 1);
    if (
      key.name === "q" &&
      session.phase !== "running" &&
      session.phase !== "paused"
    )
      onExit();
  });

  if (settings && preferences) {
    return (
      <TerminalPreferencesScreen
        controller={preferences}
        focusedId={session.focusedControlId}
        onFocus={session.focus}
        onPreviewTheme={onThemePreview}
        onBack={() => setSettings(false)}
      />
    );
  }

  if (session.confirming) {
    return (
      <box
        width="100%"
        height="100%"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
      >
        <box
          width="70%"
          minWidth={48}
          height={10}
          flexShrink={0}
          flexDirection="column"
          borderStyle="double"
          borderColor={theme.colors.error}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
        >
          <text fg={theme.colors.error}>
            <b>{`${terminalIcon("danger")} ${session.dangerPrompt?.title ?? "确认危险操作"}`}</b>
          </text>
          <text fg={theme.colors.foreground}>{session.dangerPrompt?.body}</text>
          <text fg={theme.colors.mutedForeground}>
            当前参数：{session.preview.join(" · ")}
          </text>
          <box flexDirection="row" gap={2} marginTop={1}>
            <WorkbenchButton
              id="confirm-execute"
              danger
              focused={session.focusedControlId === "confirm-execute"}
              onClick={() => void session.confirmExecute()}
            >
              {session.dangerPrompt?.confirmLabel ?? "确认执行"}
            </WorkbenchButton>
            <WorkbenchButton
              id="confirm-dismiss"
              focused={session.focusedControlId === "confirm-dismiss"}
              onClick={session.dismissConfirmation}
            >
              取消并返回
            </WorkbenchButton>
          </box>
        </box>
      </box>
    );
  }

  return (
    <box
      width="100%"
      height="100%"
      flexDirection="column"
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
    >
      <box
        height={4}
        flexDirection="row"
        justifyContent="space-between"
        borderStyle="single"
        borderColor={theme.colors.border}
        paddingLeft={1}
        paddingRight={1}
      >
        <box flexDirection="column">
          <text fg={theme.colors.primary}>
            <b>{`${terminalIcon("status")} RECYCLEU // 回收站控制台`}</b>
          </text>
          <text fg={theme.colors.mutedForeground}>
            立即清理、周期监控与运行记录
          </text>
        </box>
        <box flexDirection="column" alignItems="flex-end">
          <text fg={phaseColor(session.phase, theme)}>
            <b>{phaseLabel(session.phase)}</b>
          </text>
          {preferences ? (
            <ClickTarget
              id="settings"
              focused={session.focusedControlId === "settings"}
              onClick={() => {
                session.focus("pref-theme");
                setSettings(true);
              }}
            >{`${terminalIcon("settings")} 设置`}</ClickTarget>
          ) : null}
        </box>
      </box>

      <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} marginTop={1}>
        <WorkbenchPanel
          title="清理控制"
          description="目标盘符、间隔与循环上限"
          width="31%"
        >
          <scrollbox
            flexGrow={1}
            scrollbarOptions={{
              trackOptions: {
                foregroundColor: theme.colors.primary,
                backgroundColor: theme.colors.border,
              },
            }}
          >
            <box flexDirection="column" gap={1}>
              <text fg={theme.colors.mutedForeground}>▶ 工作流</text>
              <ActionTabs
                id="field-action"
                options={[
                  { value: "status", label: "状态" },
                  { value: "clean_now", label: "清空" },
                  { value: "start", label: "自动" },
                ]}
                value={session.values.action}
                focused={session.focusedControlId === "action"}
                disabled={session.phase === "running"}
                onFocus={() => session.focus("action")}
                onChange={(value) => session.setField("action", value)}
              />

              <text fg={theme.colors.mutedForeground}>▣ 目标盘符</text>
              <box
                id="field-driveLetter"
                borderStyle="rounded"
                borderColor={
                  session.focusedControlId === "driveLetter"
                    ? theme.colors.focusRing
                    : theme.colors.border
                }
                paddingLeft={1}
                paddingRight={1}
                onMouseDown={() => session.focus("driveLetter")}
              >
                <input
                  value={String(session.values.driveLetter ?? "")}
                  placeholder="全部盘符"
                  focused={
                    session.focusedControlId === "driveLetter" &&
                    session.phase !== "running"
                  }
                  onInput={(value) =>
                    session.setField(
                      "driveLetter",
                      String(value)
                        .toUpperCase()
                        .replace(/[^A-Z:]/g, "")
                        .slice(0, 2),
                    )
                  }
                />
              </box>

              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme.colors.mutedForeground}># 清理间隔（秒）</text>
                <NumberInput
                  id="field-interval"
                  value={Number(session.values.interval ?? 10)}
                  focused={session.focusedControlId === "interval"}
                  disabled={session.phase === "running"}
                  min={5}
                  max={3600}
                  colors={theme.colors}
                  onFocus={() => session.focus("interval")}
                  onChange={(value) => session.setField("interval", value)}
                />
              </box>
              <text fg={theme.colors.mutedForeground}>快速间隔</text>
              <box flexDirection="row">
                {[5, 10, 30, 60].map((value) => (
                  <ClickTarget
                    key={value}
                    id={`preset-${value}`}
                    selected={session.values.interval === value}
                    disabled={session.phase === "running"}
                    onClick={() => session.setField("interval", value)}
                  >
                    {value === 60 ? "1 分钟" : `${value} 秒`}
                  </ClickTarget>
                ))}
              </box>

              <box flexDirection="row" justifyContent="space-between">
                <text fg={theme.colors.mutedForeground}># 循环上限</text>
                <NumberInput
                  id="field-maxCycles"
                  value={Number(session.values.maxCycles ?? 360)}
                  focused={session.focusedControlId === "maxCycles"}
                  disabled={session.phase === "running"}
                  min={0}
                  max={360}
                  colors={theme.colors}
                  onFocus={() => session.focus("maxCycles")}
                  onChange={(value) => session.setField("maxCycles", value)}
                />
              </box>
              <text
                fg={
                  session.values.maxCycles === 0
                    ? theme.colors.warning
                    : theme.colors.mutedForeground
                }
              >
                {session.values.maxCycles === 0
                  ? "∞ 无限循环，直到手动取消"
                  : `最多执行 ${session.values.maxCycles} 次`}
              </text>
            </box>
          </scrollbox>
        </WorkbenchPanel>

        <WorkbenchPanel
          title="循环监控"
          description="倒计时、目标与执行安全门"
          width="34%"
        >
          <box flexDirection="column" flexGrow={1} minHeight={0}>
            <box
              height={7}
              flexDirection="column"
              alignItems="center"
              borderStyle="rounded"
              borderColor={theme.colors.border}
              paddingLeft={1}
              paddingRight={1}
            >
              <text
                fg={
                  session.phase === "running"
                    ? theme.colors.success
                    : theme.colors.mutedForeground
                }
              >{`${braille} ${session.phase === "running" ? "LIVE COUNTDOWN" : "INTERVAL PREVIEW"}`}</text>
              <ascii-font
                text={String(
                  session.values.action === "start"
                    ? remainingSeconds
                    : "READY",
                )}
                font="tiny"
                color={motionColors}
              />
              <text fg={theme.colors.primary}>
                <b>
                  {session.values.action === "start"
                    ? "秒 / 清理周期"
                    : (display?.primary ?? "已就绪")}
                </b>
              </text>
              {display?.secondary ? (
                <text fg={theme.colors.mutedForeground}>
                  {display.secondary}
                </text>
              ) : null}
            </box>
            <box flexDirection="column">
              {display?.metrics?.map((metric) => (
                <box
                  key={metric.label}
                  width="100%"
                  flexDirection="row"
                  justifyContent="space-between"
                >
                  <text fg={theme.colors.mutedForeground}>{metric.label}</text>
                  <text fg={theme.colors.foreground}>
                    <b>{metric.value}</b>
                  </text>
                </box>
              ))}
            </box>
            <scrollbox
              flexGrow={session.confirming ? 0 : 1}
              height={session.confirming ? 4 : undefined}
              minHeight={3}
            >
              {session.preview.map((line, index) => (
                <text
                  key={`${line}-${index}`}
                  fg={
                    index === 0
                      ? theme.colors.foreground
                      : theme.colors.mutedForeground
                  }
                >{`${index ? "·" : "›"} ${line}`}</text>
              ))}
            </scrollbox>
            <ProgressBar
              value={session.progress}
              label={session.status || "等待运行"}
            />
            <ExecutionActions
              session={session}
              executeLabel="▶ 检查状态"
              confirmLabel="⚠ 确认后执行"
            />
          </box>
        </WorkbenchPanel>

        <WorkbenchPanel
          title="运行日志"
          description="倒计时、清理结果与错误"
          flexGrow={1}
        >
          <scrollbox
            id="recycleu-logs"
            flexGrow={1}
            scrollbarOptions={{
              trackOptions: {
                foregroundColor: theme.colors.primary,
                backgroundColor: theme.colors.border,
              },
            }}
          >
            {session.logs.length ? (
              session.logs.map((line, index) => (
                <text
                  key={`${line}-${index}`}
                  fg={theme.colors.mutedForeground}
                >{`${String(index + 1).padStart(3, "0")}  ${line}`}</text>
              ))
            ) : (
              <text fg={theme.colors.mutedForeground}>
                暂无日志；执行后会在这里显示运行记录。
              </text>
            )}
          </scrollbox>
          {session.resultSummary ? (
            <box
              height={7}
              flexShrink={0}
              flexDirection="column"
              borderStyle="rounded"
              borderColor={
                session.resultSummary.success
                  ? theme.colors.success
                  : theme.colors.error
              }
            >
              <text
                fg={
                  session.resultSummary.success
                    ? theme.colors.success
                    : theme.colors.error
                }
              >
                <b>{session.resultSummary.message}</b>
              </text>
              {session.resultSummary.lines.map((line, index) => (
                <text key={`${line}-${index}`}>{line}</text>
              ))}
            </box>
          ) : null}
        </WorkbenchPanel>
      </box>

    </box>
  );
}

function phaseLabel(phase: "ready" | "running" | "paused" | "result") {
  if (phase === "running") return "运行中";
  if (phase === "paused") return "已暂停";
  if (phase === "result") return "已完成";
  return "就绪";
}

function phaseColor(
  phase: "ready" | "running" | "paused" | "result",
  theme: ReturnType<typeof useTerminalTheme>,
) {
  if (phase === "running") return theme.colors.warning;
  if (phase === "paused") return theme.colors.primary;
  if (phase === "result") return theme.colors.success;
  return theme.colors.mutedForeground;
}
