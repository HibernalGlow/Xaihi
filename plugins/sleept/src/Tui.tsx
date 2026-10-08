/**
 * sleept 的全屏终端面，逐字搬自 `<Xiranite>` 当前 HEAD（`v1.0.0-587-g8e42280f`）的
 * `packages/nodes/sleept/src/Tui.tsx`（545 行）。
 *
 * 本仓改动只有说明符：`@xiranite/cli-runtime/{terminal/opentui,terminal,i18n}` →
 * `@hibernalglow/xaihi-cli-runtime/*`；相对导入 `.js` 后缀改 `.ts`。
 * 经 `cli.ts` 的 `loadScreen` 动态装载（OpenTUI 渲染树在此，定时器逻辑仍在 core.ts）。
 *
 * @module xaihi-sleept/tui
 */

/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import { useState } from "react";

import {
  ActionTabs,
  ClickTarget,
  ExecutionActions,
  ProgressBar,
  resolveTerminalTheme,
  TerminalPreferencesScreen,
  TerminalThemeProvider,
  terminalIcon,
  useAnimation,
  useTerminalTheme,
  useTerminalUiSession,
  WorkbenchButton,
  WorkbenchField,
  useTerminalChromeActions,
  WorkbenchPanel,
} from "@hibernalglow/xaihi-cli-runtime/terminal/opentui";
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal";
import { createTerminalTranslator } from "@hibernalglow/xaihi-cli-runtime/i18n";
import { createSleeptTranslator } from "./i18n.ts";
import {
  countdownSeconds,
  formatDuration,
  type SleeptInput,
  type SleeptResult,
} from "./core.ts";
import type { SleeptInteractionAction } from "./interaction.ts";
import { POWER_MODE_VALUES, type PowerMode } from "./schedule.ts";

/** One entry per `PowerMode`, so a mode added in `schedule.ts` but forgotten on this rail is a
 * compile error, not a silently missing option (same discipline as `interaction.ts`).
 * 上游这份 TUI 是半截子迁移：schema 已是 6 值，这条电源栏还是手写 4 值，`display-sleep` /
 * `screensaver` 在屏上选不到；本仓接上——图标前两枚照上游，后两枚（☾ / ▦）是本仓新加。 */
type SleeptTranslator = ReturnType<typeof createSleeptTranslator>;
const POWER_MODE_CHOICES: Record<
  PowerMode,
  { icon: string; key: Parameters<SleeptTranslator>[0] }
> = {
  sleep: { icon: "◐", key: "powerSleep" },
  hibernate: { icon: "❄", key: "powerHibernate" },
  shutdown: { icon: "⏻", key: "powerOff" },
  restart: { icon: "↻", key: "powerReboot" },
  "display-sleep": { icon: "☾", key: "powerDisplaySleep" },
  screensaver: { icon: "▦", key: "powerScreensaver" },
};

/** Direct OpenTUI projection of the GUI workbench: trigger controls, animated
 * timer console, telemetry/status, logs and a guarded power-action rail. */
export function SleeptTui(
  props: TerminalUiScreenProps<SleeptInput, SleeptResult>,
): import('react').ReactNode {
  const [previewTheme, setPreviewTheme] = useState(
    props.theme ?? props.preferences?.current.theme ?? "inherit",
  );
  return (
    <TerminalThemeProvider
      theme={resolveTerminalTheme(
        previewTheme === "inherit" ? "nord" : previewTheme,
      )}
    >
      <SleeptWorkbench {...props} onThemePreview={setPreviewTheme} />
    </TerminalThemeProvider>
  );
}

