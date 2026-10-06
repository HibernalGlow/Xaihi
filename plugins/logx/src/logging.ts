/**
 * logx 内核要用的那几颗结构化日志原语（**vendored**，不是新设计）。
 *
 * 为什么是复制不是引用：这些函数在 Xiranite 里住在 `@xiranite/logging`
 * （noxide worktree `packages/logging/src/{schema,query}.ts`），而本包的
 * `package.json` 不许写 `@xiranite/*`——那条依赖一进依赖表，全仓 pnpm 就解不出树
 * （`pnpm-workspace.yaml` 顶部注释、`docs/stages/step-4-terminal-port.md` 二·1）；
 * 而本仓那份 `packages/logging` 就是同一批文件、同样不入 workspace，装进 profile 的
 * bundle 也不许引用仓内包（ADR-0002）。所以按 `plugins/<id>/src/cli-support.ts` 的
 * 同一个办法：只复刻本包用得到的那几颗，出处逐条写在行上。
 *
 * 出处（tag `noxide`，只读 worktree `<Freya>/.scratch/xiranite-noxide`）：
 * - `LOG_SEVERITY_NUMBERS` ⇒ `packages/logging/src/schema.ts:5-12`（原样，6 档数值）
 * - `LogSeverityText` / `LogJsonValue` / `LogResource` / `LogScope` / `LogSession` /
 *   `LogError` / `LogTrace` / `LogEnvelope` ⇒ 同文件 14-85 行的 zod schema；
 *   这里写的是它们的 `z.infer` 等价形状（字段名、可选性、`processType` 那六个枚举值照抄）
 * - `LogQuery` / `LogAggregate` / `queryLogs` / `aggregateLogs` / `errorFingerprint` /
 *   `searchableText` / `increment` / `deepEqual` ⇒ `packages/logging/src/query.ts`
 *   整份逐字节搬来（含排序与 `reverse()` 那两处易被"顺手重写"的细节）
 *
 * **一处有意偏离**（也是本文件唯一的偏离）：上游用 zod 做 `LogEnvelopeSchema.safeParse`
 * （`schema.ts:63-78`，`.strict()` ⇒ 未知键也判非法）。本包不引 zod（多 6 MB 运行时依赖，
 * 而读取这半边只需要"能不能信这一行"），所以下面的 `isLogEnvelope` 只做**必填字段与类型**
 * 的结构校验，比上游宽：未知键不拒、`severityNumber` 的 1..24 范围不查。
 * 差额是缺口，不是实现细节 ⇒ 记进 `docs/service-mapping.md`（见本包 `src/fs.ts` 顶部）。
 *
 * @module xaihi-logx/logging
 */

/** 严重度到数值，OTel 风格的分档（上游 `schema.ts:5-12` 原样）。 */
export const LOG_SEVERITY_NUMBERS = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
} as const

export type LogSeverityText = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export type LogJsonValue = null | boolean | number | string | LogJsonValue[] | { [key: string]: LogJsonValue }

export type LogResource = {
  serviceName: string
  serviceVersion?: string
  deploymentEnvironment?: string
  processType: 'frontend' | 'backend' | 'desktop' | 'cli' | 'test' | 'unknown'
  processId?: number
  runtimeName?: string
  runtimeVersion?: string
  hostRuntime?: string
  hostName?: string
}

export type LogScope = {
  name: string
  version?: string
}

export type LogSession = {
  id: string
  startedAt: string
}

export type LogError = {
  name: string
  message: string
  stack?: string
  cause?: LogJsonValue
}

export type LogTrace = {
  traceId: string
  spanId?: string
  parentSpanId?: string
}

export type LogEnvelope = {
  schemaVersion: 1
  id: string
  timestamp: string
  observedTimestamp: string
  severityText: LogSeverityText
  severityNumber: number
  eventName: string
  body?: string
  attributes: Record<string, LogJsonValue>
  resource: LogResource
  scope: LogScope
  session: LogSession
  trace?: LogTrace
  error?: LogError
}

export interface LogQuery {
  minimumSeverity?: LogSeverityText
  maximumSeverity?: LogSeverityText
  scopes?: readonly string[]
  eventNames?: readonly string[]
  sessionIds?: readonly string[]
  processTypes?: readonly LogEnvelope['resource']['processType'][]
  since?: string
  until?: string
  search?: string
  attributes?: Readonly<Record<string, LogJsonValue>>
  order?: 'asc' | 'desc'
  limit?: number
}

export interface LogAggregate {
  total: number
  bySeverity: Record<string, number>
  byScope: Record<string, number>
  byEvent: Record<string, number>
  bySession: Record<string, number>
  errors: Array<{ fingerprint: string; count: number; sample: LogEnvelope }>
}

export function queryLogs(events: readonly LogEnvelope[], query: LogQuery = {}): LogEnvelope[] {
  const search = query.search?.toLocaleLowerCase()
  const filtered = events.filter((event) => {
    if (query.minimumSeverity && event.severityNumber < LOG_SEVERITY_NUMBERS[query.minimumSeverity]) return false
    if (query.maximumSeverity && event.severityNumber > LOG_SEVERITY_NUMBERS[query.maximumSeverity]) return false
    if (query.scopes?.length && !query.scopes.some((scope) => event.scope.name === scope || event.scope.name.startsWith(`${scope}.`))) return false
    if (query.eventNames?.length && !query.eventNames.includes(event.eventName)) return false
    if (query.sessionIds?.length && !query.sessionIds.includes(event.session.id)) return false
    if (query.processTypes?.length && !query.processTypes.includes(event.resource.processType)) return false
    if (query.since && event.timestamp < query.since) return false
    if (query.until && event.timestamp > query.until) return false
    if (search && !searchableText(event).includes(search)) return false
    if (query.attributes && !Object.entries(query.attributes).every(([key, value]) => deepEqual(event.attributes[key], value))) return false
    return true
  })
  filtered.sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id))
  if (query.order === 'desc') filtered.reverse()
  return query.limit === undefined ? filtered : filtered.slice(0, Math.max(0, query.limit))
}

