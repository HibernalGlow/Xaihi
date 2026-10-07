/**
 * 配置中心三组适配器的**派生记录**实现。
 *
 * 立场（2026-10-07 与使用者对齐的方案）：权威值只有 settings 一份，历史/备份是它的
 * 派生物 —— 服务半边在写点与对账时把脱敏快照落进 storage domain
 * （`xaihi-core` 的 `/xaihi/settings-history.json` 路由），这里的适配器只是它的客户端。
 * 与 ADR-0013 的关系是明说的：配置历史这条标准面给不了，v1 用派生记录垫着，
 * 等提案落地整个删掉、迁移成本近零。
 *
 * 三样明示给不了的东西（抛读得回的错，不伪造数据）：
 * - **TOML 导入导出**：DSH 的设置文档是 JSON，没有 toml 路径，也没有"编译成 toml"的语义；
 * - **远端备份仓**（`setHistoryRemote`/`syncHistory`）：那是"配置住在一个 toml 文件里"
 *   时代的 git 同步机器，settings 活在宿主里，再往 git 推没有语义；
 * - **`path` 字段**：设置命名空间没有文件路径，契约里要 path 的返回一律给空串并注明，
 *   不编一个像样的路径。
 */

import type {
  NodeConfigExport,
  NodeConfigHistoryRepositoryStatus,
  NodeConfigVersion,
  NodeConfigVersionDetail,
} from "@xiranite/contract"
// 三组适配器的形状与 `NodeConfigPopover.tsx` 里那份 `NodeConfigCenterAdapters` 结构对齐
//（那边是 UI 侧的既有契约，这里不反向 import 以免成环）。
import type { NodeConfigBackupAdapter, NodeConfigHistoryAdapter, NodeConfigTransferAdapter } from "./NodeConfigPopover"

interface NodeConfigCenterAdapters {
  history: NodeConfigHistoryAdapter
  transfer: NodeConfigTransferAdapter
  backup: NodeConfigBackupAdapter
}
import { namespaceForNode } from "./NodeSettingsFaceContext"

/** 设置面（桥的 `config.getUi`/`config.save`），由装配侧经 context 递进来。 */
export interface DerivedConfigDeps {
  read: (ns: string) => Promise<{ value?: unknown; revision?: number }>
  write: (ns: string, patch: Record<string, unknown>, expectedRevision?: number) => Promise<void>
  onReload: () => Promise<void> | void
  /** `source`/`message` 列的人话标签；不给就用适配器里的英文兜底。 */
  t?: (key: string, fallback: string) => string
}

/** 服务半边列表路由的响应形状（真源在 `packages/core/src/settings-history.ts`）。 */
interface HistoryListResponse {
  durable: boolean
  reason: string | null
  total: number
  snapshots: Array<{
    ns: string
    revision: string
    at: number
    source: "write" | "reconcile"
    message: string
    fields: string[]
    patch: string
    value: string
  }>
}

const SETTINGS_HISTORY_PATH = "/xaihi/settings-history.json"

async function fetchHistory(ns: string, query: string): Promise<HistoryListResponse & { snapshot?: HistoryListResponse["snapshots"][number] }> {
  const response = await fetch(`${SETTINGS_HISTORY_PATH}?ns=${encodeURIComponent(ns)}${query}`)
  const body = await response.json().catch(() => null) as (HistoryListResponse & { error?: string; detail?: string }) | null
  if (!response.ok || body === null) {
    const detail = body?.detail ?? `HTTP ${response.status}`
    throw new Error(`设置历史读不到：${detail}`)
  }
  return body as HistoryListResponse
}

/** 把服务端快照折成契约要的版本条目（`source`/`message` 给人话）。 */
function toVersion(deps: DerivedConfigDeps, ns: string, snapshot: HistoryListResponse["snapshots"][number]): NodeConfigVersion {
  const t = deps.t ?? ((_, fallback) => fallback)
  return {
    revision: snapshot.revision,
    nodeId: ns,
    source: snapshot.source === "write" ? t("config.history.source.write", "Manual save") : t("config.history.source.reconcile", "Reconciled"),
    message: snapshot.message,
    createdAt: new Date(snapshot.at).toISOString(),
    fields: snapshot.fields,
  }
}

