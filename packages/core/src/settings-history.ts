/**
 * 节点设置历史的耐久层：每次设置写留一份滚动快照，恢复/导出都从它走。
 *
 * 为什么这件事归 Xaihi：DSH 的设置面只有 describe/update/mutate（`host-routes.ts` 的
 * `SettingsServiceLike`），没有版本历史，也没有变更订阅（前置实测 2026-10-07）。
 * 上游那套"配置住在一个 toml 里、后端记增量历史"的机器整块不接（ADR-0013）。
 * 这里的立场是**派生记录，不是第二套权威**：权威值永远只有 settings 那一份，
 * 快照只是"某次写成功那一刻的脱敏读数"。
 *
 * 采集点有两条，覆盖两路写：
 * - **写点即采**（`captureAfterWrite`）：凡经 `fenceSettings` 成功的 update/mutate
 *   （`/xaihi/host` 那条桥路由）就采一份 —— 桥上的写全部过这一道闸；
 * - **读时对账**（`reconcile`）：列历史前先看当前 revision 是否比最新快照新，
 *   新就补采一份。这把"DSH 自己的设置页改的"也收进来（best-effort：
 *   两次查看之间的中间版本追不回来，这是没有订阅的代价，写在列表的 `reason` 里）。
 *
 * 脱敏纪律（ADR-0013 的坑）：快照存 `redactSecrets: true` 的读数；采集时同时取一份
 * 不脱敏的读数，两者的差 = 密钥叶路径（`secretPaths`）。恢复只走 `mutate` 的 path op
 * 且**含密钥的顶层字段整段跳过** —— 把脱敏标记写回真值等于销毁密钥，宁可少恢复。
 * 服务半边的存储无脱敏问题：快照本身就只存脱敏值，密钥真值从头到尾不落这份账。
 *
 * 存储不自己造：DSH 的 storage domain（与 `history.ts` 的运行账本同一台）；
 * 拿不到时退内存并说出原因，`durable` 是事实不是假设。
 *
 * @module xaihi-core/settings-history
 */

import { domainTable, defineDomain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SettingsServiceLike } from './host-routes.ts'
import { STATE_SETTINGS_NS } from '@hibernalglow/xaihi-sdk/bridge'

/** 域记录形状的版本，写进 domain spec 的 `version`。 */
export const SETTINGS_HISTORY_DOMAIN_VERSION = 1

/** 每个命名空间最多留多少份快照；超出的旧份被淘汰（淘汰不静默，列表元数据里读得回）。 */
export const SETTINGS_HISTORY_CAP = 50

const snapshotSchema = z.object({
  /** 设置命名空间（loader 行 id，如 `xaihi-sleept`）。 */
  ns: z.string(),
  /** 采集那一刻的设置 revision（十进制文本；DSH 的 revision 是数字，契约要 string）。 */
  revision: z.string(),
  /** 采集时刻（epoch ms）。 */
  at: z.number(),
  /** 来源：`write` = 桥上的写点即采；`reconcile` = 列表前对账补采。 */
  source: z.enum(['write', 'reconcile']),
  /** 人读得懂的一句话（面板的 message 列）。 */
  message: z.string(),
  /** 这份相对上一份变了的顶层字段名（首份是全部顶层字段）。 */
  fields: z.array(z.string()),
  /** 面板要的行间差异文本（对着上一份快照算；首份为空串）。 */
  patch: z.string(),
  /** 脱敏后的整格值（pretty JSON 文本）。 */
  value: z.string(),
  /** 密钥叶路径（`deepDiffPaths` 对两份读数算出来的差），JSON 文本。 */
  secretPaths: z.string(),
})

export type SettingsSnapshot = z.infer<typeof snapshotSchema>

/** 与 `history.ts` 同一台 storage domain 的缝，这里只声明我们用到的一面。 */
export interface SettingsHistoryDomainLike {
  open(spec: typeof settingsHistoryDomain): Promise<{
    table(name: 'snapshots'): {
      get(key: string): SettingsSnapshot | undefined
      entries(): IterableIterator<[string, SettingsSnapshot]>
      put(key: string, value: SettingsSnapshot): Promise<void>
      delete(key: string): Promise<boolean>
    }
    close(): Promise<void>
  }>
}

