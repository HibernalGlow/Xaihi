/**
 * 运行账目的耐久层：每次结算（成功或失败）留一条运行记录。
 *
 * 为什么这件事归 Xaihi：DSH 的事件日志是**会话**的模型（`ctx.sessionPersistence` 只收
 * `SessionEvent`，文档明说"no parallel persisted event type"），而"某个节点跑过什么、
 * 这次效果能不能回滚"是域账本。存储本身**不自己造**：用 DSH 的 storage domain
 * （`ctx.storageDomain.open(defineDomain(...))`），它是装配里现成的服务
 * （实测 surface：`closeAll,config,ctx,domains,get,open,reserved`）。
 *
 * 拿不到 storage domain 时退化成内存账本，并且把原因说出来——`durable` 是记录在响应里的
 * 事实，不是假设。
 *
 * @module xaihi-core/history
 */

import { domainTable, defineDomain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { HISTORY_SCHEMA, type HistorySnapshot, type RunRecord } from '@hibernalglow/xaihi-sdk'

/** 域记录形状的版本，写进 domain spec 的 `version`。 */
export const HISTORY_DOMAIN_VERSION = 1

const runRecordSchema = z.object({
  runId: z.string(),
  nodeId: z.string(),
  actionId: z.string(),
  startedAt: z.number(),
  finishedAt: z.number(),
  outcome: z.enum(['finished', 'failed']),
  message: z.string(),
  events: z.number(),
  checkpoint: z.string(),
})

/** Xaihi 的存储域声明；单位名同时就是后端文件名。 */
export const historyDomain = defineDomain({
  // 名字必须是 `^[a-z][a-z0-9_]*$`：连字符会被 defineDomain 当场拒绝（这条约束文档里没写，
  // 是在 import 时抛出来的）。
  name: 'xaihi_runs',
  version: HISTORY_DOMAIN_VERSION,
  tables: {
    runs: domainTable<string, RunRecord>(runRecordSchema),
  },
})

/** `Domain.table('runs')` 用到的那一小片面。 */
interface RunTable {
  get(key: string): RunRecord | undefined
  entries(): IterableIterator<[string, RunRecord]>
  put(key: string, value: RunRecord): Promise<void>
}

/** `storageDomain.open(spec)` 返回的域句柄用到的一面。 */
interface OpenedDomain {
  table(name: 'runs'): RunTable
  close(): Promise<void>
}

/** 宿主提供的 storage domain 缝（只声明我们用到的部分）。 */
export interface DomainFacilityLike {
  open(spec: typeof historyDomain): Promise<OpenedDomain>
}

/** 一份运行账目；`durable=false` 意味着它只活在本次进程里。 */
export interface RunLedger {
  durable: boolean
  /** 退化成内存时给出的原因；`durable` 为 true 时是 null。 */
  reason: string | null
  append(record: RunRecord): Promise<void>
  /** 新→旧。 */
  list(limit?: number): Promise<RunRecord[]>
  close(): Promise<void>
}

const byNewest = (left: RunRecord, right: RunRecord): number =>
  right.finishedAt - left.finishedAt || right.runId.localeCompare(left.runId)

/** 内存账本：上限之外的旧记录被淘汰，但不静默——`reason` 说得出为什么不够用。 */
function memoryLedger(reason: string, max = 200): RunLedger {
  const records = new Map<string, RunRecord>()
  return {
    durable: false,
    reason,
    async append(record) {
      records.set(record.runId, record)
      if (records.size > max) {
        const oldest = [...records.values()].sort(byNewest).at(-1)
        if (oldest !== undefined) records.delete(oldest.runId)
      }
    },
    async list(limit) {
      const sorted = [...records.values()].sort(byNewest)
      return limit === undefined ? sorted : sorted.slice(0, limit)
    },
    async close() {
      records.clear()
    },
  }
}

/**
 * 打开账本。
 * @param facility - `ctx.get('storageDomain')`；undefined 表示这台宿主没有这条缝。
 * @param warn - 诊断出口，测试用。
 */
export async function openLedger(
  facility: DomainFacilityLike | undefined,
  warn: (message: string) => void = (message) => console.warn(message),
): Promise<RunLedger> {
  if (facility === undefined) return memoryLedger('storageDomain service is absent; run history is in-memory only')
  try {
    const domain = await facility.open(historyDomain)
    const table = domain.table('runs')
    return {
      durable: true,
      reason: null,
      async append(record) {
        await table.put(record.runId, record)
      },
      async list(limit) {
        const sorted = [...table.entries()].map(([, value]) => value).sort(byNewest)
        return limit === undefined ? sorted : sorted.slice(0, limit)
      },
      async close() {
        await domain.close()
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warn(`xaihi-core: run ledger fell back to memory (${message})`)
    return memoryLedger(`storageDomain.open failed: ${message}`)
  }
}

/**
 * `/xaihi/history.json`：exact 路由。
 *
 * 账本打开是异步的（`storageDomain.open` 返回 Promise），所以处理器每次现取；
 * 打不开就 500 并带原因，绝不能返回一个空清单假装"没有历史"。
 * @param ledger - 账本的延迟取得。
 * @param limit - 最多回多少条，新→旧。
 */
export function historyHandler(ledger: () => Promise<RunLedger>, limit = 50) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method !== 'GET') {
      res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', allow: 'GET' })
      res.end('method not allowed')
      return
    }
    try {
      const opened = await ledger()
      const snapshot: HistorySnapshot = {
        schema: HISTORY_SCHEMA,
        durable: opened.durable,
        reason: opened.reason,
        records: await opened.list(limit),
      }
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      })
      res.end(JSON.stringify(snapshot))
    } catch (error) {
      const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end(`run ledger unavailable: ${message}`)
    }
  }
}
