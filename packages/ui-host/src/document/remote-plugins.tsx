import { useEffect, useState } from 'react'
import { createDshRemoteReconciler } from '@/plugins/dshRemotePlugins'

/** 每份文档各自注册 MF runtime；React 18 与 React 19 从不跨 realm 共享。 */
export function DshRemotePlugins() {
  const [notes, setNotes] = useState<string[]>([])
  useEffect(() => {
    const remotes = createDshRemoteReconciler()
    let controller: AbortController | undefined
    let disposed = false
    const refresh = async () => {
      controller?.abort()
      const request = new AbortController()
      controller = request
      try {
        const response = await fetch('/xaihi/manifest.json', { signal: request.signal, cache: 'no-store' })
        if (!response.ok) throw new Error('DSH manifest HTTP ' + response.status)
        const document = await response.json()
        if (!disposed && !request.signal.aborted) setNotes(remotes.reconcile(document))
      } catch (error) {
        if (!disposed && !request.signal.aborted) setNotes(['Xaihi: 无法刷新远端插件清单：' + String(error)])
      }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { disposed = true; controller?.abort(); window.removeEventListener('focus', refresh); remotes.dispose() }
  }, [])
  if (!notes.length) return null
  return <div role="status" aria-label="Xaihi remote plugins" className="text-xs text-muted-foreground">{notes.map((note, index) => <p key={index}>{note}</p>)}</div>
}