function SleeptWorkbench({
  definition,
  language,
  preferences,
  onExit,
  onThemePreview,
}: TerminalUiScreenProps<SleeptInput, SleeptResult> & {
  onThemePreview: (theme: string) => void;
}) {
  const theme = useTerminalTheme();
  const t = createSleeptTranslator(language);
  const terminalT = createTerminalTranslator(language);
  const session = useTerminalUiSession(definition);
  useTerminalChromeActions({ onReset: session.reset, onExit, resetLabel: `↺ ${t("reset")}`, exitLabel: `× ${language === "zh" ? "退出" : "Exit"}` });
  const [settings, setSettings] = useState(false);
  const frame = useAnimation({
    intervalMs: session.phase === "running" ? 150 : 480,
  });
  const action = session.values.action as SleeptInteractionAction;
  const display = definition.schema.view?.dashboard.display(session.values);
  const activeFields = session.fields.filter(
    (field) => !["action", "powerMode", "dryrun"].includes(field.id),
  );
  const controls = [
    "action",
    ...activeFields.map((field) => field.id),
    "powerMode",
    "dryrun",
    "execute",
    "pause",
    "resume",
    "cancel",
    "settings",
    "reset",
    "exit",
    "tab-status",
    "tab-logs",
  ];
  const monitoring = action === "netspeed" || action === "cpu";
  const duration =
    action === "countdown"
      ? countdownSeconds({
          hours: Number(session.values.hours),
          minutes: Number(session.values.minutes),
          seconds: Number(session.values.seconds),
        })
      : 0;
  const countdown =
    session.status.match(/remaining\s+(\d\d:\d\d:\d\d)/i)?.[1] ??
    formatDuration(duration);
  const motion = ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"][frame % 8];
  const motionColors =
    frame % 2
      ? [theme.colors.primary, theme.colors.focusRing]
      : [theme.colors.focusRing, theme.colors.primary];

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

  if (settings && preferences)
    return (
      <TerminalPreferencesScreen
        controller={preferences}
        focusedId={session.focusedControlId}
        onFocus={session.focus}
        onPreviewTheme={onThemePreview}
        onBack={() => setSettings(false)}
      />
    );
  if (session.confirming)
    return <DangerConfirm session={session} onExit={onExit} />;

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
        flexShrink={0}
        borderStyle="single"
        borderColor={theme.colors.border}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <box flexDirection="column">
          <text fg={theme.colors.primary}>
            <b>{`${terminalIcon("status")} SLEEPT // SYSTEM TIMER`}</b>
          </text>
          <text fg={theme.colors.mutedForeground}>{t("description")}</text>
        </box>
        <box flexDirection="column" alignItems="flex-end">
          <text fg={phaseColor(session.phase, theme)}>
            <b>{`${phaseLabel(session.phase, t)} ${motion}`}</b>
          </text>
          {preferences ? (
            <ClickTarget
              id="settings"
              focused={session.focusedControlId === "settings"}
              onClick={() => {
                session.focus("pref-theme");
                setSettings(true);
              }}
            >{`${terminalIcon("settings")} ${language === "zh" ? "设置" : "settings"}`}</ClickTarget>
          ) : null}
        </box>
      </box>

      <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} marginTop={1}>
        <WorkbenchPanel
          title={t("triggerSequence")}
          description={t("triggerSequenceHint")}
          width="37%"
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
              <text
                fg={theme.colors.mutedForeground}
              >{`${terminalIcon("section")} ${t("action")}`}</text>
              <ActionTabs
                id="field-action"
                options={actionOptions(t)}
                value={action}
                focused={session.focusedControlId === "action"}
                disabled={session.phase === "running"}
                onFocus={() => session.focus("action")}
                onChange={(value) => session.setField("action", value)}
              />
              {activeFields.map((field) => (
                <WorkbenchField
                  key={field.id}
                  field={field}
                  value={session.values[field.id]}
                  error={session.fieldErrors[field.id]}
                  focused={session.focusedControlId === field.id}
                  disabled={session.phase === "running"}
                  t={terminalT}
                  onFocus={() => session.focus(field.id)}
                  onChange={(value) => session.setField(field.id, value)}
                />
              ))}
              {action !== "get_stats" ? (
                <>
                  <text
                    fg={theme.colors.mutedForeground}
                  >{`${terminalIcon("action")} ${t("powerMode")}`}</text>
                  <ActionTabs
                    id="field-powerMode"
                      options={POWER_MODE_VALUES.map((value) => ({
                        value,
                        label: `${POWER_MODE_CHOICES[value].icon} ${t(POWER_MODE_CHOICES[value].key)}`,
                      }))}
                    value={session.values.powerMode}
                    focused={session.focusedControlId === "powerMode"}
                    disabled={session.phase === "running"}
                    onFocus={() => session.focus("powerMode")}
                    onChange={(value) => session.setField("powerMode", value)}
                  />
                  <text
                    fg={theme.colors.mutedForeground}
                  >{`${terminalIcon("danger")} ${t("dryRun")}`}</text>
                  <ActionTabs
                    id="field-dryrun"
                    options={[
                      { value: true, label: `◌ ${t("dryRun")}` },
                      { value: false, label: `⚠ ${t("live")}` },
                    ]}
                    value={session.values.dryrun}
                    focused={session.focusedControlId === "dryrun"}
                    disabled={session.phase === "running"}
                    onFocus={() => session.focus("dryrun")}
                    onChange={(value) => session.setField("dryrun", value)}
                  />
                </>
              ) : null}
            </box>
          </scrollbox>
        </WorkbenchPanel>

        <WorkbenchPanel
          title={t("systemStandby")}
          description={t("systemStandbyHint")}
          flexGrow={1}
        >
          <box flexDirection="column" flexGrow={1} minHeight={0}>
            <box
              height={9}
              flexShrink={0}
              flexDirection="column"
              alignItems="center"
              borderStyle="rounded"
              borderColor={
                session.phase === "running"
                  ? theme.colors.focusRing
                  : theme.colors.border
              }
            >
              <text
                fg={
                  session.phase === "running"
                    ? theme.colors.success
                    : theme.colors.mutedForeground
                }
              >{`${motion} ${monitoring ? "MONITOR" : "COUNTDOWN CONSOLE"}`}</text>
              <ascii-font
                text={
                  monitoring ? (action === "cpu" ? "CPU" : "NET") : countdown
                }
                font="tiny"
                color={motionColors}
              />
              <text fg={theme.colors.primary}>
                <b>{monitoring ? display?.primary : countdown}</b>
              </text>
            </box>
            <box flexDirection="row" flexWrap="wrap" gap={1} marginTop={1}>
              {display?.metrics?.map((metric) => (
                <box
                  key={metric.label}
                  borderStyle="rounded"
                  borderColor={theme.colors.border}
                  paddingLeft={1}
                  paddingRight={1}
                >
                  <text
                    fg={theme.colors.mutedForeground}
                  >{`${metric.label}: `}</text>
                  <text fg={theme.colors.foreground}>
                    <b>{metric.value}</b>
                  </text>
                </box>
              ))}
            </box>
            <scrollbox flexGrow={1} minHeight={3} marginTop={1}>
              {session.preview.map((line, index) => (
                <text
                  key={`${line}-${index}`}
                  fg={
                    index
                      ? theme.colors.mutedForeground
                      : theme.colors.foreground
                  }
                >{`${index ? "·" : "▸"} ${line}`}</text>
              ))}
            </scrollbox>
            <ProgressBar
              value={session.progress}
              label={session.status || t("waiting")}
            />
            <ExecutionActions
              session={session}
              executeLabel={`▶ ${t("start")}`}
              confirmLabel={`⚠ ${language === "zh" ? "确认后执行" : "Confirm and run"}`}
            />
          </box>
        </WorkbenchPanel>

        <WorkbenchPanel
          title={language === "zh" ? "状态与日志" : "Status & logs"}
          description={
            language === "zh"
              ? "遥测、执行结果和事件记录"
              : "Telemetry, result and event history"
          }
          width="28%"
        >
          <box flexDirection="row" flexShrink={0}>
            <ClickTarget
              id="tab-status"
              selected={session.resultTab === "status"}
              focused={session.focusedControlId === "tab-status"}
              onClick={() => session.selectResultTab("status")}
            >{`◉ ${language === "zh" ? "状态" : "status"}`}</ClickTarget>
            <ClickTarget
              id="tab-logs"
              selected={session.resultTab === "logs"}
              focused={session.focusedControlId === "tab-logs"}
              onClick={() => session.selectResultTab("logs")}
            >{`▤ ${language === "zh" ? "日志" : "logs"} (${session.logs.length})`}</ClickTarget>
          </box>
          <scrollbox
            id="sleept-log-board"
            flexGrow={1}
            marginTop={1}
            scrollbarOptions={{
              trackOptions: {
                foregroundColor: theme.colors.primary,
                backgroundColor: theme.colors.border,
              },
            }}
          >
            {session.resultTab === "logs" ? (
              session.logs.length ? (
                session.logs.map((line, index) => (
                  <text
                    key={`${line}-${index}`}
                    fg={theme.colors.mutedForeground}
                  >{`${String(index + 1).padStart(3, "0")} ${line}`}</text>
                ))
              ) : (
                <text fg={theme.colors.mutedForeground}>
                  {language === "zh"
                    ? "执行日志会显示在这里。"
                    : "Execution logs will appear here."}
                </text>
              )
            ) : (
              <StatusBoard
                result={session.resultSummary}
                action={action}
                display={display}
                language={language}
              />
            )}
          </scrollbox>
        </WorkbenchPanel>
      </box>
    </box>
  );
}

