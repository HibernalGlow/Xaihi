/* @jsxImportSource @opentui/react */
import { useKeyboard } from "@opentui/react";
import { useState } from "react";
import type { TerminalUiScreenProps } from "@hibernalglow/xaihi-cli-runtime/terminal";
import {
  ActionLauncher,
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
import type { MigratefInput, MigratefResult } from "./core.ts";
export function MigratefTui(
  p: TerminalUiScreenProps<MigratefInput, MigratefResult>,
): import('react').ReactNode {
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
}: TerminalUiScreenProps<MigratefInput, MigratefResult>) {
  const th = useTerminalTheme(),
    t = createTerminalTranslator(language),
    s = useTerminalUiSession(definition),
    f = useAnimation({ intervalMs: s.phase === "running" ? 80 : 520 }),
    d = s.result?.data,
    a = String(s.values.action ?? "plan");
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
  const flow = ["→···", "·→··", "··→·", "···→"][f % 4];
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
            <b>{`${terminalIcon("status")} MIGRATEF // TRANSFER DIFF`}</b>
          </text>
          <text fg={th.colors.mutedForeground}>
            来源队列 · 目标映射 · 可撤销迁移
          </text>
        </box>
        <text
          fg={s.phase === "running" ? th.colors.warning : th.colors.success}
        >{`${s.phase === "running" ? "TRANSFERRING" : "DIFF READY"} ${flow}`}</text>
      </box>
      <box height={3} marginTop={1}>
        <ActionLauncher id="action" field={field("action")} session={s} />
      </box>
      <box height={7} flexDirection="row" gap={1}>
        <F
          id={
            a === "undo"
              ? "batchId"
              : a === "history"
                ? "historyPath"
                : "sourcePaths"
          }
          w="39%"
        />
        {a !== "history" && a !== "undo" ? <F id="targetPath" w="25%" /> : null}
        <F id="dryRun" w="12%" />
        <box
          width="21%"
          borderStyle="rounded"
          borderColor={s.dangerous ? th.colors.error : th.colors.border}
          paddingLeft={1}
          flexDirection="column"
        >
          <text fg={s.dangerous ? th.colors.error : th.colors.mutedForeground}>
            {s.dangerous ? "↯ LIVE FS" : "⌁ DIFF ONLY"}
          </text>
          <box flexGrow={1} />
          <ExecutionActions
            session={s}
            executeLabel="⌁ 生成差异"
            confirmLabel="↯ 确认迁移"
          />
        </box>
      </box>
      <box flexGrow={1} minHeight={0} marginTop={1} flexDirection="row" gap={1}>
        <WorkbenchPanel
          title={`来源队列 · ${d?.totalCount ?? 0}`}
          description="待迁移与跳过项目"
          width="29%"
        >
          <scrollbox flexGrow={1}>
            {d?.plan.map((x, i) => (
              <text
                key={`${x.sourcePath}-${i}`}
                fg={
                  x.status === "skipped"
                    ? th.colors.warning
                    : th.colors.foreground
                }
              >{`${x.status === "skipped" ? "○" : "◇"} ${x.sourcePath}`}</text>
            ))}
          </scrollbox>
        </WorkbenchPanel>
        <WorkbenchPanel
          title="目标映射 / DIFF"
          description="source → target"
          width="45%"
        >
          <scrollbox flexGrow={1}>
            {d?.plan.map((x, i) => (
              <box key={`${x.targetPath}-${i}`} flexDirection="column">
                <text
                  fg={
                    x.status === "error"
                      ? th.colors.error
                      : x.status === "success"
                        ? th.colors.success
                        : th.colors.primary
                  }
                >{`${x.action === "copy" ? "⧉" : "→"} ${x.kind} · ${x.status}`}</text>
                <text
                  fg={th.colors.mutedForeground}
                >{`  ${x.sourcePath}`}</text>
                <text
                  fg={th.colors.foreground}
                >{`  → ${x.targetPath || x.reason}`}</text>
              </box>
            ))}
          </scrollbox>
        </WorkbenchPanel>
        <WorkbenchPanel
          title={`撤销与遥测 · ${d?.history.length ?? 0}`}
          description="批次历史和执行结果"
          flexGrow={1}
        >
          <text
            fg={th.colors.success}
          >{`✓ 迁移 ${d?.migratedCount ?? d?.successCount ?? 0}`}</text>
          <text fg={th.colors.warning}>{`○ 跳过 ${d?.skippedCount ?? 0}`}</text>
          <text
            fg={th.colors.error}
          >{`× 错误 ${d?.errorCount ?? d?.failedCount ?? 0}`}</text>
          <scrollbox flexGrow={1}>
            {d?.history.map((x, i) => (
              <box key={`${x.id}-${i}`} flexDirection="column">
                <text
                  fg={x.undone ? th.colors.mutedForeground : th.colors.primary}
                >{`${x.undone ? "↶" : "◷"} ${x.id} · ${x.operations.length}`}</text>
                <text fg={th.colors.mutedForeground}>{x.description}</text>
              </box>
            ))}
          </scrollbox>
          <ProgressBar value={s.progress} label={s.status || "READY"} />
        </WorkbenchPanel>
      </box>
    </box>
  );
}