/** 一份设置历史仓；`durable=false` 意味着它只活在本次进程里。 */
export interface SettingsHistoryStore {
  durable: boolean
  reason: string | null
  put(snapshot: SettingsSnapshot): Promise<void>
  /** 某命名空间的全部快照，新→旧。 */
  list(ns: string): Promise<SettingsSnapshot[]>
  get(ns: string, revision: string): Promise<SettingsSnapshot | undefined>
  close(): Promise<void>
}

/** Xaihi 的存储域声明；单位名同时就是后端文件名。 */
export const settingsHistoryDomain = defineDomain({
  name: 'xaihi_settings_history',
  version: SETTINGS_HISTORY_DOMAIN_VERSION,
  tables: {
    snapshots: domainTable<string, SettingsSnapshot>(snapshotSchema),
  },
})

const keyOf = (ns: string, revision: string): string => `${ns}@${revision}`

function memoryStore(reason: string): SettingsHistoryStore {
  const records = new Map<string, SettingsSnapshot>()
  return {
    durable: false,
    reason,
    async put(snapshot) {
      records.set(keyOf(snapshot.ns, snapshot.revision), snapshot)
      const mine = [...records.values()].filter((row) => row.ns === snapshot.ns).sort(byNewest)
      for (const stale of mine.slice(SETTINGS_HISTORY_CAP)) records.delete(keyOf(stale.ns, stale.revision))
    },
    async list(ns) {
      return [...records.values()].filter((row) => row.ns === ns).sort(byNewest)
    },
    async get(ns, revision) {
      return records.get(keyOf(ns, revision))
    },
    async close() {
      records.clear()
    },
  }
}

const byNewest = (left: SettingsSnapshot, right: SettingsSnapshot): number =>
  right.at - left.at || Number(right.revision) - Number(left.revision)

/** 打开快照仓。`facility === undefined` 表示这台宿主没有 storage domain 这条缝。 */
export async function openSettingsHistoryStore(
  facility: SettingsHistoryDomainLike | undefined,
  warn: (message: string) => void = (message) => console.warn(message),
): Promise<SettingsHistoryStore> {
  if (facility === undefined) return memoryStore('storageDomain service is absent; settings history is in-memory only')
  try {
    const domain = await facility.open(settingsHistoryDomain)
    const table = domain.table('snapshots')
    return {
      durable: true,
      reason: null,
      async put(snapshot) {
        await table.put(keyOf(snapshot.ns, snapshot.revision), snapshot)
        const mine = [...table.entries()].map(([, row]) => row).filter((row) => row.ns === snapshot.ns).sort(byNewest)
        for (const stale of mine.slice(SETTINGS_HISTORY_CAP)) await table.delete(keyOf(stale.ns, stale.revision))
      },
      async list(ns) {
        return [...table.entries()].map(([, row]) => row).filter((row) => row.ns === ns).sort(byNewest)
      },
      async get(ns, revision) {
        return table.get(keyOf(ns, revision))
      },
      async close() {
        await domain.close()
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    warn(`xaihi-core: settings history fell back to memory (${message})`)
    return memoryStore(`storageDomain.open failed: ${message}`)
  }
}

/** 从 `describe` 的行里挑出某命名空间那一行；行形状只取我们用到的三格。 */
function readRow(service: SettingsServiceLike, ns: string): { revision: number; value: unknown } | null {
  const rows = service.describe({ redactSecrets: true }) as ReadonlyArray<{ ns?: unknown; revision?: unknown; value?: unknown }>
  const row = rows.find((entry) => String((entry as { ns?: unknown }).ns ?? '') === ns)
  if (row === undefined) return null
  return {
    revision: typeof row.revision === 'number' ? row.revision : Number.NaN,
    value: row.value,
  }
}

/**
 * 把 pretty JSON 文本按行做一份带 `+`/`-` 前缀的行差异（旧在前）。
 * 不是 unified diff：面板的 DiffView 只吃文本；这份的目标是"人一眼看得出哪几行变了"。
 * 超过 `maxLines` 就截断并标注，别让一份大配置把消息体撑爆。
 */
export function lineDiff(before: string, after: string, maxLines = 400): string {
  const a = before.split('\n')
  const b = after.split('\n')
  // LCS 太贵就退成"整段替换"：400 行以内的配置不值得一次 O(n·m) 的较真。
  if (a.length * b.length > 160_000) {
    return [`- ${a.length} 行（整段替换，差异过大不逐行展开）`, `+ ${b.length} 行`].join('\n')
  }
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      // 下标都在界内（i+1 ≤ a.length，j+1 ≤ b.length），断言掉 noUncheckedIndexedAccess 的怀疑。
      const row = lcs[i]!
      const nextRow = lcs[i + 1]!
      row[j] = a[i] === b[j] ? nextRow[j + 1]! + 1 : Math.max(nextRow[j]!, row[j + 1]!)
    }
  }
  const lines: string[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { lines.push(`  ${a[i]}`); i++; j++ }
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) { lines.push(`- ${a[i]}`); i++ }
    else { lines.push(`+ ${b[j]}`); j++ }
  }
  while (i < a.length) { lines.push(`- ${a[i]}`); i++ }
  while (j < b.length) { lines.push(`+ ${b[j]}`); j++ }
  const kept = lines.slice(0, maxLines)
  if (lines.length > maxLines) kept.push(`… 其余 ${lines.length - maxLines} 行省略`)
  return kept.join('\n')
}

