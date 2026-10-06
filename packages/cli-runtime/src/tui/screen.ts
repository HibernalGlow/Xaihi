import type {
  InteractionField,
  InteractionOption,
  InteractionValue,
  InteractionValues,
  TerminalInteractionView,
  TerminalInteractionSchema,
} from "../interaction.js"
import type { TerminalTranslator } from "./i18n.js"

export function optionsForField(field: InteractionField, t: TerminalTranslator): readonly InteractionOption[] {
  if (field.kind === "boolean") {
    return [
      { value: true, label: t("yes") },
      { value: false, label: t("no") },
    ]
  }
  return field.options ?? []
}

export function displayInteractionValue(
  field: InteractionField,
  value: InteractionValue | undefined,
  t?: TerminalTranslator,
): string {
  const option = field.options?.find((candidate) => candidate.value === value)
  if (option) return option.label
  if (typeof value === "boolean") return value ? (t?.("yes") ?? "Yes") : (t?.("no") ?? "No")
  return value === undefined ? "" : String(value)
}

export function nextInteractionValue(
  field: InteractionField,
  value: InteractionValue | undefined,
  direction: -1 | 1,
  t: TerminalTranslator,
): InteractionValue | undefined {
  const options = optionsForField(field, t).filter((option) => !option.disabled)
  if (options.length === 0) return value
  const currentIndex = options.findIndex((option) => option.value === value)
  const nextIndex = currentIndex < 0
    ? 0
    : (currentIndex + direction + options.length) % options.length
  return options[nextIndex]?.value
}

export function stepInteractionNumber(
  field: InteractionField,
  value: InteractionValue | undefined,
  direction: -1 | 1,
): number {
  const current = Number(value)
  const next = (Number.isFinite(current) ? current : 0) + (field.step ?? 1) * direction
  return Math.max(field.min ?? Number.NEGATIVE_INFINITY, Math.min(field.max ?? Number.POSITIVE_INFINITY, next))
}

export function fieldsForViewSection(
  fields: readonly InteractionField[],
  fieldIds: readonly string[],
): readonly InteractionField[] {
  const visibleIds = new Set(fields.map((field) => field.id))
  return fieldIds.flatMap((id) => {
    if (!visibleIds.has(id)) return []
    const field = fields.find((candidate) => candidate.id === id)
    return field ? [field] : []
  })
}

export function resolveInteractionView<Input, Result>(
  schema: TerminalInteractionSchema<Input, Result>,
  values: Readonly<InteractionValues>,
  t: TerminalTranslator,
): TerminalInteractionView {
  if (schema.view) return schema.view
  const midpoint = Math.ceil(schema.fields.length / 2)
  return {
    sections: [
      { id: "primary", title: t("parameters"), fieldIds: schema.fields.slice(0, midpoint).map((field) => field.id) },
      { id: "secondary", title: t("execution"), fieldIds: schema.fields.slice(midpoint).map((field) => field.id) },
    ],
    dashboard: {
      title: t("liveStatus"),
      description: schema.description,
      display: () => ({ primary: schema.title, secondary: schema.preview(schema.toInput(values))[0] }),
    },
  }
}
