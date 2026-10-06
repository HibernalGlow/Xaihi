/* @jsxImportSource @opentui/react */
import type { ReactNode } from "react"
import { useTerminalTheme } from "../theme.js";

export interface PathDiffProps {
  oldPath: string;
  newPath: string;
  selected?: boolean;
  status?: "ready" | "conflict" | "applied";
}

/**
 * Rename-oriented counterpart to termcn's DiffView. It keeps the common path
 * quiet and highlights only the changed path segments, which is substantially
 * easier to review than treating a path as a one-line file diff.
 */
export function PathDiff({ oldPath, newPath, selected = false, status = "ready" }: PathDiffProps): ReactNode {
  const theme = useTerminalTheme();
  const { oldPrefix, oldChanged, oldSuffix, newPrefix, newChanged, newSuffix } = splitPathDiff(oldPath, newPath);
  const marker = status === "conflict" ? "⚠" : status === "applied" ? "✓" : "↳";
  const markerColor = status === "conflict" ? theme.colors.error : status === "applied" ? theme.colors.success : theme.colors.primary;
  return (
    <box flexDirection="column" paddingLeft={1} paddingRight={1} backgroundColor={selected ? theme.colors.border : undefined}>
      <box flexDirection="row">
        <text fg={theme.colors.error}>− </text>
        <text fg={theme.colors.mutedForeground}>{oldPrefix}</text>
        <text fg={theme.colors.error}><b>{oldChanged || "∅"}</b></text>
        <text fg={theme.colors.mutedForeground}>{oldSuffix}</text>
      </box>
      <box flexDirection="row">
        <text fg={markerColor}>{`${marker} `}</text>
        <text fg={theme.colors.mutedForeground}>{newPrefix}</text>
        <text fg={theme.colors.success}><b>{newChanged || "∅"}</b></text>
        <text fg={theme.colors.mutedForeground}>{newSuffix}</text>
      </box>
    </box>
  );
}

export function splitPathDiff(oldPath: string, newPath: string) {
  if (newPath.endsWith(oldPath)) return {
    oldPrefix: "", oldChanged: "", oldSuffix: oldPath,
    newPrefix: "", newChanged: newPath.slice(0, -oldPath.length), newSuffix: oldPath,
  };
  if (oldPath.endsWith(newPath)) return {
    oldPrefix: "", oldChanged: oldPath.slice(0, -newPath.length), oldSuffix: newPath,
    newPrefix: "", newChanged: "", newSuffix: newPath,
  };
  let prefix = 0;
  const limit = Math.min(oldPath.length, newPath.length);
  while (prefix < limit && oldPath[prefix] === newPath[prefix]) prefix += 1;
  let oldEnd = oldPath.length;
  let newEnd = newPath.length;
  while (oldEnd > prefix && newEnd > prefix && oldPath[oldEnd - 1] === newPath[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  return {
    oldPrefix: oldPath.slice(0, prefix),
    oldChanged: oldPath.slice(prefix, oldEnd),
    oldSuffix: oldPath.slice(oldEnd),
    newPrefix: newPath.slice(0, prefix),
    newChanged: newPath.slice(prefix, newEnd),
    newSuffix: newPath.slice(newEnd),
  };
}
