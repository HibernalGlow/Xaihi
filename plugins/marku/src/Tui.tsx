/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal";
import {
  ActionLauncher,
  ActionTabs,
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
} from "@hibernalglow/xaihi-cli-runtime/terminal/opentui";
import { createTerminalTranslator } from "@hibernalglow/xaihi-cli-runtime/i18n";
import type { MarkuInput, MarkuResult } from "./core.ts";
export function MarkuTui(p: TerminalUiScreenProps<MarkuInput, MarkuResult>): import('react').ReactNode {
  const [x] = useState(p.theme ?? p.preferences?.current.theme ?? "nord");
  return (
    <TerminalThemeProvider
      theme={resolveTerminalTheme(x === "inherit" ? "nord" : x)}
    >
      <Desk {...p} />
    </TerminalThemeProvider>
  );
}
function Desk({
  definition,
  language,
  onExit,
}: TerminalUiScreenProps<MarkuInput, MarkuResult>) {
  const th = useTerminalTheme(),
    t = createTerminalTranslator(language),
    s = useTerminalUiSession(definition),
    f = useAnimation({ intervalMs: s.phase === "running" ? 85 : 520 }),
    d = s.result?.data,
    a = String(s.values.action ?? "text");
  useTerminalChromeActions({ onReset: s.reset, onExit });
  useKeyboard((k) => {
    if (k.name === "escape") onExit();
  });
  const field = (id: string) =>
    definition.schema.fields.find((x) => x.id === id)!;
  const F = ({ id, w }: { id: string; w?: `${number}%` }) => (
    <box width={w} flexGrow={w ? 0 : 1}>
      <WorkbenchField
        field={field(id)}
        value={s.values[id]}
        error={s.fieldErrors[id]}
        focused={s.focusedControlId === id}
        disabled={s.phase === "running"}
        t={t}
        onFocus={() => s.focus(id)}
        onChange={(v) => s.setField(id, v)}
      />
    </box>
  );
  const scan = ["▏···", "·▎··", "··▍·", "···▌"][f % 4],
    opts = field("action").options ?? [],
    history = opts.filter((x) => x.value === "history"),
    actions = opts.filter((x) => x.value !== "history");
  return (
    <box
      width="100%"
      height="100%"
      paddingLeft={1}
      paddingRight={1}
      flexDirection="column"
      overflow="hidden"
    >
      <box
        height={4}
        borderStyle="single"
        borderColor={th.colors.border}
        paddingLeft={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <box flexDirection="column">
          <text fg={th.colors.primary}>
            <b>{`${terminalIcon("status")} MARKU // DOCUMENT FORGE`}</b>
          </text>
          <text fg={th.colors.mutedForeground}>
            模块工具箱 · 原文/输出对照 · Unified Diff
          </text>
        </box>
        <text
          fg={s.phase === "running" ? th.colors.warning : th.colors.success}
        >{`${s.phase === "running" ? "PROCESSING" : "FORGE READY"} ${scan}`}</text>
      </box>
      <box height={3} marginTop={1} flexDirection="row">
        <ActionTabs
          id="field-action"
          options={actions}
          value={a}
          focused={s.focusedControlId === "action"}
          disabled={s.phase === "running"}
          onFocus={() => s.focus("action")}
          onChange={(v) => s.setField("action", v)}
        />
        <ActionLauncher
          id="history-action"
          field={field("action")}
          options={history}
          session={s}
        />
      </box>
      <box height={7} flexDirection="row" gap={1}>
        <F
          id={a === "run" ? "paths" : a === "undo" ? "undoId" : "inputText"}
          w="58%"
        />
        <F id="dryRun" w="15%" />
        <box
          width="24%"
          borderStyle="rounded"
          borderColor={s.dangerous ? th.colors.error : th.colors.border}
          paddingLeft={1}
          flexDirection="column"
        >
          <text fg={s.dangerous ? th.colors.error : th.colors.mutedForeground}>
            {s.dangerous ? "↯ LIVE WRITE" : "◇ PREVIEW"}
          </text>
          <box flexGrow={1} />
          <ExecutionActions
            session={s}
            executeLabel="≡ 生成差异"
            confirmLabel="↯ 确认写入"
          />
        </box>
      </box>
      <box flexGrow={1} minHeight={0} marginTop={1} flexDirection="row" gap={1}>
        <WorkbenchPanel
          title="输入与输出"
          description="Markdown 转换前后对照"
          width="39%"
        >
          <F id="module" />
          <scrollbox flexGrow={1}>
            <text fg={th.colors.mutedForeground}>--- INPUT</text>
            <text>{d?.inputText || String(s.values.inputText ?? "")}</text>
            <text fg={th.colors.success}>+++ OUTPUT</text>
            <text>{d?.outputText ?? ""}</text>
          </scrollbox>
        </WorkbenchPanel>
        <WorkbenchPanel
          title={`Unified Diff · ${d?.filesChanged ?? 0}`}
          description="逐文件变化审阅"
          width="39%"
        >
          <scrollbox flexGrow={1}>
            {(d?.diffText || d?.diffs.map((x) => x.diff).join("\n") || "")
              .split(/\r?\n/)
              .map((x, i) => (
                <text
                  key={`${i}-${x}`}
                  fg={
                    x.startsWith("+")
                      ? th.colors.success
                      : x.startsWith("-")
                        ? th.colors.error
                        : x.startsWith("@@")
                          ? th.colors.primary
                          : th.colors.mutedForeground
                  }
                >
                  {x}
                </text>
              ))}
          </scrollbox>
        </WorkbenchPanel>
        <WorkbenchPanel
          title={`历史与遥测 · ${d?.history.length ?? 0}`}
          description="模块运行和撤销记录"
          flexGrow={1}
        >
          <text>{`◇ 已处理 ${d?.filesProcessed ?? 0}`}</text>
          <text
            fg={th.colors.success}
          >{`✓ 已变化 ${d?.filesChanged ?? 0}`}</text>
          <text fg={th.colors.error}>{`× 错误 ${d?.errors.length ?? 0}`}</text>
          <scrollbox flexGrow={1}>
            {d?.history.map((x, i) => (
              <text
                key={`${x.id}-${i}`}
                fg={x.undone ? th.colors.mutedForeground : th.colors.primary}
              >{`${x.undone ? "↶" : "◷"} ${x.id} · ${x.module} · ${x.files.length}`}</text>
            ))}
          </scrollbox>
          <ProgressBar value={s.progress} label={s.status || "READY"} />
        </WorkbenchPanel>
      </box>
    </box>
  );
}
