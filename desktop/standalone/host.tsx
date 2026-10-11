import * as React from 'react'
import './product.css'
import { createRoot } from 'react-dom/client'
import { createRemoteLoader } from '../../packages/ui-host/src/client/loader/remote-modules'

declare const __XAIHI_PRODUCT__: { title: string; remote: string; exportName: string }
const container = document.getElementById('xaihi-ui-root')
async function mount() {
  if (!container) throw new Error('缺少 #xaihi-ui-root')
  document.title = __XAIHI_PRODUCT__.title
  const loader = createRemoteLoader({ remotes: {
    [__XAIHI_PRODUCT__.remote]: new URL(`${__XAIHI_PRODUCT__.remote}/remoteEntry.js`, location.href).href,
  } })
  await loader.init()
  const loaded = await loader.load({ remote: __XAIHI_PRODUCT__.remote, exportName: __XAIHI_PRODUCT__.exportName })
  if (!loaded.ok) throw new Error(loaded.reason)
  const Panel = loaded.component as React.ComponentType
  createRoot(container).render(<Panel />)
}
void mount().catch(error => {
  container?.replaceChildren(Object.assign(document.createElement('pre'), { textContent: `Kisaki 装载失败：${String(error)}` }))
})
