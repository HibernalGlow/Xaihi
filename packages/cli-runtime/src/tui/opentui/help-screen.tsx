/* @jsxImportSource @opentui/react */
import type { ReactNode } from "react"
import { localizeNodeHelp, type NodeHelp } from "@xiranite/contract"
import { useTerminalTheme } from "../theme.js"
import { ClickTarget, WorkbenchPanel } from "./workbench-controls.js"

export function TerminalHelpScreen({ help, language, onBack }: { help: NodeHelp; language: "zh" | "en"; onBack: () => void }): ReactNode {
  const theme = useTerminalTheme()
  const value = localizeNodeHelp(help, language)
  return <box width="100%" height="100%" flexDirection="column" paddingLeft={1} paddingRight={1}>
    <box height={3} flexShrink={0} borderStyle="single" borderColor={theme.colors.border} paddingLeft={1} paddingRight={1} flexDirection="row" justifyContent="space-between"><text fg={theme.colors.primary}><b>{`? ${value.title}`}</b></text><ClickTarget id="help-back" bordered onClick={onBack}>{`× ${language === "zh" ? "返回" : "Back"}`}</ClickTarget></box>
    <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} marginTop={1}>
      <WorkbenchPanel title={language === "zh" ? "使用场景" : "Workflows"} width="45%"><scrollbox flexGrow={1}><text fg={theme.colors.foreground}>{value.short}</text>{value.whenToUse?.map((item, index) => <text key={`when-${index}`} fg={theme.colors.mutedForeground}>{`• ${item}`}</text>)}{value.workflows.map((workflow, workflowIndex) => <box key={`${workflow.title}-${workflowIndex}`} flexDirection="column" marginTop={1}><text fg={theme.colors.primary}><b>{`◇ ${workflow.title}`}</b></text>{workflow.summary ? <text>{workflow.summary}</text> : null}{[...(workflow.ui ?? []), ...(workflow.cli ?? []), ...(workflow.tips ?? [])].map((step, index) => <text key={`${workflowIndex}-${index}`} fg={theme.colors.mutedForeground}>{`${index + 1}. ${step}`}</text>)}</box>)}</scrollbox></WorkbenchPanel>
      <WorkbenchPanel title={language === "zh" ? "命令与安全" : "Commands & safety"} flexGrow={1}><scrollbox flexGrow={1}>{value.commands.map((command, index) => <box key={`${command.title}-${index}`} flexDirection="column" marginBottom={1}><text fg={theme.colors.success}><b>{command.command ?? command.title}</b></text>{command.description ? <text fg={theme.colors.mutedForeground}>{command.description}</text> : null}{command.examples.map((example, exampleIndex) => <text key={`${index}-${exampleIndex}`}>{`$ ${example.command}`}</text>)}</box>)}{value.safety ? <box flexDirection="column" marginTop={1}><text fg={theme.colors.warning}><b>{`⚠ ${language === "zh" ? "默认模式" : "Default mode"}: ${value.safety.defaultMode ?? "-"}`}</b></text>{[...(value.safety.destructive ?? []), ...(value.safety.notes ?? [])].map((note, index) => <text key={index} fg={theme.colors.mutedForeground}>{`• ${note}`}</text>)}</box> : null}</scrollbox></WorkbenchPanel>
    </box>
  </box>
}