/**
 * 两份读数的差路径：`redacted` 上哪些叶子与 `plain` 不同 = 密钥叶。
 * 数组当原子：数组里任何一个元素不同，整个数组路径都算密钥路径（保守，宁可多跳）。
 */
export function deepDiffPaths(plain: unknown, redacted: unknown, prefix: readonly (string | number)[] = []): (string | number)[][] {
  if (plain === redacted) return []
  if (plain === null || redacted === null || typeof plain !== 'object' || typeof redacted !== 'object') {
    return prefix.length === 0 ? [] : [ [...prefix] ]
  }
  if (Array.isArray(plain) !== Array.isArray(redacted)) return [ [...prefix] ]
  if (Array.isArray(plain)) {
    const right = redacted as unknown[]
    return plain.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(right[index])) && prefix.length > 0
      ? [ [...prefix] ]
      : []
  }
  const left = plain as Record<string, unknown>
  const right = redacted as Record<string, unknown>
  const paths: (string | number)[][] = []
  for (const key of Object.keys(right)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    paths.push(...deepDiffPaths(left[key], right[key], [...prefix, key]))
  }
  return paths
}

/** 顶层字段名表（快照的 `fields`）。 */
function topFields(value: unknown): string[] {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : []
}

export interface SettingsHistoryCaptureDeps {
  settings: SettingsServiceLike
  store: SettingsHistoryStore
}

/**
 * 采一份快照（脱敏读数 + 密钥路径）。
 * @returns 落进仓的那份；命名空间不存在时是 `null`（不当作错误：写可能只是别人格里的）。
 */
export async function captureSettingsSnapshot(
  deps: SettingsHistoryCaptureDeps,
  ns: string,
  source: 'write' | 'reconcile',
  message: string,
): Promise<SettingsSnapshot | null> {
  const redactedRow = readRow(deps.settings, ns)
  if (redactedRow === null || Number.isNaN(redactedRow.revision)) return null
  const plainRows = deps.settings.describe({ redactSecrets: false }) as ReadonlyArray<{ ns?: unknown; value?: unknown }>
  const plainRow = plainRows.find((entry) => String((entry as { ns?: unknown }).ns ?? '') === ns)
  const valueText = JSON.stringify(redactedRow.value, null, 2)
  const secretPaths = deepDiffPaths(plainRow?.value, redactedRow.value)
  const previous = (await deps.store.list(ns))[0]
  const snapshot: SettingsSnapshot = {
    ns,
    revision: String(redactedRow.revision),
    at: Date.now(),
    source,
    message,
    fields: previous === undefined ? topFields(redactedRow.value) : changedTopFields(previous.value, valueText),
    patch: previous === undefined ? '' : lineDiff(previous.value, valueText),
    value: valueText,
    secretPaths: JSON.stringify(secretPaths),
  }
  await deps.store.put(snapshot)
  return snapshot
}