function DangerConfirm({
  session,
  onExit,
}: {
  session: ReturnType<typeof useTerminalUiSession<SleeptInput, SleeptResult>>;
  onExit: () => void;
}) {
  const theme = useTerminalTheme();
  return (
    <box width="100%" height="100%" alignItems="center" justifyContent="center">
      <box
        width="70%"
        minWidth={52}
        height={10}
        flexDirection="column"
        borderStyle="double"
        borderColor={theme.colors.error}
        paddingLeft={2}
        paddingRight={2}
        paddingTop={1}
      >
        <text fg={theme.colors.error}>
          <b>{`⚠ ${session.dangerPrompt?.title ?? "确认真实电源操作"}`}</b>
        </text>
        <text fg={theme.colors.foreground}>{session.dangerPrompt?.body}</text>
        <text fg={theme.colors.mutedForeground}>
          {session.preview.join(" · ")}
        </text>
        <box flexDirection="row" gap={2} marginTop={1}>
          <WorkbenchButton
            id="confirm-execute"
            danger
            focused={session.focusedControlId === "confirm-execute"}
            onClick={() => void session.confirmExecute()}
          >
            ⚠ 确认执行
          </WorkbenchButton>
          <WorkbenchButton
            id="confirm-dismiss"
            focused={session.focusedControlId === "confirm-dismiss"}
            onClick={session.dismissConfirmation}
          >
            × 取消
          </WorkbenchButton>
          <ClickTarget id="exit" onClick={onExit}>
            退出
          </ClickTarget>
        </box>
      </box>
    </box>
  );
}

