// 所有共享 context 与节点在同一个 remote，避免 MF 边界产生两份 Provider。
import * as React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider, useTheme } from 'next-themes'
import { NuqsAdapter } from 'nuqs/adapters/react'
import { initI18n } from '@/i18n'
import { Component } from '@/nodes/kisaki/Component'
import { createPersistedState } from '@/client/document-host'
import { createKisakiHost, createProductNodeUiStore } from './host'
import { createBridgeNodeSettingsFace } from '@/backend/nodeSettingsFace'
import { NodeUiConfigProvider } from '@/nodes/shared/NodeUiConfigContext'
import { KisakiAppearanceProvider, KisakiAppearanceSettings, useKisakiAppearance } from '@/nodes/kisaki/views/KisakiAppearance'
import { NodeSettingsFaceProvider } from '@/nodes/shared/NodeSettingsFaceContext'
import { NodeRuntimeProvider } from '@/nodes/shared/NodeRuntimeContext'
import { LocalFilesProvider } from '@/nodes/shared/useLocalFileDrop'
import { ApplicationFrame } from '../../standalone/ApplicationFrame'
import { coordinateProductSettings } from '../../standalone/settings-bridge'
import { startRealm } from '@/document/realm'
import { DocumentBridgeProvider, useBridgeReady } from '@/document/bridge-context'
import { mountSettingsFace } from '@/document/settings-face'
import { AppConfigSync } from '@/components/workspace/AppConfigSync'
import { WorkspaceAppearance } from '@/components/workspace/WorkspaceAppearance'
import { FloatingWindowFrameProvider } from '@/components/workspace/FloatingWindowFrame'
import { captionBandInlinePx } from '@/components/workspace/captionBand'
import { DshDesktopWindowRuntime } from '@/backend/adapters/dshDesktop'
import type { MainWindowAction, WindowCapabilities } from '@/backend/runtime/runtime'
import '@/client/generated/client.css'
import '@/index.css'
import '../../standalone/product.css'

// 动态块使用 core 文档注入的同源资源目录。
// @ts-ignore rspack runtime global
__webpack_public_path__ = `${globalThis.__XAIHI_UI__?.bundleBase ?? './'}kisaki/`
const startedRealm = startRealm()
const realm = startedRealm && { ...startedRealm, bridge: coordinateProductSettings(startedRealm.bridge) }
mountSettingsFace(realm)
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
const windows = new DshDesktopWindowRuntime()
// 外观与节点设置共享带版本号的串行写队列，但与全局外观分开保存。
const settingsHost = realm ? createKisakiHost(realm.bridge, { getData: () => ({}), patchData: () => {} }, () => {}) : undefined
const nodeUiConfig = settingsHost ? createProductNodeUiStore(settingsHost) : undefined
const nodeSettingsFace = realm ? createBridgeNodeSettingsFace(realm.bridge) : undefined
void initI18n()

