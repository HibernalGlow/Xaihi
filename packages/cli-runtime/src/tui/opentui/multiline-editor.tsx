/* @jsxImportSource @opentui/react */
import type { TextareaRenderable } from "@opentui/core"
import { useEffect, useRef, type ReactNode } from "react"

import { useTerminalTheme } from "../theme.js"

export function MultilineEditor({
  id,
  value,
  placeholder,
  focused,
  disabled,
  height = 5,
  onFocus,
  onChange,
}: {
  id: string
  value: string
  placeholder?: string
  focused: boolean
  disabled?: boolean
  height?: number
  onFocus: () => void
  onChange: (value: string) => void
}): ReactNode {
  const theme = useTerminalTheme()
  const editorRef = useRef<TextareaRenderable | null>(null)

  useEffect(() => {
    const editor = editorRef.current
    if (editor && editor.plainText !== value) editor.setText(value)
  }, [value])

  return (
    <box
      id={id}
      borderStyle="rounded"
      borderColor={focused ? theme.colors.focusRing : theme.colors.border}
      height={height}
      minHeight={height}
      onMouseDown={disabled ? undefined : onFocus}
    >
      <textarea
        ref={(editor) => {
          editorRef.current = editor
          if (editor && editor.plainText !== value) editor.setText(value)
        }}
        width="100%"
        height="100%"
        initialValue={value}
        placeholder={placeholder ?? null}
        focused={focused && !disabled}
        backgroundColor="transparent"
        focusedBackgroundColor="transparent"
        textColor={theme.colors.foreground}
        focusedTextColor={theme.colors.foreground}
        placeholderColor={theme.colors.mutedForeground}
        selectionBg={theme.colors.focusRing}
        selectionFg={theme.colors.foreground}
        wrapMode="word"
        onContentChange={disabled ? undefined : () => {
          const next = editorRef.current?.plainText ?? ""
          if (next !== value) onChange(next)
        }}
      />
    </box>
  )
}

export function PathListInput(props: Parameters<typeof MultilineEditor>[0]): ReactNode {
  return <MultilineEditor {...props} height={props.height ?? 6} />
}