/**
 * 三组适配器。`history`/`transfer` 是真实现；`backup` 整组是读得回的降级——
 * 备份这件事已经被历史覆盖（每次保存即快照），远端同步没有对应物。
 */
export function createDerivedConfigAdapters(nodeKey: string, deps: DerivedConfigDeps): NodeConfigCenterAdapters {
  const ns = namespaceForNode(nodeKey)
  return {
    history: {
      list: async (options?: { limit?: number }) => {
        const body = await fetchHistory(ns, `&limit=${String(options?.limit ?? 20)}`)
        return { versions: body.snapshots.map((snapshot) => toVersion(deps, ns, snapshot)) }
      },
      inspect: async (revision: string) => {
        const body = await fetchHistory(ns, `&revision=${encodeURIComponent(revision)}`)
        const snapshot = body.snapshot
        if (snapshot === undefined) throw new Error(`历史里没有 ${ns}@${revision} 这一份`)
        const detail: NodeConfigVersionDetail = {
          ...toVersion(deps, ns, snapshot),
          before: undefined,
          after: JSON.parse(snapshot.value) as unknown,
          patch: snapshot.patch,
        }
        return detail
      },
      restore: async (revision: string) => {
        const response = await fetch(`${SETTINGS_HISTORY_PATH}?ns=${encodeURIComponent(ns)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ns, revision }),
        })
        const body = await response.json().catch(() => null) as { restored?: boolean; detail?: string; revision?: string } | null
        if (!response.ok || body === null) throw new Error(`恢复失败：${body?.detail ?? `HTTP ${response.status}`}`)
        if (body.restored !== true) throw new Error(body.detail ?? "恢复没有执行")
        await deps.onReload()
        return { config: undefined, path: "" }
      },
    },
    transfer: {
      export: async (format: "json" | "toml"): Promise<NodeConfigExport> => {
        if (format === "toml") {
          throw new Error("DSH 标准面的设置文档是 JSON，没有 TOML 这一种形态；用 JSON 导出")
        }
        const current = await deps.read(ns)
        return {
          content: JSON.stringify(current.value ?? {}, null, 2),
          filename: `${ns}.settings.json`,
          mimeType: "application/json",
        }
      },
      import: async (content: string, format?: "auto" | "json" | "toml") => {
        if (format === "toml") throw new Error("TOML 导入在 DSH 标准面没有对应物；贴 JSON")
        let parsed: unknown
        try {
          parsed = JSON.parse(content) as unknown
        } catch {
          throw new Error("贴进来的不是合法 JSON（DSH 的设置文档是 JSON；TOML 导入没有对应物）")
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("设置文档是一份 JSON 对象；贴进来的内容不是对象")
        }
        await deps.write(ns, parsed as Record<string, unknown>)
        return { config: parsed, path: "" }
      },
    },
    backup: {
      status: async (): Promise<NodeConfigHistoryRepositoryStatus> => {
        throw new Error("备份已并入设置历史：每次保存即快照，不再有独立的备份仓（远端同步是配置文件时代的机器，DSH 标准面没有对应物）")
      },
      create: async () => {
        throw new Error("备份已并入设置历史：每次保存即快照；打开「历史」页即可查看与恢复")
      },
      setRemote: async () => {
        throw new Error("远端备份仓是配置文件时代的机器（git 同步一份 toml）；设置活在 DSH 宿主里，这一格没有对应物（提案账上）")
      },
      sync: async () => {
        throw new Error("远端备份仓是配置文件时代的机器（git 同步一份 toml）；设置活在 DSH 宿主里，这一格没有对应物（提案账上）")
      },
    },
  } satisfies NodeConfigCenterAdapters
}
