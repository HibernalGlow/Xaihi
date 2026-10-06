import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type {
  InteractionField,
  InteractionValue,
  InteractionValues,
  TerminalInteractionDefinition,
  TerminalInteractionSchema,
  TerminalViewTable,
} from "../interaction.js"

export type TerminalUiPhase = "ready" | "running" | "paused" | "result"
export type TerminalResultTab = "status" | "logs"

export interface TerminalUiSession<Result> {
  phase: TerminalUiPhase
  values: InteractionValues
  fields: readonly InteractionField[]
  fieldErrors: Readonly<Record<string, string>>
  focusedControlId?: string
  confirming: boolean
  error?: string
  preview: readonly string[]
  dangerous: boolean
  dangerPrompt?: {
    title: string
    body: string
    confirmLabel: string
  }
  progress: number
  status: string
  logs: readonly string[]
  result?: Result
  resultTab: TerminalResultTab
  resultSummary?: {
    success: boolean
    message: string
    lines: readonly string[]
    table?: TerminalViewTable
  }
  setField: (fieldId: string, value: InteractionValue) => void
  focus: (controlId: string) => void
  moveFocus: (controlIds: readonly string[], direction: -1 | 1) => void
  requestExecute: () => Promise<void>
  requestAction: (fieldId: string, value: InteractionValue, overrides?: Readonly<InteractionValues>) => Promise<void>
  confirmExecute: () => Promise<void>
  dismissConfirmation: () => void
  canPause: boolean
  canCancel: boolean
  pause: () => Promise<void>
  resume: () => Promise<void>
  cancel: () => Promise<void>
  reset: () => void
  selectResultTab: (tab: TerminalResultTab) => void
}

interface TerminalUiState<Result> {
  phase: TerminalUiPhase
  values: InteractionValues
  fieldErrors: Record<string, string>
  focusedControlId?: string
  confirming: boolean
  error?: string
  progress: number
  status: string
  logs: string[]
  result?: Result
  resultTab: TerminalResultTab
  fatalError?: string
}

export function visibleInteractionFields<Input, Result>(
  schema: TerminalInteractionSchema<Input, Result>,
  values: Readonly<InteractionValues>,
): readonly InteractionField[] {
  return schema.fields.filter((field) => field.visibleWhen?.(values) ?? true)
}

export function validateInteractionValues<Input, Result>(
  schema: TerminalInteractionSchema<Input, Result>,
  values: Readonly<InteractionValues>,
): { fieldErrors: Record<string, string>; formError?: string } {
  const fieldErrors: Record<string, string> = {}
  for (const field of visibleInteractionFields(schema, values)) {
    const value = values[field.id]
    if (value === undefined) continue
    const message = field.validate?.(value, values)
    if (message) fieldErrors[field.id] = message
  }
  const input = schema.toInput(values)
  const formError = Object.keys(fieldErrors).length === 0
    ? schema.validate?.(values, input) ?? undefined
    : undefined
  return { fieldErrors, formError }
}

