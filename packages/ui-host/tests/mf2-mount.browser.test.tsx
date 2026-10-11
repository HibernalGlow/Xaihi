import { commands } from 'vitest/browser'
import * as React from 'react'
import { render, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { beforeAll, afterEach, describe, expect, it } from 'vitest'
import { ModuleRenderer } from '@/components/modules/ModuleRenderer'
import { DshRemotePlugins } from '@/document/remote-plugins'
import { createDshRemoteReconciler } from '@/plugins/dshRemotePlugins'
import { registeredFrontendPlugins, loadRemoteModule } from '@/plugins/frontendRuntime'
import { resolveEntryLoader, dynamicModuleIds } from '@/plugins/dynamicEntries'
import { contributedModules } from '@/plugins/contributions'
import { createRemoteLoader } from '@/client/loader/remote-modules'
import { observatory } from '@/client/loader/probe'
import { initI18n } from '@/i18n'
import { createShellBridge } from '@hibernalglow/xaihi-sdk/bridge'
import type { WorkspaceDocument } from '@hibernalglow/xaihi-sdk'

declare module 'vitest/browser' {
  interface BrowserCommands {
    prepareMf2Document(): Promise<void>
    captureMf2Document(): Promise<{path: string; errors: string[]}>
  }
}

let document: WorkspaceDocument
let cleanupRegistrations: (() => void) | undefined
beforeAll(async () => {
  await initI18n('zh')
  document = await (await fetch('/xaihi/manifest.json')).json()
})
afterEach(() => { cleanup(); cleanupRegistrations?.(); cleanupRegistrations = undefined })
function register(manifest = document) {
  const reconciler = createDshRemoteReconciler()
  cleanupRegistrations = () => reconciler.dispose()
  expect(reconciler.reconcile(manifest)).toEqual([])
  return reconciler
}
function show(id: string) { return render(<ModuleRenderer moduleId={id} compId={'instance.' + id} />) }

describe('MF2 真挂载（生产 Core 路由、生产 runtime、生产 ModuleRenderer）', () => {
  it('正式打包的工作台文档经 UI 路由启动、发现 remote 并响应点击', async () => {
    await commands.prepareMf2Document()
    expect(document.ui.documentUrl, '先用 test:mf2 构建正式文档').not.toBe('')
    const frame = globalThis.document.createElement('iframe')
    frame.width = '1000'; frame.height = '700'
    const shell = createShellBridge({}, message => frame.contentWindow?.postMessage(message, location.origin), location.origin)
    let pendingHello: MessageEvent | undefined
    let allowHandshake = false
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.contentWindow) return
      if (!allowHandshake) { pendingHello = event; return }
      void shell.receive(event.data, event.origin)
    }
    window.addEventListener('message', receive)
    frame.src = document.ui.documentUrl + '?moduleId=mf2.node'
    const loaded = new Promise<void>(resolve => frame.addEventListener('load', () => resolve(), { once: true }))
    globalThis.document.body.append(frame)
    try {
      await loaded
      await waitFor(() => expect(frame.contentDocument?.title).toBe('Xaihi'), { timeout: 10000 })
      await waitFor(() => expect(frame.contentDocument?.body?.textContent).toContain('等待宿主握手'), { timeout: 15000 })
      expect(frame.contentDocument?.body?.textContent).not.toContain('MF2 node count: 0')
      allowHandshake = true
      expect(pendingHello).toBeTruthy()
      await shell.receive(pendingHello!.data, pendingHello!.origin)
      await waitFor(() => expect(frame.contentDocument?.body?.textContent).toContain('MF2 node count: 0'))
      const button = [...frame.contentDocument!.querySelectorAll('button')].find(item => item.textContent === 'MF2 node count: 0')!
      button.click()
      await waitFor(() => expect(frame.contentDocument?.body?.textContent).toContain('MF2 node count: 1'))
      const facts = (frame.contentWindow as unknown as { __XAIHI__: typeof observatory }).__XAIHI__
      expect(facts.modules['mf2_acceptance/entry']?.sameReactAsHost).toBe(true)
      expect(facts.modules['mf2_acceptance/entry']?.reactVersion).toBe('19.2.4')
      expect(frame.contentDocument?.querySelector('vite-error-overlay')).toBeNull()
      const evidence = await commands.captureMf2Document()
      expect(evidence.errors).toEqual([])
      console.info('MF2 production evidence: ' + evidence.path)
    } finally { window.removeEventListener('message', receive); frame.remove() }
  })
  it('DSH 清单刷新后注册贡献，并通过文档启动组件挂载', async () => {
    const view = render(<><DshRemotePlugins /><ModuleRenderer moduleId="mf2.panel" compId="startup.panel" /></>)
    await waitFor(() => expect(view.getByText('MF2 panel count: 0')).toBeTruthy())
    fireEvent.click(view.getByText('MF2 panel count: 0'))
    expect(view.getByText('MF2 panel count: 1')).toBeTruthy()
  })
  it('完整 AppNodeEntry 在真实 React hooks 下交互，React 同一性读回为 true', async () => {
    register()
    const view = show('mf2.node')
    await waitFor(() => expect(view.getByText('MF2 node count: 0')).toBeTruthy())
    fireEvent.click(view.getByText('MF2 node count: 0'))
    expect(view.getByText('MF2 node count: 1')).toBeTruthy()
    expect(observatory.modules['mf2_acceptance/entry']?.sameReactAsHost).toBe(true)
    expect(observatory.modules['mf2_acceptance/entry']?.reactVersion).toBe(React.version)
  })
  it('旧 PanelProps 适配后上屏，命令缺口有明确拒因', async () => {
    register()
    const view = show('mf2.panel')
    await waitFor(() => expect(view.getByText('MF2 panel count: 0')).toBeTruthy())
    fireEvent.click(view.getByText('Run command'))
    await waitFor(() => expect(view.getByRole('status').textContent).toContain('proposal P1'))
  })
  it('不存在的 expose 可见失败并提供重试', async () => {
    register()
    const view = show('mf2.missing')
    await waitFor(() => expect(view.getByText('Module "mf2.missing" failed to load')).toBeTruthy())
    expect(view.getByRole('button', { name: 'Retry loading' })).toBeTruthy()
    expect(view.getByRole('alert').textContent).not.toBe('')
  })
  it('remote 渲染抛错被节点边界接住，同屏健康节点仍可点击', async () => {
    register()
    const view = render(<><ModuleRenderer moduleId="mf2.throw" compId="broken" /><ModuleRenderer moduleId="mf2.node" compId="healthy" /></>)
    await waitFor(() => expect(view.getByText('MF2 render positive control')).toBeTruthy())
    await waitFor(() => expect(view.getByText('MF2 node count: 0')).toBeTruthy())
    fireEvent.click(view.getByText('MF2 node count: 0'))
    expect(view.getByText('MF2 node count: 1')).toBeTruthy()
  })
  it('不兼容 shared React 被拒绝，不能假装挂载成功', async () => {
    register()
    const view = show('mf2.incompatible')
    await waitFor(() => expect(view.getByText('Module "mf2.incompatible" failed to load')).toBeTruthy())
    expect(view.queryByText('MF2 panel count: 0')).toBeNull()
  })
  it('卸载清单条目会撤贡献、卸载屏上树，并拒绝后续装载', async () => {
    const reconciler = register()
    const view = show('mf2.node')
    await waitFor(() => expect(view.getByText('MF2 node count: 0')).toBeTruthy())
    reconciler.reconcile({ ...document, plugins: [] })
    await waitFor(() => expect(view.queryByText('MF2 node count: 0')).toBeNull())
    expect(dynamicModuleIds()).toEqual([])
    expect(contributedModules()).toEqual([])
    await expect(loadRemoteModule('mf2-acceptance', 'entry')).rejects.toThrow('not registered')
  })
  it('撞一方节点 id 必须报原因，保留一方入口', () => {
    const plugin = structuredClone(document.plugins[0]!)
    plugin.manifest.panels![0]!.id = 'kisaki'
    const reconciler = createDshRemoteReconciler()
    cleanupRegistrations = () => reconciler.dispose()
    expect(reconciler.reconcile({ ...document, plugins: [plugin] })).toContain('mf2-acceptance: panel id collision: kisaki')
    expect(resolveEntryLoader('kisaki')).toBeTruthy()
    expect(dynamicModuleIds()).not.toContain('kisaki')
  })
  it('换成过期 rev 不能继续显示缓存中的旧组件', async () => {
    const reconciler = register()
    const view = show('mf2.node')
    await waitFor(() => expect(view.getByText('MF2 node count: 0')).toBeTruthy())
    const changed = structuredClone(document)
    const plugin = changed.plugins[0]!
    plugin.remotes['mf2_acceptance'] = plugin.remotes['mf2_acceptance']!.replace(/\/[a-f0-9]{12}\//, '/000000000000/')
    expect(reconciler.reconcile(changed)).toEqual([])
    await waitFor(() => expect(view.queryByText('MF2 node count: 0')).toBeNull())
    await waitFor(() => expect(view.getByText('Module "mf2.node" failed to load')).toBeTruthy())
  })
  it('同一份清单刷新不会重挂组件，交互状态保留', async () => {
    const reconciler = register()
    const view = show('mf2.node')
    await waitFor(() => expect(view.getByText('MF2 node count: 0')).toBeTruthy())
    fireEvent.click(view.getByText('MF2 node count: 0'))
    expect(reconciler.reconcile(structuredClone(document))).toEqual([])
    expect(view.getByText('MF2 node count: 1')).toBeTruthy()
  })
  it('卸载在飞的装载不能把旧模块交回消费者', async () => {
    const reconciler = register()
    const pending = loadRemoteModule('mf2-acceptance', 'entry')
    reconciler.dispose()
    await expect(pending).rejects.toThrow('changed during loading')
  })
  it('未接线的 requires 会可见拒绝，不给面板虚构权限', async () => {
    const manifest = structuredClone(document)
    manifest.plugins[0]!.manifest.panels![0]!.requires = ['commands']
    register(manifest)
    const view = show('mf2.panel')
    await waitFor(() => expect(view.getByRole('alert').textContent).toContain('面板能力未接线：commands'))
    expect(view.queryByText('MF2 panel count: 0')).toBeNull()
  })
  it('AppNodeEntry 也不能绕过贡献点声明的 requires', async () => {
    const manifest = structuredClone(document)
    manifest.plugins[0]!.manifest.panels![1]!.requires = ['commands']
    register(manifest)
    const view = show('mf2.node')
    await waitFor(() => expect(view.getByRole('alert').textContent).toContain('面板能力未接线：commands'))
    expect(view.queryByText('MF2 node count: 0')).toBeNull()
  })
  it('旧 DSH loader 使用同一 runtime，未等待 init 也能装载', async () => {
    const plugin = document.plugins[0]!
    const loader = createRemoteLoader({ remotes: plugin.remotes })
    const result = await loader.load({ remote: 'mf2_acceptance', exportName: 'Panel' })
    expect(result.ok).toBe(true)
    expect(registeredFrontendPlugins().some(item => item.alias === 'mf2_acceptance')).toBe(true)
  })
})
