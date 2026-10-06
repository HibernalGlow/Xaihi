import { createContext, useContext, useEffect, useId, useRef, useState, type DragEventHandler, type ReactNode } from "react"
import type { NodeLocalFilesCapability } from "@xiranite/contract"

type SubscribeDrops = NodeLocalFilesCapability["subscribeDrops"]

export interface LocalFileDropOptions {
  disabled?: boolean
  onDropFiles?: (files: File[]) => void
  onDropPaths: (paths: string[]) => void
  onUnsupported?: () => void
  subscribeDrops?: SubscribeDrops
}

const LocalFilesContext = createContext<NodeLocalFilesCapability | undefined>(undefined)

export function LocalFilesProvider(props: { children: ReactNode; value?: NodeLocalFilesCapability }) {
  return <LocalFilesContext.Provider value={props.value}>{props.children}</LocalFilesContext.Provider>
}

/**
 * Framework-neutral file-drop target for node UIs.
 *
 * Direct DOM paths are used by hosts that expose File.path. A native desktop adapter that can name a dropped
 * file publishes absolute paths through the optional subscribeDrops capability, and that seam is contained
 * here so node components never import a host runtime.
 */
export function useLocalFileDrop(options: LocalFileDropOptions) {
  const localFiles = useContext(LocalFilesContext)
  const targetId = `local-file-drop-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  const [dragging, setDragging] = useState(false)
  const latestRef = useRef(options)
  latestRef.current = options
  const subscribeDrops = options.subscribeDrops ?? localFiles?.subscribeDrops

  useEffect(() => {
    if (!subscribeDrops) return
    let disposed = false
    let unsubscribe: (() => void) | undefined
    void subscribeDrops(targetId, (paths) => {
      if (!disposed && !latestRef.current.disabled && paths.length) {
        latestRef.current.onDropPaths(paths)
      }
    }).then((release) => {
      if (disposed) release()
      else unsubscribe = release
    })
    return () => { disposed = true; unsubscribe?.() }
  }, [subscribeDrops, targetId])

  const onDragOver: DragEventHandler<HTMLElement> = (event) => {
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = "copy"
    setDragging(true)
  }
  const onDrop: DragEventHandler<HTMLElement> = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setDragging(false)
    if (latestRef.current.disabled) return
    const paths = Array.from(event.dataTransfer.files).flatMap((file) => {
      const path = (file as File & { path?: string }).path?.trim()
      return path ? [path] : []
    })
    if (paths.length) latestRef.current.onDropPaths(paths)
    else if (event.dataTransfer.files.length && latestRef.current.onDropFiles) {
      const files = Array.from(event.dataTransfer.files)
      // Desktop hosts publish the authoritative absolute path through the
      // native subscription. A pathless DOM File must never be mistaken for a
      // browser/Wasm input merely because its native event arrives later.
      if (!subscribeDrops) latestRef.current.onDropFiles(files)
    }
    else if (event.dataTransfer.files.length) latestRef.current.onUnsupported?.()
  }

  return {
    targetId,
    targetProps: {
      "data-file-drop-target": "local-files",
      "data-local-file-drop-target": targetId,
      onDragOver,
      onDragLeave: () => setDragging(false),
      onDrop,
    },
    dragging,
  }
}