export function useTerminalUiSession<Input, Result>(
  definition: TerminalInteractionDefinition<Input, Result>,
): TerminalUiSession<Result> {
  const { schema } = definition
  const mountedRef = useRef(true)
  const [state, setState] = useState<TerminalUiState<Result>>(() => initialState(schema))
  const fields = visibleInteractionFields(schema, state.values)
  const input = useMemo(() => schema.toInput(state.values), [schema, state.values])
  const preview = useMemo(() => schema.preview(input), [input, schema])
  const dangerous = schema.isDangerous(input)
  const dangerPrompt = dangerous ? schema.dangerPrompt?.(input) : undefined

  useEffect(() => () => {
    mountedRef.current = false
  }, [])

  const setField = useCallback((fieldId: string, value: InteractionValue) => {
    setState((current) => {
      if (current.phase === "running" || current.phase === "paused") return current
      const field = schema.fields.find((candidate) => candidate.id === fieldId)
      if (!field) return current
      const normalizedValue = normalizeFieldValue(field, value)
      const nextValues = { ...current.values, [fieldId]: normalizedValue }
      const nextErrors = { ...current.fieldErrors }
      const validationError = field.validate?.(normalizedValue, nextValues) ?? null
      if (validationError) nextErrors[fieldId] = validationError
      else delete nextErrors[fieldId]
      return {
        ...current,
        phase: current.phase === "result" ? "ready" : current.phase,
        values: nextValues,
        fieldErrors: nextErrors,
        focusedControlId: fieldId,
        confirming: false,
        error: undefined,
      }
    })
  }, [schema])

  const focus = useCallback((controlId: string) => {
    setState((current) => ({ ...current, focusedControlId: controlId }))
  }, [])

  const moveFocus = useCallback((controlIds: readonly string[], direction: -1 | 1) => {
    if (controlIds.length === 0) return
    setState((current) => {
      const currentIndex = current.focusedControlId ? controlIds.indexOf(current.focusedControlId) : -1
      const nextIndex = currentIndex < 0
        ? direction === 1 ? 0 : controlIds.length - 1
        : (currentIndex + direction + controlIds.length) % controlIds.length
      return { ...current, focusedControlId: controlIds[nextIndex] }
    })
  }, [])

  const executeValues = useCallback(async (values: Readonly<InteractionValues>): Promise<void> => {
    const executionInput = schema.toInput(values)
    setState((current) => ({
      ...current,
      phase: "running",
      confirming: false,
      error: undefined,
      fieldErrors: {},
      fatalError: undefined,
      progress: 0,
      status: "",
      logs: [],
      result: undefined,
      resultTab: "status",
    }))

    try {
      const result = await definition.run(executionInput, (event) => {
        if (!mountedRef.current) return
        setState((current) => ({
          ...current,
          progress: event.type === "progress" ? clampProgress(event.progress ?? current.progress) : current.progress,
          status: event.message || current.status,
          logs: event.message.trim() ? [...current.logs, event.message].slice(-100) : current.logs,
        }))
      })
      if (!mountedRef.current) return
      const summary = schema.result(result)
      setState((current) => ({
        ...current,
        phase: "result",
        progress: summary.success ? 100 : current.progress,
        status: summary.message,
        result,
        resultTab: summary.success ? "status" : "logs",
      }))
    } catch (error) {
      if (!mountedRef.current) return
      const message = error instanceof Error ? error.message : String(error)
      setState((current) => ({
        ...current,
        phase: "result",
        status: message,
        fatalError: message,
        logs: [...current.logs, message].slice(-100),
        resultTab: "logs",
      }))
    }
  }, [definition, schema])

  const requestExecute = useCallback(async (): Promise<void> => {
    if (state.phase === "running" || state.phase === "paused") return
    const validation = validateInteractionValues(schema, state.values)
    if (Object.keys(validation.fieldErrors).length > 0 || validation.formError) {
      setState((current) => ({
        ...current,
        fieldErrors: validation.fieldErrors,
        focusedControlId: Object.keys(validation.fieldErrors)[0] ?? current.focusedControlId,
        error: validation.formError,
        confirming: false,
      }))
      return
    }
    if (schema.isDangerous(schema.toInput(state.values))) {
      setState((current) => ({ ...current, confirming: true, focusedControlId: "confirm-execute", error: undefined }))
      return
    }
    await executeValues(state.values)
  }, [executeValues, schema, state.phase, state.values])

  const requestAction = useCallback(async (fieldId: string, value: InteractionValue, overrides: Readonly<InteractionValues> = {}): Promise<void> => {
    if (state.phase === "running" || state.phase === "paused") return
    const field = schema.fields.find((candidate) => candidate.id === fieldId)
    if (!field) return
    const nextValues = { ...state.values, ...overrides, [fieldId]: normalizeFieldValue(field, value) }
    const validation = validateInteractionValues(schema, nextValues)
    if (Object.keys(validation.fieldErrors).length > 0 || validation.formError) {
      setState((current) => ({ ...current, values: nextValues, fieldErrors: validation.fieldErrors, focusedControlId: Object.keys(validation.fieldErrors)[0] ?? fieldId, error: validation.formError, confirming: false }))
      return
    }
    if (schema.isDangerous(schema.toInput(nextValues))) {
      setState((current) => ({ ...current, values: nextValues, fieldErrors: {}, focusedControlId: "confirm-execute", error: undefined, confirming: true }))
      return
    }
    await executeValues(nextValues)
  }, [executeValues, schema, state.phase, state.values])

  const confirmExecute = useCallback(async (): Promise<void> => {
    if (!state.confirming || state.phase === "running") return
    await executeValues(state.values)
  }, [executeValues, state.confirming, state.phase, state.values])

  const dismissConfirmation = useCallback(() => {
    setState((current) => ({ ...current, confirming: false, focusedControlId: "execute" }))
  }, [])

  const pause = useCallback(async () => {
    if (state.phase !== "running" || !definition.pause || !definition.resume) return
    await definition.pause()
    setState((current) => current.phase === "running" ? { ...current, phase: "paused" } : current)
  }, [definition, state.phase])

  const resume = useCallback(async () => {
    if (state.phase !== "paused" || !definition.resume) return
    await definition.resume()
    setState((current) => current.phase === "paused" ? { ...current, phase: "running" } : current)
  }, [definition, state.phase])

  const cancel = useCallback(async () => {
    if (state.confirming) {
      dismissConfirmation()
      return
    }
    await definition.cancel?.()
  }, [definition, dismissConfirmation, state.confirming])

  const reset = useCallback(() => {
    setState(initialState(schema))
  }, [schema])

  const selectResultTab = useCallback((resultTab: TerminalResultTab) => {
    setState((current) => ({ ...current, resultTab, focusedControlId: `tab-${resultTab}` }))
  }, [])

  const resultSummary = state.fatalError
    ? { success: false, message: state.fatalError, lines: [] as readonly string[] }
    : state.result === undefined
      ? undefined
      : (() => {
          const summary = schema.result(state.result)
          return { ...summary, lines: summary.lines ?? [] }
        })()

  return {
    phase: state.phase,
    values: state.values,
    fields,
    fieldErrors: state.fieldErrors,
    focusedControlId: state.focusedControlId,
    confirming: state.confirming,
    error: state.error,
    preview,
    dangerous,
    dangerPrompt,
    progress: state.progress,
    status: state.status,
    logs: state.logs,
    result: state.result,
    resultTab: state.resultTab,
    resultSummary,
    setField,
    focus,
    moveFocus,
    requestExecute,
    requestAction,
    confirmExecute,
    dismissConfirmation,
    canPause: Boolean(definition.pause && definition.resume),
    canCancel: Boolean(definition.cancel),
    pause,
    resume,
    cancel,
    reset,
    selectResultTab,
  }
}

function initialState<Input, Result>(schema: TerminalInteractionSchema<Input, Result>): TerminalUiState<Result> {
  const firstField = visibleInteractionFields(schema, schema.initialValues)[0]
  return {
    phase: "ready",
    values: { ...schema.initialValues },
    fieldErrors: {},
    focusedControlId: firstField?.id,
    confirming: false,
    progress: 0,
    status: "",
    logs: [],
    resultTab: "status",
  }
}

function normalizeFieldValue(field: InteractionField, value: InteractionValue): InteractionValue {
  if (field.kind !== "number") return value
  if (typeof value === "number") return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : value
}

function clampProgress(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress)))
}
