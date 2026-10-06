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

import { useEffect, useState } from 'react'
import type { ShellCapabilities } from '@hibernalglow/xaihi-sdk/bridge'
import type { ReactElement } from 'react'
import { fetchSurface, planSurface, DocumentFrame, type SurfacePlan } from './document-frame.tsx'
import type { RootProps } from './workspace.tsx'

/** 还没读到清单时的那一面：走外壳，但原因写的是"还没读到"，不是"没有这一格"。 */
const pending: SurfacePlan = { kind: 'in-realm', documentUrl: '', reason: '还没读到宿主清单（先显示外壳现 realm 的那一面）' }

export interface SurfaceProps extends RootProps {
  /** 外壳现 realm 的那一面由装配侧给（默认是 `WorkspaceRoot`），本组件只负责选。 */
  inRealm: (props: RootProps) => ReactElement
  /** 注入的 fetch，测试给假的那份；缺省用全局的。 */
  fetcher?: typeof fetch
  /** 外壳真能兑现的能力面；空对象 = 什么都给不了，文档那侧会读到成串的退化原因。 */
  caps?: ShellCapabilities
}

/**
 * 那一格该显示什么。
 * @param props - 外壳面板的 props，加上 `inRealm` 那片回退。
 * @returns 选出来的那一面，带一条读得回的原因。
 */
export function MainSurface(props: SurfaceProps): ReactElement {
  const { inRealm, fetcher, caps, ...root } = props
  const [plan, setPlan] = useState<SurfacePlan>(pending)

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
    // 能力面此刻是空的：设置面与运行面还没接进桥（那需要把 ctx.remote 的真名读准）。
    // 空着不是遗漏而是**可见退化**——文档那侧会读到 refused 并显示出来，不会拿到假的实现。
    return <DocumentFrame documentUrl={plan.documentUrl} caps={caps ?? {}} />
  }
  return (
    <div className="xaihi-surface-in-realm" data-xaihi-surface="in-realm" data-xaihi-reason={plan.reason}>
      {inRealm(root)}
    </div>
  )
}
