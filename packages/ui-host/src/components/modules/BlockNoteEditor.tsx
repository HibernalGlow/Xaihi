import { useEffect, useRef } from "react"
import "@blocknote/core/fonts/inter.css"
import type { PartialBlock } from "@blocknote/core"
import { useCreateBlockNote } from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import "@blocknote/shadcn/style.css"

interface BlockNoteEditorProps {
  doc?: PartialBlock[]
  onDocChange(doc: PartialBlock[]): void
}

export default function BlockNoteEditor({ doc, onDocChange }: BlockNoteEditorProps) {
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onDocChangeRef = useRef(onDocChange)

  const editor = useCreateBlockNote({
    initialContent: doc,
  })

  useEffect(() => {
    onDocChangeRef.current = onDocChange
  }, [onDocChange])

  useEffect(() => {
    return () => {
      if (!flushTimer.current) return
      clearTimeout(flushTimer.current)
      onDocChangeRef.current(editor.document)
    }
  }, [editor])

  function handleChange() {
    if (flushTimer.current) clearTimeout(flushTimer.current)
    // Avoid persisting the whole workspace on every editor transaction.
    flushTimer.current = setTimeout(() => {
      onDocChangeRef.current(editor.document)
      flushTimer.current = null
    }, 400)
  }

  return (
    <div className="h-full w-full overflow-auto bn-shadcn">
      <BlockNoteView
        editor={editor}
        onChange={handleChange}
      />
    </div>
  )
}
