import type { NodeLocalFilesCapability } from '../../packages/contract/src/index'

interface DesktopFilesSurface {
  __DSH_HOST_PATHS__?: { pathFor(file: File): string }
  __XAIHI_LOCAL_FILES__?: Pick<NodeLocalFilesCapability, 'pickFiles' | 'pickDirectories' | 'openPath' | 'revealPath'>
  __DSH_DIRECTORY_PICKER__?: { pick(): Promise<string | null> }
}

/** 原生能力只在桌面层探测，再沿节点原有的 localFiles 契约注入。 */
export function createDesktopLocalFiles(scope: DesktopFilesSurface, doc: Document): Omit<NodeLocalFilesCapability, 'getUrl'> {
  const native = scope.__XAIHI_LOCAL_FILES__
  const paths = scope.__DSH_HOST_PATHS__
  const picker = scope.__DSH_DIRECTORY_PICKER__
  return {
    ...native,
    ...(picker ? { pickDirectory: async () => await picker.pick() ?? undefined } : {}),
    ...(paths ? {
      subscribeDrops: async (targetId, listener) => {
        const handle = (event: DragEvent) => {
          const target = event.target instanceof Element ? event.target.closest('[data-local-file-drop-target]') : null
          if (target?.getAttribute('data-local-file-drop-target') !== targetId || !event.dataTransfer?.files.length) return
          const selected = Array.from(event.dataTransfer.files).map(file => paths.pathFor(file)).filter(Boolean)
          if (!selected.length) return
          event.preventDefault()
          // React 的路径无关 File 分支先结束，之后交付原生绝对路径。
          queueMicrotask(() => listener([...new Set(selected)]))
        }
        doc.addEventListener('drop', handle, true)
        return () => doc.removeEventListener('drop', handle, true)
      },
    } satisfies Pick<NodeLocalFilesCapability, 'subscribeDrops'> : {}),
  }
}
