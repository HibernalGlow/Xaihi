import * as React from "react"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useComposedRefs } from "@/lib/compose-refs"
import { cn } from "@/lib/utils"
import { useLocalFileDrop } from "@/nodes/shared/useLocalFileDrop"

interface PathControlProps {
  dropMode?: "append" | "replace"
  extensions?: string[]
  onValueChange: (value: string) => void
  value?: string
}

type PathInputProps = Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> & PathControlProps & {
  onChange?: React.ChangeEventHandler<HTMLInputElement>
}

type PathTextareaProps = Omit<React.ComponentProps<typeof Textarea>, "onChange" | "value"> & PathControlProps & {
  autoResize?: { minHeight: number; maxHeight: number }
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>
}

function PathInput({ className, disabled, dropMode = "replace", extensions, onChange, onValueChange, value = "", ...props }: PathInputProps) {
  const drop = usePathControlDrop({ disabled, dropMode, extensions, onValueChange, value })
  return <Input {...props} {...drop.targetProps} className={cn(drop.dragging && "border-primary bg-primary/5 ring-2 ring-primary/20", className)} disabled={disabled} value={value} onChange={(event) => { onChange?.(event); onValueChange(event.currentTarget.value) }} />
}

function PathTextarea({ autoResize, className, disabled, dropMode = "append", extensions, onChange, onValueChange, ref, style, value = "", ...props }: PathTextareaProps) {
  const drop = usePathControlDrop({ disabled, dropMode, extensions, onValueChange, value })
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const composedRef = useComposedRefs(ref, textareaRef)
  React.useLayoutEffect(() => {
    const element = textareaRef.current
    if (!element || !autoResize) return
    element.style.height = "auto"
    const nextHeight = Math.max(autoResize.minHeight, Math.min(element.scrollHeight, autoResize.maxHeight))
    element.style.height = `${nextHeight}px`
    element.style.overflowY = element.scrollHeight > autoResize.maxHeight ? "auto" : "hidden"
  }, [autoResize, value])
  return <Textarea {...props} {...drop.targetProps} ref={composedRef} rows={autoResize ? 1 : props.rows} style={{ ...style, minHeight: autoResize?.minHeight, maxHeight: autoResize?.maxHeight }} className={cn(drop.dragging && "border-primary bg-primary/5 ring-2 ring-primary/20", className)} disabled={disabled} value={value} onChange={(event) => { onChange?.(event); onValueChange(event.currentTarget.value) }} />
}

function usePathControlDrop(options: Required<Pick<PathControlProps, "dropMode" | "onValueChange">> & Pick<PathControlProps, "extensions" | "value"> & { disabled?: boolean }) {
  return useLocalFileDrop({
    disabled: options.disabled,
    onDropPaths: (paths) => {
      const accepted = filterPaths(paths, options.extensions)
      if (!accepted.length) return
      options.onValueChange(options.dropMode === "replace" ? accepted[0]! : mergePathLines(options.value ?? "", accepted))
    },
  })
}

function filterPaths(paths: string[], extensions?: string[]): string[] {
  if (!extensions?.length) return paths
  const normalized = extensions.map((extension) => extension.toLowerCase().replace(/^\*?\.?/, "."))
  return paths.filter((path) => normalized.some((extension) => path.toLowerCase().endsWith(extension)))
}

export function mergePathLines(current: string, paths: string[]): string {
  return [...new Set([...current.split(/\r?\n/), ...paths].map((path) => path.trim()).filter(Boolean))].join("\n")
}

export { PathInput, PathTextarea }
