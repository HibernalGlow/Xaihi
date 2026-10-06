import { localizeNodeHelp, type NodeHelp } from "@xiranite/contract"
import type { CliHost } from "./index.js"
import { writeLine } from "./index.js"
import type { TerminalLanguage } from "./i18n.js"

export function formatTerminalNodeHelp(help: NodeHelp, language: TerminalLanguage): string[] {
  const value = localizeNodeHelp(help, language)
  const lines = [value.short, value.description ?? ""]
  if (value.whenToUse?.length) lines.push("", language === "zh" ? "适用场景" : "When to use", ...value.whenToUse.map((item) => `  • ${item}`))
  for (const workflow of value.workflows) lines.push("", `◇ ${workflow.title}`, workflow.summary ?? "", ...(workflow.ui ?? []).map((step) => `  UI: ${step}`), ...(workflow.cli ?? []).map((step) => `  CLI: ${step}`), ...(workflow.tips ?? []).map((tip) => `  Tip: ${tip}`))
  if (value.commands.length) {
    lines.push("", language === "zh" ? "命令" : "Commands")
    for (const command of value.commands) lines.push(`  ${command.command ?? command.title}`, `      ${command.description ?? ""}`, ...command.examples.map((example) => `      $ ${example.command}`))
  }
  if (value.fields?.length) {
    lines.push("", language === "zh" ? "参数" : "Fields")
    for (const field of value.fields) {
      const metadata = [field.type, field.required ? language === "zh" ? "必填" : "required" : undefined, field.defaultValue === undefined ? undefined : `${language === "zh" ? "默认" : "default"}=${field.defaultValue}`].filter(Boolean).join(", ")
      lines.push(`  ${field.name}${metadata ? `  [${metadata}]` : ""}`, `      ${field.description}`)
    }
  }
  if (value.safety) lines.push("", `${language === "zh" ? "安全模式" : "Safety mode"}: ${value.safety.defaultMode ?? "-"}`, ...(value.safety.destructive ?? []).map((item) => `  ! ${item}`), ...(value.safety.notes ?? []).map((note) => `  • ${note}`))
  return lines.filter((line, index, all) => line !== "" || all[index - 1] !== "")
}

export function writeTerminalNodeHelp(host: CliHost, help: NodeHelp, language: TerminalLanguage): void {
  writeLine(host, formatTerminalNodeHelp(help, language).join("\n"))
}
