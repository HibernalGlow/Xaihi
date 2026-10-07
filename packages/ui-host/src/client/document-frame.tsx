/**
 * DSH 槽里的那一格：一个 `<iframe>`，整个 Xaihi 界面在它的文档里跑。
 *
 * 为什么槽里只放一个框：DSH 的槽契约只让 `ReactNode` 穿过，那个类型由装好的渲染器解释
 * ——这台装配上是宿主的 React 18。搬进来的界面按 React 19 写（实测 `src/lib/pie-menu/primitive.tsx:16`
 * 就 import 了 19 才有的 `use`），19 的元素穿过这一层的症状是 `Minified React error #31`（ADR-0009 V1）。
 * 能穿的只有 DOM，所以这一格就是一个框，加上守着它的那座桥。
 *
 * 选哪一面的判据**不是开关名字**，而是一个读得回来的事实：宿主清单里 `ui.documentUrl` 有没有值。
 * 没值就是产物没配，界面必须把这条原因显示出来（ADR-0011 决定 4 的降级铁律），
 * 而不是静默留着上一形态的面板让人以为它还在正常工作。
 *
 * @module xaihi-ui/document-frame
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import type { HostMountState, UiBundleFace } from '@hibernalglow/xaihi-sdk/bridge'
import { wireShellToFrame, type ShellCapabilities } from '@hibernalglow/xaihi-sdk/bridge'

/** 这一格此刻该显示哪一面。 */
export interface SurfacePlan {
  kind: 'document' | 'in-realm'
  /** `document` 时是 iframe 的 src；`in-realm` 时是空串。 */
  documentUrl: string
  /** 为什么是这一面——两种都要能读回来，退化不是"什么都没发生"。 */
  reason: string
  /**
   * 产物里有没有问宿主的装载点（只在 `document` 那一面有意义）。
   * `undefined` = 宿主清单还没发这个字段（旧产物），按"没说"处理：不显示那句话，也不假装它在。
   */
  hostMount?: HostMountState
}

/** 那句退化说明：文档装得出来、界面也画得出，但节点界面无处可问宿主。 */
export const HOST_MOUNT_ABSENT_REASON = '这份文档产物里没有问宿主的装载点：界面画得出，但每个节点的 host 动词问不到对面（入口没起那座桥）。产物重新建出来之后这一句自己消失。'

/**
 * 按宿主清单里那份 `ui` 面决定这一格显示什么。
 * @param ui - 清单里的 `ui` 字段；老宿主或读不到清单时是 undefined。
 * @returns 该显示哪一面，以及给用户看的那句原因。
 */
export function planSurface(ui: UiBundleFace | undefined): SurfacePlan {
  if (ui === undefined) {
    return { kind: 'in-realm', documentUrl: '', reason: '宿主清单里没有 ui 这一格（Xaihi 的文档产物未知）' }
  }
  if (ui.documentUrl === '') {
    return { kind: 'in-realm', documentUrl: '', reason: ui.problems?.[0] ?? '文档产物此刻不可用' }
  }
  if (ui.problems && ui.problems.length > 0) {
    return { kind: 'in-realm', documentUrl: '', reason: ui.problems.join('；') }
  }
  // 装载点缺席时**不换面**：工作台是真画得出来的那一面，把它撤掉等于用一个诊断遮住能用的界面。
  // 决定 4 要的是"退化读得回来"，所以那句话加在旁边，而不是把界面换成一句说明。
  // 没发这个字段的旧清单按"没说"处理：不放这个键（`exactOptionalPropertyTypes` 下塞 `undefined` 是类型错，
  // 而语义上"没说"也不等于"没有"）。
  const ready: SurfacePlan = { kind: 'document', documentUrl: ui.documentUrl, reason: 'Xaihi 文档已就绪' }
  return ui.hostMount === undefined ? ready : { ...ready, hostMount: ui.hostMount }
}

/** 清单里那条 `ui` 面的读取结果：字段缺失与读不到是两件事，分开报。 */
export type SurfaceSource =
  | { ok: true; ui: UiBundleFace | undefined }
  | { ok: false; reason: string }

/**
 * 从宿主清单里取 `ui` 那一格。
 *
 * 走**我们自己**那条 `/xaihi/manifest.json`：它是本仓自己的路由、`no-store`，
 * 而不是 DSH 的 API 面（文档那一侧也不许打 DSH 的 API，见 ADR-0009 后果 3b）。
 * @param fetcher - 注入的 fetch，测试给假的那份。
 * @param path - 清单路径。
 * @returns 读到的是哪一类结果。
 */