/** 上一份的值文本里哪些顶层字段在这份里变了（解析失败就整个列出来，不猜）。 */
function changedTopFields(previousValueText: string, currentText: string): string[] {
  try {
    const before = JSON.parse(previousValueText) as Record<string, unknown>
    const after = JSON.parse(currentText) as Record<string, unknown>
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
  } catch {
    return Object.keys(JSON.parse(currentText) as Record<string, unknown>)
  }
}

/**
 * 列表前的对账：当前 revision 比最新快照新就补采一份。
 * @returns 这份仓的元信息（列表响应的 `durable`/`reason` 就从这里来）。
 */
export async function reconcileSettingsHistory(deps: SettingsHistoryCaptureDeps, ns: string): Promise<{ durable: boolean; reason: string | null }> {
  const row = readRow(deps.settings, ns)
  if (row !== null && !Number.isNaN(row.revision)) {
    const latest = (await deps.store.list(ns))[0]
    if (latest === undefined || latest.revision !== String(row.revision)) {
      await captureSettingsSnapshot(deps, ns, 'reconcile', '查看历史时对账补采（期间的中间版本没有订阅可追）')
    }
  }
  return { durable: deps.store.durable, reason: deps.store.reason }
}

/** 恢复一条快照。返回值是人读得回的结果，不抛"业务失败"（参数/闸错误照常抛）。 */
export async function restoreSettingsSnapshot(
  deps: SettingsHistoryCaptureDeps,
  ns: string,
  revision: string,
): Promise<{ restored: boolean; detail: string; revision?: string }> {
  const snapshot = await deps.store.get(ns, revision)
  if (snapshot === undefined) return { restored: false, detail: `历史里没有 ${ns}@${revision} 这一份（可能已被滚动淘汰）` }
  const current = readRow(deps.settings, ns)
  if (current === null) return { restored: false, detail: `设置里已经没有 "${ns}" 这一格，无从恢复` }
  const secretPaths: (string | number)[][] = JSON.parse(snapshot.secretPaths) as (string | number)[][]
  const secretTopFields = new Set(secretPaths.map((path) => String(path[0])))
  const value = JSON.parse(snapshot.value) as Record<string, unknown>
  const skipped = Object.keys(value).filter((key) => secretTopFields.has(key))
  const ops = Object.entries(value)
    .filter(([key]) => !secretTopFields.has(key))
    .map(([key, fieldValue]) => ({ op: 'set' as const, path: [key], value: fieldValue }))
  if (ops.length === 0) {
    return { restored: false, detail: '这一份里只有密钥字段，恢复它们会把脱敏标记写回真值——拒了（密钥请走设置文档的密钥面重配）' }
  }
  if (deps.settings.mutate === undefined) {
    return { restored: false, detail: '宿主的服务面没有 mutate（path op）这一条；整格 update 会把没返回过的密钥覆盖掉，所以不提供这条路' }
  }
  const ack = await deps.settings.mutate(ns, ops, current.revision)
  const nextRevision = (ack as { revision?: unknown } | undefined)?.revision
  await captureSettingsSnapshot(deps, ns, 'write', `从 @${revision} 恢复${skipped.length > 0 ? `（跳过密钥字段：${skipped.join('、')}）` : ''}`)
  return {
    restored: true,
    detail: skipped.length > 0 ? `已恢复（跳过密钥字段：${skipped.join('、')}，请走密钥面重配）` : '已恢复',
    ...(typeof nextRevision === 'number' ? { revision: String(nextRevision) } : {}),
  }
}

/** 恢复请求体。 */
interface RestoreBody { ns?: unknown; revision?: unknown }

/**
 * 给宿主设置面套一层"写点即采"：成功的 update/mutate 之后补一份快照。
 *
 * `xaihi-core` 整格跳过：它的全部字段在我们自己的 Config 里都声明成 volatile
 * （工作台三段落 + 界面偏好），每存一次都进历史只会把"开关了一下界面"记成配置变更。
 * 节点命名空间里若也有人声明 volatile 字段，同样会推 revision——v1 接受这个噪声，
 * 列表的 `source`/`message` 让人分得清哪份是对账、哪份是保存。
 *
 * 采集失败**不**改变写的结果：写已成功，快照只是账，账错了也不许把失败甩回给保存动作。
 */