export function aggregateLogs(events: readonly LogEnvelope[]): LogAggregate {
  const bySeverity: Record<string, number> = {}
  const byScope: Record<string, number> = {}
  const byEvent: Record<string, number> = {}
  const bySession: Record<string, number> = {}
  const errors = new Map<string, { count: number; sample: LogEnvelope }>()
  for (const event of events) {
    increment(bySeverity, event.severityText)
    increment(byScope, event.scope.name)
    increment(byEvent, event.eventName)
    increment(bySession, event.session.id)
    if (event.error) {
      const fingerprint = errorFingerprint(event)
      const current = errors.get(fingerprint)
      if (current) current.count += 1
      else errors.set(fingerprint, { count: 1, sample: event })
    }
  }
  return {
    total: events.length,
    bySeverity,
    byScope,
    byEvent,
    bySession,
    errors: [...errors.entries()].map(([fingerprint, value]) => ({ fingerprint, ...value })).sort((a, b) => b.count - a.count),
  }
}

export function errorFingerprint(event: LogEnvelope): string {
  if (!event.error) return ''
  const topFrame = event.error.stack?.split('\n')[1]?.trim().replace(/:\d+:\d+/g, ':#: #') ?? ''
  return `${event.error.name}|${event.error.message.replace(/\d+/g, '#')}|${topFrame}`
}

function searchableText(event: LogEnvelope): string {
  return `${event.eventName}\n${event.body ?? ''}\n${event.scope.name}\n${event.error?.message ?? ''}\n${JSON.stringify(event.attributes)}`.toLocaleLowerCase()
}

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1
}

function deepEqual(left: LogJsonValue | undefined, right: LogJsonValue): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

/**
 * 上游 `jsonl.ts:19-32` 的 `parseLogLine` 在这里的无 zod 版：
 * 一行 JSONL → 事件或一条问题（`code` 两个取值照抄 `jsonl.ts:5`）。
 * 校验强度见文件头那条偏离说明。
 */
export interface LogParseIssue {
  lineNumber: number
  code: 'invalid-json' | 'invalid-envelope'
  message: string
}

export function parseLogLine(raw: string, lineNumber = 1): { event?: LogEnvelope; issue?: LogParseIssue } {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    return { issue: { lineNumber, code: 'invalid-json', message: error instanceof Error ? error.message : String(error) } }
  }
  const problems = envelopeProblems(value)
  if (problems.length > 0) return { issue: { lineNumber, code: 'invalid-envelope', message: problems.join('; ') } }
  return { event: value as LogEnvelope }
}

export function parseLogJsonl(text: string): { events: LogEnvelope[]; issues: LogParseIssue[] } {
  const events: LogEnvelope[] = []
  const issues: LogParseIssue[] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]!
    if (!raw.trim()) continue
    const parsed = parseLogLine(raw, index + 1)
    if (parsed.event) events.push(parsed.event)
    if (parsed.issue) issues.push(parsed.issue)
  }
  return { events, issues }
}

/** `LogEnvelopeSchema`（`schema.ts:63-78`）的必填项与类型；缺哪一项就说哪一项。 */
function envelopeProblems(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ['envelope must be an object']
  const event = value as Record<string, unknown>
  const problems: string[] = []
  const text = (key: string): void => {
    if (typeof event[key] !== 'string' || event[key] === '') problems.push(`${key} must be a non-empty string`)
  }
  if (event.schemaVersion !== 1) problems.push('schemaVersion must be 1')
  for (const key of ['id', 'timestamp', 'observedTimestamp', 'eventName']) text(key)
  if (typeof event.severityText !== 'string' || !(event.severityText in LOG_SEVERITY_NUMBERS)) {
    problems.push(`severityText must be one of ${Object.keys(LOG_SEVERITY_NUMBERS).join(', ')}`)
  }
  if (typeof event.severityNumber !== 'number') problems.push('severityNumber must be a number')
  if (event.attributes !== undefined && typeof event.attributes !== 'object') problems.push('attributes must be an object')
  for (const key of ['resource', 'scope', 'session']) {
    if (typeof event[key] !== 'object' || event[key] === null) problems.push(`${key} must be an object`)
  }
  const resource = event.resource as LogResource | undefined
  if (resource !== undefined && typeof resource === 'object') {
    if (typeof resource.serviceName !== 'string' || resource.serviceName === '') problems.push('resource.serviceName must be a non-empty string')
    if (!['frontend', 'backend', 'desktop', 'cli', 'test', 'unknown'].includes(String(resource.processType))) {
      problems.push('resource.processType is not a known process type')
    }
  }
  const scope = event.scope as LogScope | undefined
  if (scope !== undefined && typeof scope === 'object' && (typeof scope.name !== 'string' || scope.name === '')) {
    problems.push('scope.name must be a non-empty string')
  }
  const session = event.session as LogSession | undefined
  if (session !== undefined && typeof session === 'object') {
    if (typeof session.id !== 'string' || session.id === '') problems.push('session.id must be a non-empty string')
    if (typeof session.startedAt !== 'string' || session.startedAt === '') problems.push('session.startedAt must be a non-empty string')
  }
  if (event.error !== undefined) {
    const error = event.error as LogError
    if (typeof error.name !== 'string' || error.name === '') problems.push('error.name must be a non-empty string')
    if (typeof error.message !== 'string') problems.push('error.message must be a string')
  }
  return problems
}
