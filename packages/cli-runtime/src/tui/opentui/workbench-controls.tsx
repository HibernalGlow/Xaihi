/* @jsxImportSource @opentui/react */
import { useState, type ReactNode } from "react";

import type { InteractionField, InteractionValue } from "../../interaction.js";
import type { TerminalTranslator } from "../i18n.js";
import { optionsForField, stepInteractionNumber } from "../screen.js";
import { useTerminalTheme } from "../theme.js";
import { fieldIcon, terminalIcon } from "../icons.js";
import { NumberInput } from "../../components/ui/number-input.js";
import { ActionTabs } from "./action-tabs.js";
import { MultilineEditor, PathListInput } from "./multiline-editor.js";
import type { TerminalUiSession } from "../session.js";

export function WorkbenchPanel({
  title,
  description,
  headerActions,
  children,
  width,
  flexGrow,
}: {
  title: string;
  description?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  width?: number | `${number}%`;
  flexGrow?: number;
}): ReactNode {
  const theme = useTerminalTheme();
  return (
    <box
      flexDirection="column"
      borderStyle="rounded"
      borderColor={theme.colors.border}
      paddingLeft={1}
      paddingRight={1}
      width={width}
      flexGrow={flexGrow}
      flexShrink={width ? 0 : undefined}
      minWidth={0}
      overflow="hidden"
    >
      {title ? (
        <box flexShrink={0} flexDirection="row" justifyContent="space-between">
          <text fg={theme.colors.primary}>
            <b>{`${terminalIcon("section")} ${title}`}</b>
          </text>
          {headerActions}
        </box>
      ) : null}
      {description ? (
        <box flexShrink={0}>
          <text fg={theme.colors.mutedForeground}>{description}</text>
        </box>
      ) : null}
      <box
        flexDirection="column"
        marginTop={description ? 1 : 0}
        flexGrow={1}
        overflow="hidden"
      >
        {children}
      </box>
    </box>
  );
}

export function WorkbenchField({
  field,
  value,
  error,
  focused,
  disabled,
  t,
  onFocus,
  onChange,
}: {
  field: InteractionField;
  value?: InteractionValue;
  error?: string;
  focused: boolean;
  disabled?: boolean;
  t: TerminalTranslator;
  onFocus: () => void;
  onChange: (value: InteractionValue) => void;
}): ReactNode {
  const theme = useTerminalTheme();
  if (field.kind === "select" && field.role === "action") {
    return (
      <box flexDirection="column" minHeight={3}>
        <text
          fg={focused ? theme.colors.focusRing : theme.colors.foreground}
        >{`${fieldIcon(field.kind, field.role)} ${field.label}`}</text>
        <ActionTabs
          id={`field-${field.id}`}
          options={field.options ?? []}
          value={value}
          focused={focused}
          disabled={disabled}
          onFocus={onFocus}
          onChange={onChange}
        />
        {error ? <text fg={theme.colors.error}>{error}</text> : null}
      </box>
    );
  }
  if (field.kind === "number") {
    return (
      <box
        flexDirection="row"
        justifyContent="space-between"
        onMouseScroll={
          disabled
            ? undefined
            : (event) => {
                const direction =
                  event.scroll?.direction === "up"
                    ? 1
                    : event.scroll?.direction === "down"
                      ? -1
                      : 0;
                if (direction)
                  onChange(stepInteractionNumber(field, value, direction));
              }
        }
      >
        <text
          fg={focused ? theme.colors.focusRing : theme.colors.foreground}
        >{`${fieldIcon(field.kind)} ${field.label}`}</text>
        <NumberInput
          id={`field-${field.id}`}
          value={Number(value ?? 0)}
          focused={focused}
          disabled={disabled}
          min={field.min}
          max={field.max}
          step={field.step}
          colors={theme.colors}
          onFocus={onFocus}
          onChange={onChange}
        />
      </box>
    );
  }
  if (field.kind === "text") {
    return (
      <box
        flexDirection="column"
        minHeight={4}
        onMouseDown={disabled ? undefined : onFocus}
      >
        <text
          fg={focused ? theme.colors.focusRing : theme.colors.foreground}
        >{`${fieldIcon(field.kind)} ${field.label}`}</text>
        <box
          id={`field-${field.id}`}
          borderStyle="rounded"
          borderColor={focused ? theme.colors.focusRing : theme.colors.border}
          height={3}
          paddingLeft={1}
          paddingRight={1}
        >
          <input
            value={String(value ?? "")}
            placeholder={field.placeholder ?? ""}
            focused={focused && !disabled}
            onInput={disabled ? undefined : onChange}
          />
        </box>
        {error ? <text fg={theme.colors.error}>{error}</text> : null}
      </box>
    );
  }
  if (field.kind === "multiline" || field.kind === "path-list") {
    const Editor = field.kind === "path-list" ? PathListInput : MultilineEditor;
    return (
      <box
        flexDirection="column"
        minHeight={(field.lines ?? (field.kind === "path-list" ? 6 : 5)) + 1}
      >
        <text
          fg={focused ? theme.colors.focusRing : theme.colors.foreground}
        >{`${fieldIcon(field.kind)} ${field.label}`}</text>
        <Editor
          id={`field-${field.id}`}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          focused={focused}
          disabled={disabled}
          height={field.lines}
          onFocus={onFocus}
          onChange={onChange}
        />
        {error ? <text fg={theme.colors.error}>{error}</text> : null}
      </box>
    );
  }
  return (
    <box flexDirection="column" minHeight={2}>
      <text
        fg={focused ? theme.colors.focusRing : theme.colors.foreground}
      >{`${fieldIcon(field.kind)} ${field.label}`}</text>
      <box flexDirection="row" flexWrap="wrap" minHeight={1}>
        {optionsForField(field, t).map((option) => (
          <ClickTarget
            key={String(option.value)}
            id={`field-${field.id}-${String(option.value)}`}
            disabled={disabled || option.disabled}
            focused={focused}
            selected={option.value === value}
            onClick={() => {
              onFocus();
              onChange(option.value);
            }}
          >
            {option.label}
          </ClickTarget>
        ))}
      </box>
      {error ? <text fg={theme.colors.error}>{error}</text> : null}
    </box>
  );
}

