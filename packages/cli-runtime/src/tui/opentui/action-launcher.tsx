/* @jsxImportSource @opentui/react */
import type { ReactNode } from "react"
import type { InteractionField, InteractionOption } from "../../interaction.js"
import type { TerminalUiSession } from "../session.js"
import { WorkbenchButton } from "./workbench-controls.js"

/** One-click command strip. Commands are buttons, never mode-switching tabs. */
export function ActionLauncher<Result>({ field, session, disabled, id = `field-${field.id}`, options = field.options ?? [] }: { field: InteractionField; session: TerminalUiSession<Result>; disabled?: boolean; id?: string; options?: readonly InteractionOption[] }): ReactNode {
  const locked = disabled ?? session.phase === "running"
  return <box id={id} flexDirection="row" flexWrap="wrap" minHeight={3} alignItems="center" gap={1}>
    {options.map((option) => <WorkbenchButton key={String(option.value)} id={`${id}-${String(option.value)}`} disabled={locked || option.disabled} onClick={() => {
      session.focus(field.id)
      void session.requestAction(field.id, option.value)
    }}>{option.label}</WorkbenchButton>)}
  </box>
}
