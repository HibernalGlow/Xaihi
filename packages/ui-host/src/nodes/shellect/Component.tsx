import { useCallback, type Ref } from 'react'
import type { NodeComponentProps, NodeRunResult } from '../../../../contract/src/index'
import { Manager } from '../../../../../plugins/shellect/frontend/Manager'
import { useNodeSurface } from '../shared/useNodeSurface'
import { useNodeSettingsFace } from '../shared/NodeSettingsFaceContext'
import { useMd3eActive } from '../shared/controls'

export function Component({ host }: NodeComponentProps) {
  const surface = useNodeSurface()
  const settings = useNodeSettingsFace()
  const md3e = useMd3eActive()
  const call = useCallback(async (input: Record<string, unknown>) => {
    const run = host.actions?.run ?? host.runner?.run
    if (!run) return { success: false, message: 'Shellect: DSH runner is unavailable' }
    return await run('shellect', input) as NodeRunResult
  }, [host])
  return <div ref={surface.ref as unknown as Ref<HTMLDivElement>} className="h-full min-h-0 w-full" data-node-ui={md3e ? 'md3e' : 'legacy'}><Manager call={call} subscribe={settings?.subscribe} compact={['collapsed', 'compact', 'portrait'].includes(surface.mode)} uiFace={md3e ? 'md3e' : 'legacy'} /></div>
}
