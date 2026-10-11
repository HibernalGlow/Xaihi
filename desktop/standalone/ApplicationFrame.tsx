import { useMemo, useState, type ReactNode } from 'react'
import { FloatingWindowFrameProvider, FloatingWindowNodeHeader, useFloatingWindowFrame } from '@/components/workspace/FloatingWindowFrame'
import { StandaloneApplicationProvider, StandaloneApplicationSettingsButton } from '@/nodes/shared/StandaloneApplicationContext'

/** 独立节点共用的应用入口与原生拖动带，节点内容保持自己的标题和设置。 */
export function ApplicationFrame({ name, appearance, children }: { name: string; appearance: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const frame = useFloatingWindowFrame()
  const application = useMemo(() => ({ name, appearance, open, setOpen }), [name, appearance, open])
  const nodeFrame = useMemo(() => frame && { ...frame, captionOwner: 'system' as const, captionBandInlinePx: '0px' }, [frame])
  return <StandaloneApplicationProvider value={application}>
    <header data-standalone-application-titlebar="true" className="flex shrink-0">
      <FloatingWindowNodeHeader>
        <span className="px-3 text-xs font-medium text-muted-foreground">{name}</span>
        <div data-standalone-window-drag-space="true" className="min-w-12 flex-1 self-stretch" aria-hidden="true" />
        <StandaloneApplicationSettingsButton />
      </FloatingWindowNodeHeader>
    </header>
    {nodeFrame ? <FloatingWindowFrameProvider value={nodeFrame}>{children}</FloatingWindowFrameProvider> : children}
  </StandaloneApplicationProvider>
}