export function withHistoryCapture(
  settings: () => SettingsServiceLike | undefined,
  store: () => Promise<SettingsHistoryStore>,
): SettingsServiceLike {
  const captureAfter = (ns: string, message: string): void => {
    if (ns === STATE_SETTINGS_NS) return
    void (async () => {
      const service = settings()
      if (service === undefined) return
      await captureSettingsSnapshot({ settings: service, store: await store() }, ns, 'write', message)
    })().catch((error: unknown) => {
      console.warn(`xaihi-core: settings history capture failed for ${ns}: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
  return {
    describe: (options) => settings()?.describe(options) ?? [],
    async update(ns, values, expectedRevision) {
      const service = settings()
      if (service === undefined) throw Object.assign(new Error('宿主的服务端设置面没挂载'), { reason: 'no-provider' })
      const result = await service.update(ns, values, expectedRevision)
      captureAfter(ns, '设置保存')
      return result
    },
    async mutate(ns, ops, expectedRevision) {
      const service = settings()
      if (service === undefined) throw Object.assign(new Error('宿主的服务端设置面没挂载'), { reason: 'no-provider' })
      if (service.mutate === undefined) throw Object.assign(new Error('宿主的服务面没有 mutate 这一条'), { reason: 'no-provider' })
      const result = await service.mutate(ns, ops, expectedRevision)
      captureAfter(ns, '设置保存（path op）')
      return result
    },
  }
}

/**
 * `/xaihi/settings-history.json`：列表 / 单份 / 恢复，一条路由。
 *
 * 与 `/xaihi/history.json` 同一档威胁模型：本机进程可直达，兜住的是命名空间闸
 * （不在 allowed 里的 ns 一律 400）与"只存脱敏值"这条数据纪律。
 */
export function settingsHistoryHandler(deps: {
  settings: () => SettingsServiceLike | undefined
  allowed: () => ReadonlySet<string>
  store: () => Promise<SettingsHistoryStore>
}) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const ns = url.searchParams.get('ns') ?? ''
    if (!deps.allowed().has(ns)) {
      sendJson(res, 400, { error: 'namespace-not-allowed', detail: `设置命名空间 ${JSON.stringify(ns)} 不在允许的那一批里` })
      return
    }
    const service = deps.settings()
    if (service === undefined) {
      sendJson(res, 503, { error: 'no-settings', detail: '宿主的服务端设置面没挂载，历史无从谈起' })
      return
    }
    const captureDeps: SettingsHistoryCaptureDeps = { settings: service, store: await deps.store() }
    if (req.method === 'GET') {
      const revision = url.searchParams.get('revision')
      if (revision !== null) {
        const snapshot = await captureDeps.store.get(ns, revision)
        if (snapshot === undefined) {
          sendJson(res, 404, { error: 'snapshot-missing', detail: `历史里没有 ${ns}@${revision} 这一份` })
          return
        }
        sendJson(res, 200, { snapshot })
        return
      }
      const limit = Math.min(Number(url.searchParams.get('limit') ?? '20') || 20, SETTINGS_HISTORY_CAP)
      const meta = await reconcileSettingsHistory(captureDeps, ns)
      const snapshots = await captureDeps.store.list(ns)
      sendJson(res, 200, { ...meta, total: snapshots.length, snapshots: snapshots.slice(0, limit) })
      return
    }
    if (req.method === 'POST') {
      const text = await readWholeBody(req)
      let body: RestoreBody
      try {
        body = JSON.parse(text ?? '') as RestoreBody
      } catch {
        sendJson(res, 400, { error: 'bad-json', detail: '请求体不是 JSON' })
        return
      }
      if (typeof body.ns !== 'string' || body.ns !== ns || typeof body.revision !== 'string') {
        sendJson(res, 400, { error: 'bad-args', detail: '恢复收 (ns, revision)，且 ns 要与查询参数一致' })
        return
      }
      const result = await restoreSettingsSnapshot(captureDeps, ns, body.revision)
      sendJson(res, 200, result)
      return
    }
    sendJson(res, 405, { error: 'method-not-allowed', detail: '这条路由只收 GET 与 POST', allow: 'GET, POST' })
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
  res.end(JSON.stringify(body))
}

function readWholeBody(req: IncomingMessage, limit = 262_144): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) { resolve(null); req.removeAllListeners('data'); req.resume(); return }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', () => resolve(null))
  })
}