function StatusBoard({
  result,
  action,
  display,
  language,
}: {
  result: ReturnType<
    typeof useTerminalUiSession<SleeptInput, SleeptResult>
  >["resultSummary"];
  action: SleeptInteractionAction;
  display:
    | ReturnType<
        NonNullable<
          SleeptTuiProps["definition"]["schema"]["view"]
        >["dashboard"]["display"]
      >
    | undefined;
  language: "zh" | "en";
}) {
  const theme = useTerminalTheme();
  return (
    <box flexDirection="column">
      <text fg={theme.colors.primary}>
        <b>{`◉ ${display?.primary ?? action}`}</b>
      </text>
      {display?.metrics?.map((metric) => (
        <box
          key={metric.label}
          flexDirection="row"
          justifyContent="space-between"
        >
          <text fg={theme.colors.mutedForeground}>{metric.label}</text>
          <text fg={theme.colors.foreground}>{metric.value}</text>
        </box>
      ))}
      {result ? (
        <>
          <text fg={result.success ? theme.colors.success : theme.colors.error}>
            {result.message}
          </text>
          {result.lines.map((line, index) => (
            <text key={`${line}-${index}`}>{line}</text>
          ))}
        </>
      ) : (
        <text fg={theme.colors.mutedForeground}>
          {language === "zh" ? "等待任务开始。" : "Waiting for a task."}
        </text>
      )}
    </box>
  );
}

type SleeptTuiProps = TerminalUiScreenProps<SleeptInput, SleeptResult>;

function actionOptions(t: ReturnType<typeof createSleeptTranslator>) {
  return [
    { value: "countdown", label: `◷ ${t("timerCountdown")}` },
    { value: "specific_time", label: `◴ ${t("timerAt")}` },
    { value: "netspeed", label: `⇅ ${t("timerNet")}` },
    { value: "cpu", label: "▥ CPU" },
    { value: "get_stats", label: `◉ ${t("statusAction")}` },
  ];
}

function phaseLabel(
  phase: "ready" | "running" | "paused" | "result",
  t: ReturnType<typeof createSleeptTranslator>,
) {
  return phase === "running"
    ? t("phaseRunning")
    : phase === "paused"
      ? "已暂停"
      : phase === "result"
        ? t("phaseCompleted")
        : t("phaseIdle");
}
function phaseColor(
  phase: "ready" | "running" | "paused" | "result",
  theme: ReturnType<typeof useTerminalTheme>,
) {
  return phase === "running"
    ? theme.colors.warning
    : phase === "paused"
      ? theme.colors.primary
      : phase === "result"
        ? theme.colors.success
        : theme.colors.mutedForeground;
}