function KisakiDocument() {
  const ready = useBridgeReady(realm?.bridge ?? null)
  const appearance = useKisakiAppearance()
  const [, renderState] = useState(0)
  const [hydrated, setHydrated] = useState(false)
  const [failure, setFailure] = useState('')
  const [capabilities, setCapabilities] = useState<WindowCapabilities | null>(null)
  const [isMaximized, setMaximized] = useState(false)
  const [pending, setPending] = useState(false)
  const state = useMemo(() => realm && createPersistedState({ bridge: realm.bridge, node: 'xaihi-kisaki' }), [])
  const host = useMemo(() => realm && state && createKisakiHost(realm.bridge, {
    getData: state.getData,
    patchData: patch => {
      state.patchData(patch)
      renderState(value => value + 1)
      void state.flush().then(() => { if (state.syncError()) setFailure(state.syncError()!) })
    },
  }, setFailure), [state])
  useEffect(() => {
    void windows.getCapabilities().then(setCapabilities, error => setFailure(String(error)))
  }, [])
  useEffect(() => {
    if (!ready || !state) return
    let active = true
    void state.hydrate().then(() => { if (active) setHydrated(true) }, error => { if (active) setFailure(String(error)) })
    return () => { active = false }
  }, [ready, state])
  const control = async (action: MainWindowAction) => {
    setPending(true)
    try {
      const result = await windows.controlMain(action)
      if (!result.success) throw new Error(result.message ?? '窗口操作不可用')
      setMaximized(result.state === 'maximized')
    } catch (error) { setFailure(String(error)) }
    finally { setPending(false) }
  }
  const frame = useMemo(() => ({
    captionOwner: capabilities?.captionOwner ?? 'system',
    captionBandInlinePx: capabilities?.captionInset ? captionBandInlinePx(capabilities.captionInset) : '0px',
    isMaximized, pending,
    control: (action: MainWindowAction) => { void control(action) },
    handleTitlebarDoubleClick: (event: React.MouseEvent<HTMLElement>) => {
      if ((event.target as HTMLElement).closest('button,input,select,textarea,a,[role="button"],[role="combobox"],[data-slot="select-trigger"]')) return
      void control(isMaximized ? 'restore' : 'maximize')
    },
    registerIntegratedTitlebar: () => () => {},
  }), [capabilities, isMaximized, pending])
  return <main data-xaihi-product="kisaki" data-standalone-palette={appearance.colorTheme} data-floating-window-caption={frame.captionOwner}>
    <WorkspaceAppearance designTheme={appearance.effectiveDesignTheme} />
    {failure && <p role="alert">{failure}</p>}
    {!capabilities?.supported && capabilities && <p role="status">{capabilities.message ?? '当前宿主没有原生窗口控制，使用系统标题栏。'}</p>}
    {hydrated && host
      ? <FloatingWindowFrameProvider value={frame}>
        <ApplicationFrame name="Kisaki" appearance={<KisakiAppearanceSettings />}><NodeRuntimeProvider nodeId="kisaki"><NodeUiConfigProvider store={nodeUiConfig}>
          <NodeSettingsFaceProvider face={nodeSettingsFace}><LocalFilesProvider value={host.localFiles}>
            <Component compId="xaihi-kisaki" host={host as unknown as React.ComponentProps<typeof Component>["host"]} />
          </LocalFilesProvider></NodeSettingsFaceProvider>
        </NodeUiConfigProvider></NodeRuntimeProvider></ApplicationFrame>
      </FloatingWindowFrameProvider>
      : <p role="status">正在读取 Kisaki 状态…</p>}
  </main>
}

function WorkspaceModeObserver({ onChange }: { onChange: (mode: string) => void }) {
  const { theme } = useTheme()
  useEffect(() => { onChange(theme ?? 'system') }, [theme, onChange])
  return <AppConfigSync />
}

function KisakiProduct() {
  const ready = useBridgeReady(realm?.bridge ?? null)
  const [workspaceMode, setWorkspaceMode] = useState('system')
  const [connectionFailure, setConnectionFailure] = useState('')
  useEffect(() => {
    if (ready) return
    const timer = setTimeout(() => setConnectionFailure('DSH 握手超时，请检查独立产品 profile。'), 15000)
    return () => clearTimeout(timer)
  }, [ready])
  return <>
    <ThemeProvider attribute="data-workspace-theme" defaultTheme="system" enableSystem>
      <WorkspaceModeObserver onChange={setWorkspaceMode} />
    </ThemeProvider>
    {ready ? <KisakiAppearanceProvider store={nodeUiConfig} workspaceMode={workspaceMode}>
      <KisakiDocument />
    </KisakiAppearanceProvider> : <main data-xaihi-product="kisaki"><p role={connectionFailure ? "alert" : "status"}>{connectionFailure || "正在连接 Kisaki 宿主…"}</p></main>}
  </>
}

export function Panel() {
  return <NuqsAdapter><QueryClientProvider client={queryClient}>
    <DocumentBridgeProvider bridge={realm?.bridge ?? null}>
      <KisakiProduct />
    </DocumentBridgeProvider>
  </QueryClientProvider></NuqsAdapter>
}

export const Probe = { react: React, version: React.version }
export default Panel