export function WorkbenchButton({
  id,
  children,
  focused,
  selected,
  danger,
  disabled,
  onClick,
}: {
  id?: string;
  children: string;
  focused?: boolean;
  selected?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}): ReactNode {
  const theme = useTerminalTheme();
  const [hovered, setHovered] = useState(false);
  const color = disabled
    ? theme.colors.mutedForeground
    : danger
      ? theme.colors.error
      : focused || hovered || selected
        ? theme.colors.focusRing
        : theme.colors.foreground;
  return (
    <box
      id={id}
      borderStyle="rounded"
      borderColor={color}
      paddingLeft={1}
      paddingRight={1}
      justifyContent="center"
      alignItems="center"
      onMouseDown={disabled ? undefined : onClick}
      onMouseOver={disabled ? undefined : () => setHovered(true)}
      onMouseOut={disabled ? undefined : () => setHovered(false)}
    >
      <text fg={color}>
        {focused || hovered || selected ? <b>{children}</b> : children}
      </text>
    </box>
  );
}

export function ExecutionActions<Result>({
  session,
  executeLabel = "▶ 执行",
  confirmLabel = "⚠ 确认后执行",
}: {
  session: TerminalUiSession<Result>;
  executeLabel?: string;
  confirmLabel?: string;
}): ReactNode {
  if (session.phase === "running" || session.phase === "paused") {
    return (
      <box flexDirection="row" gap={1} flexShrink={0}>
        {session.canPause ? (
          <WorkbenchButton
            id={session.phase === "paused" ? "resume" : "pause"}
            onClick={() =>
              void (session.phase === "paused"
                ? session.resume()
                : session.pause())
            }
          >
            {session.phase === "paused" ? "▶ 继续" : "Ⅱ 暂停"}
          </WorkbenchButton>
        ) : null}
        {session.canCancel ? (
          <WorkbenchButton
            id="cancel"
            danger
            onClick={() => void session.cancel()}
          >
            ■ 取消
          </WorkbenchButton>
        ) : null}
      </box>
    );
  }
  if (session.confirming) {
    return (
      <box flexDirection="row" gap={1} flexShrink={0}>
        <WorkbenchButton id="dismiss-confirmation" onClick={session.dismissConfirmation}>
          ← 返回
        </WorkbenchButton>
        <WorkbenchButton id="confirm-execute" danger onClick={() => void session.confirmExecute()}>
          {confirmLabel}
        </WorkbenchButton>
      </box>
    );
  }
  return (
    <WorkbenchButton
      id="execute"
      danger={session.dangerous}
      onClick={() => void session.requestExecute()}
    >
      {session.dangerous ? confirmLabel : executeLabel}
    </WorkbenchButton>
  );
}

export function WorkbenchHeaderActions({
  onReset,
  onExit,
  resetLabel = "↺ 重置",
  exitLabel = "× 退出",
}: {
  onReset: () => void;
  onExit: () => void;
  resetLabel?: string;
  exitLabel?: string;
}): ReactNode {
  return (
    <box height={3} flexShrink={0} flexDirection="row">
      <WorkbenchButton id="reset" onClick={onReset}>
        {resetLabel}
      </WorkbenchButton>
      <WorkbenchButton id="exit" onClick={onExit}>
        {exitLabel}
      </WorkbenchButton>
    </box>
  );
}

export function ClickTarget({
  id,
  children,
  focused,
  selected,
  disabled,
  bordered,
  onClick,
}: {
  id?: string;
  children: string;
  focused?: boolean;
  selected?: boolean;
  disabled?: boolean;
  bordered?: boolean;
  onClick: () => void;
}): ReactNode {
  const theme = useTerminalTheme();
  const [hovered, setHovered] = useState(false);
  const active = focused || hovered || selected;
  const color = disabled
    ? theme.colors.mutedForeground
    : active
      ? theme.colors.focusRing
      : theme.colors.mutedForeground;
  const label = bordered ? children : `${selected ? "●" : "○"} ${children}`;
  return (
    <box
      id={id}
      paddingLeft={1}
      paddingRight={1}
      borderStyle={bordered ? "rounded" : undefined}
      borderColor={bordered ? color : undefined}
      height={bordered ? 3 : 1}
      justifyContent="center"
      alignItems="center"
      onMouseDown={disabled ? undefined : onClick}
      onMouseOver={disabled ? undefined : () => setHovered(true)}
      onMouseOut={disabled ? undefined : () => setHovered(false)}
    >
      <text fg={color}>{active ? <b>{label}</b> : label}</text>
    </box>
  );
}
