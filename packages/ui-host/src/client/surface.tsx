/**
 * 中栏那一格的**选择**：文档面还是外壳面，以及这条选择怎么读到。
 *
 * 为什么放在组件里读而不是在 `apply()` 里读一次：DSH 的槽按它自己的重渲染源走，
 * 外部塞进去的一份异步状态没有通知路就永远不上屏（读到但显示不出来，比显示错更难查）。
 * 组件自己有 `useState` / `useEffect`，读到了自然重渲染——这一层不需要宿主机制配合。
 *
 * 默认面是外壳现 realm（`inRealm` 那片），因为清单还没读到时**不该出现空白**；
 * 一旦 `ui.documentUrl` 有值就换到文档面。两条路径都会把"为什么是这一面"写进
 * `data-xaihi-reason`，界面上读得回来（ADR-0011 决定 4 的降级铁律）。
 *
 * @module xaihi-ui/surface
 */

import { useEffect, useRef, useState } from 'react'
import type { ShellCapabilities } from '@hibernalglow/xaihi-sdk/bridge'
import type { ReactElement } from 'react'
import { fetchSurface, planSurface, DocumentFrame, type SurfacePlan } from './document-frame.tsx'
import { injectDesignCss } from './styles-inject.ts'
import type { RootProps } from './workspace.tsx'

/** 还没读到清单时的那一面：显示退化说明，读到之后才可能换到文档面。 */
const pending: SurfacePlan = { kind: 'in-realm', documentUrl: '', reason: '还没读到宿主清单（先显示退化说明）' }

export interface RealmProps extends RootProps {
  /** 为什么是这一面。退化面必须把它显示出来，不许只挂在属性上。 */
  reason: string
}

export interface SurfaceProps extends RootProps {
  /**
   * 文档产物缺席时显示的那一面，缺省是 `NoDocumentFace`。
   * 它必须被**挂载**（`<InRealm …/>`）而不是被当函数调用：组件的 hooks 记在调用方身上，
   * 于是 pending→document 那次重渲染少一整层 hook
   * =宿主里的 `slot entry crashed in 'main': Minified React error #300`（2026-10-06 实测；
   * #300 的原文是 "Rendered fewer hooks than expected"）。槽入口一崩，整格连同那座桥一起消失。
   */
  inRealm?: (props: RealmProps) => ReactElement
  /** 注入的 fetch，测试给假的那份；缺省用全局的。 */
  fetcher?: typeof fetch
  /** 外壳真能兑现的能力面；空对象 = 什么都给不了，文档那侧会读到成串的退化原因。 */
  caps?: ShellCapabilities
}

/**
 * 文档产物缺席时的那一面：纯 DOM，不 import 移植树里的任何东西。
 *
 * 为什么这里不能放搬来的工作台：ADR-0009 实测过 19 写的元素穿过 DSH 的槽契约（那一层由宿主的
 * React 18 解释）会崩（`Minified React error #31`；同一次编译里混 18/19 是
 * `Cannot read properties of undefined (reading 'S')`）。槽里能穿的只有 DOM，所以工作台只跑在
 * Xaihi 自己的文档里；这一格在产物缺席时只剩一句话，而不是半座会崩的界面。
 * @param props - 外壳面板的 props 加上那句原因。
 * @returns 一句读得回来的退化说明。
 */
export function NoDocumentFace(props: RealmProps): ReactElement {
  return (
    <div className="xaihi-document-absent flex flex-col items-start gap-2 p-3">
      <span className="font-mono text-[10px] tracking-widest">{props.reason}</span>
      <span className="text-xs">
        Xaihi 的工作台跑在自己的文档里（ADR-0009：React 19 的元素穿不过宿主的槽契约）。
        配好 <code>core.uiBundleDir</code> 并把产物建出来，这一格就换成那座桥。
      </span>
    </div>
  )
}

/**
 * 那一格该显示什么。
 * @param props - 外壳面板的 props，加上 `inRealm` 那片回退。
 * @returns 选出来的那一面，带一条读得回的原因。
 */
export function MainSurface(props: SurfaceProps): ReactElement {
  const { inRealm = NoDocumentFace, fetcher, caps, ...root } = props
  const [plan, setPlan] = useState<SurfacePlan>(pending)
  const realmRoot = useRef<HTMLDivElement | null>(null)

  // 建表与挂锚点必须成对：构建期把 `:root[data-app-design=…]` 那 665 条门改写成
  // `[data-xaihi-ui][data-app-design=…]`（实测整形后危险形状 0），于是没人挂锚点就等于
  // 六份设计配方静默不生效——症状是"颜色没变"，控制台里什么都没有。
  // 文档面那一格是独立 realm，它的 CSS 在它自己的产物里，这里不该也不能替它注。
  useEffect(() => {
    if (plan.kind === 'document') return () => {}
    return injectDesignCss({ root: realmRoot.current })
  }, [plan.kind])

  // 不设 cancelled 旗子：减法跑测证过它无可观察后果（React 18 对已卸载组件的 setState
  // 是无声 no-op，那条告警早就撤了），留着一个永远测不到的分支比不留更糟。
  useEffect(() => {
    const read = async () => {
      const source = await fetchSurface(fetcher ?? globalThis.fetch)
      if (source.ok === false) {
        // 读失败也要留一面能用的界面，但原因必须换成"读失败"那句，不能停在"还没读到"。
        setPlan({ kind: 'in-realm', documentUrl: '', reason: source.reason })
        return
      }
      setPlan(planSurface(source.ui))
    }
    void read()
  }, [fetcher])

  if (plan.kind === 'document') {
    // 能力面由装配侧给（`shellCapsFrom`）；没给到的那几组会带着自己的退化原因穿到桥对面，
    // 而不是在这里现编一个假实现——文档那侧读到的 refused 是有名字的。
    // 两个分支只差那一句退化说明在不在：清单没发 `hostMount` 时不传这个键
    // （`exactOptionalPropertyTypes` 下传 `undefined` 是类型错，语义上也不该把"没说"说成"没有"）。
    if (plan.hostMount === undefined) return <DocumentFrame documentUrl={plan.documentUrl} caps={caps ?? {}} />
    return <DocumentFrame documentUrl={plan.documentUrl} caps={caps ?? {}} hostMount={plan.hostMount} />
  }
  const InRealm = inRealm
  return (
    <div ref={realmRoot} className="xaihi-surface-in-realm" data-xaihi-surface="in-realm" data-xaihi-reason={plan.reason}>
      <InRealm {...root} reason={plan.reason} />
    </div>
  )
}
