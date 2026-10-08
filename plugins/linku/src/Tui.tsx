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
import type { LinkuInput, LinkuResult } from "./core.ts";
export function LinkuTui(
  p: TerminalUiScreenProps<LinkuInput, LinkuResult>,
): import("react").ReactNode {
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
}: TerminalUiScreenProps<LinkuInput, LinkuResult>) {
  const th = useTerminalTheme(),
    t = createTerminalTranslator(language),
    s = useTerminalUiSession(definition),
    f = useAnimation({ intervalMs: s.phase === "running" ? 85 : 500 }),
    d = s.result?.data;
  useTerminalChromeActions({ onReset: s.reset, onExit });
  useKeyboard((k) => {
    if (k.name === "escape") onExit();
  });
  const field = (id: string) =>
      definition.schema.fields.find((x) => x.id === id)!,
    F = ({ id }: { id: string }) => (
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
    ),
    topo = ["○───◇────●", "○────◇───●", "○─────◇──●", "○────◇───●"][f % 4];
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
        flexShrink={0}
        borderStyle="single"
        borderColor={th.colors.border}
        paddingLeft={1}
        paddingRight={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <box flexDirection="column">
          <text fg={th.colors.primary}>
            <b>{`${terminalIcon("status")} LINKU // ACTIVE TOPOLOGY`}</b>
          </text>
          <text fg={th.colors.mutedForeground}>
            Symlink 关系 · 移动回链 · 恢复与还原
          </text>
        </box>
        <box alignItems="flex-end">
          <text
            fg={s.phase === "running" ? th.colors.warning : th.colors.success}
          >
            {s.phase === "running" ? "LINKING" : "DAEMON ONLINE"}
          </text>
          <text fg={th.colors.focusRing}>{topo}</text>
        </box>
      </box>
      <box
        height={3}
        flexShrink={0}
        marginTop={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <ActionLauncher
          id="linku-command"
          field={field("action")}
          session={s}
        />
        {s.confirming || s.phase === "running" || s.phase === "paused" ? (
          <ExecutionActions session={s} confirmLabel="↻ 确认链接操作" />
        ) : null}
      </box>
      <box height={8} flexShrink={0} marginTop={1} flexDirection="row" gap={1}>
        <WorkbenchPanel
          title="⊕ 初始化链接"
          description="源、目标与记录配置"
          width="43%"
        >
          <box flexDirection="row" gap={1}>
            <box width="50%">
              <F id="path" />
            </box>
            <box width="50%">
              <F id="target" />
            </box>
          </box>
          <F id="configPath" />
        </WorkbenchPanel>
        <WorkbenchPanel title="⌁ 拓扑信号" description={topo} flexGrow={1}>
          <box flexGrow={1} justifyContent="center" alignItems="center">
            <text fg={th.colors.focusRing}>
              <b>{topo}</b>
            </text>
          </box>
          <box flexDirection="row" justifyContent="space-between">
            <text fg={th.colors.mutedForeground}>LINK</text>
            <text fg={th.colors.primary}>RELATION</text>
            <text fg={th.colors.success}>TARGET</text>
          </box>
        </WorkbenchPanel>
      </box>
      <box flexGrow={1} minHeight={0} marginTop={1} flexDirection="row" gap={1}>
        <WorkbenchPanel
          title={`⛓ 活动关联 · ${d?.links.length ?? 0}`}
          description="链接 → 目标 → 类型"
          width="72%"
        >
          <scrollbox id="linku-records" flexGrow={1}>
            {d?.links.length ? (
              d.links.map((x, i) => (
                <box
                  key={`${x.link}-${i}`}
                  height={4}
                  flexShrink={0}
                  flexDirection="column"
                >
                  <box flexDirection="row">
                    <text fg={th.colors.primary}>{`○ ${x.link}`}</text>
                    <text fg={th.colors.focusRing}> ─────→ </text>
                    <text fg={th.colors.success}>{`● ${x.target}`}</text>
                  </box>
                  <text
                    fg={th.colors.mutedForeground}
                  >{`${x.type || "link"} · ${x.createdAt || "unknown time"}`}</text>
                </box>
              ))
            ) : d?.pathInfo ? (
              <box flexDirection="column">
                <text
                  fg={d.pathInfo.exists ? th.colors.success : th.colors.error}
                >{`${d.pathInfo.isSymlink ? "⛓" : "▤"} ${d.pathInfo.path}`}</text>
                <text
                  fg={th.colors.mutedForeground}
                >{`${d.pathInfo.kind} · ${d.pathInfo.exists ? "exists" : "missing"}`}</text>
                {d.pathInfo.linkTarget ? (
                  <text
                    fg={th.colors.focusRing}
                  >{`→ ${d.pathInfo.linkTarget}`}</text>
                ) : null}
              </box>
            ) : (
              <text fg={th.colors.mutedForeground}>
                查询路径或读取记录后显示链接拓扑。
              </text>
            )}
          </scrollbox>
        </WorkbenchPanel>
        <WorkbenchPanel
          title="↻ 恢复与还原"
          description="记录检查、恢复与还原"
          flexGrow={1}
        >
          <M l="记录" v={d?.links.length ?? 0} />
          <M l="已创建" v={d?.created ? 1 : 0} c={th.colors.success} />
          <M l="已恢复" v={d?.recoveredCount ?? 0} c={th.colors.primary} />
          <M l="已还原" v={d?.restoredCount ?? 0} c={th.colors.focusRing} />
          <M l="失败" v={d?.failedCount ?? 0} c={th.colors.error} />
          <box flexGrow={1} />
          <ProgressBar
            value={s.progress}
            label={s.status || "TOPOLOGY READY"}
          />
        </WorkbenchPanel>
      </box>
    </box>
  );
}
function M({ l, v, c }: { l: string; v: number; c?: string }) {
  const t = useTerminalTheme();
  return (
    <box flexDirection="row" justifyContent="space-between">
      <text fg={c ?? t.colors.mutedForeground}>{l}</text>
      <text fg={c ?? t.colors.foreground}>
        <b>{String(v).padStart(2, "0")}</b>
      </text>
    </box>
  );
}