export async function fetchSurface(fetcher: typeof fetch, path = '/xaihi/manifest.json'): Promise<SurfaceSource> {
  let response: Response
  try {
    response = await fetcher(path, { cache: 'no-store' })
  } catch (error) {
    return { ok: false, reason: `清单读不到：${error instanceof Error ? error.message : String(error)}` }
  }
  if (!response.ok) return { ok: false, reason: `清单返回 ${response.status}` }
  let parsed: unknown
  try {
    parsed = await response.json()
  } catch (error) {
    return { ok: false, reason: `清单不是 JSON：${error instanceof Error ? error.message : String(error)}` }
  }
  if (typeof parsed !== 'object' || parsed === null) return { ok: true, ui: undefined }
  const ui = (parsed as { ui?: unknown }).ui
  if (typeof ui !== 'object' || ui === null) return { ok: true, ui: undefined }
  const face = ui as { documentUrl?: unknown; rev?: unknown; problems?: unknown; hostMount?: unknown }
  if (typeof face.documentUrl !== 'string' || typeof face.rev !== 'string') {
    return { ok: false, reason: '清单里的 ui 形状不对（documentUrl / rev 缺一个）' }
  }
  const problems = Array.isArray(face.problems) ? face.problems.filter((row): row is string => typeof row === 'string') : undefined
  // `hostMount` 要**按值收**再放进行：这一层是重建对象而不是原样透传，漏了这一步就是
  // 服务端说了、界面没听见（实机症状：产物里没有装载点而那一格安静地画着工作台）。
  // 认不出的值按"没说"处理，不猜成 present。
  const hostMount: HostMountState | undefined =
    face.hostMount === 'present' || face.hostMount === 'absent' || face.hostMount === 'unreadable' ? face.hostMount : undefined
  return {
    ok: true,
    ui: {
      documentUrl: face.documentUrl,
      rev: face.rev,
      ...(problems && problems.length > 0 ? { problems } : {}),
      ...(hostMount === undefined ? {} : { hostMount }),
    },
  }
}

export interface DocumentFrameProps {
  /** iframe 的 src，含 rev；由 planSurface 给。 */
  documentUrl: string
  /** 打开哪个节点的表面；空串是整个工作台。 */
  node?: string
  caps: ShellCapabilities
  /** 显示给使用者的退化文案（`in-realm` 那条路径用它）。 */
  reason?: string
  /**
   * 产物里有没有问宿主的装载点（`absent` 时在那一格上方补一句）。
   * `undefined` 按"没说"处理：不补句子，也不说它有。
   */
  hostMount?: HostMountState
}

/**
 * 那一格界面本身。
 * @param props - 见 `DocumentFrameProps`。
 * @returns 一个撑满格子的 iframe，或在文档产物不可用时那句可读回的原因。
 */
export function DocumentFrame(props: DocumentFrameProps): ReactElement {
  const plan = props.documentUrl === ''
    ? { kind: 'in-realm' as const, documentUrl: '', reason: props.reason ?? '' }
    : { kind: 'document' as const, documentUrl: props.documentUrl, reason: '' }
  const [selfOrigin, setSelfOrigin] = useState(() => (typeof window === 'undefined' ? '' : window.location.origin))
  const ref = useRef<HTMLIFrameElement | null>(null)
  const wired = useMemo(
    () => wireShellToFrame(props.caps, selfOrigin, () => ref.current),
    [props.caps, selfOrigin],
  )

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    if (selfOrigin === '') setSelfOrigin(window.location.origin)
    const onMessage = (event: MessageEvent) => {
      if (!wired.fromThisFrame(event)) return
      void wired.bridge.receive(event.data, event.origin)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [wired, selfOrigin])

  if (plan.kind === 'in-realm') {
    return <div className="xaihi-document-unavailable" data-xaihi-surface="in-realm">{plan.reason}</div>
  }
  const src = props.node ? `${plan.documentUrl}?node=${encodeURIComponent(props.node)}` : plan.documentUrl
  return (
    <>
      {props.hostMount === 'absent' ? (
        /* 这一句是给使用者看的，不是给控制台：文档装得出来、界面画得出来，但节点界面问不到宿主，
           症状会是"点了没反应"。决定 4 要求这种退化在界面上读得回来。 */
        <div className="xaihi-notice xaihi-host-mount-absent" data-xaihi-host-mount="absent" role="status">
          {HOST_MOUNT_ABSENT_REASON}
        </div>
      ) : null}
      <iframe
        ref={ref}
        className="xaihi-document-frame"
        data-xaihi-surface="document"
        src={src}
        title="Xaihi"
        style={{ width: '100%', height: '100%', minHeight: 360, border: 0 }}
      />
    </>
  )
}
