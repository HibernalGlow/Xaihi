/**
 * linku 的内核，从 `<Xiranite>` tag `noxide` 的 `packages/nodes/linku/src/core.ts`
 * （385 行）逐字搬来：动作分支、回滚次序、消息文案、大小写与斜杠归一规则全部原样，
 * **一处逻辑都没改**。
 *
 * 改动只有两处，都不带语义：
 * 1. 第 1 行那条 import：`@xiranite/contract` 的两个类型换成本包的 `./contract.ts` 垫片
 *    （理由见那个文件的头注释与 ADR-0002）。
 * 2. `parseLinkRecords` 里 `rawKey` 的类型收窄（`(rawKey ?? "").trim()`）：本仓的
 *    `noUncheckedIndexedAccess` 让解构结果在类型上可能是 undefined，而 `line.includes("=")`
 *    已经保证至少有那一段，最坏是空串——空串对不上任何键名，与上游一样被跳过。就地写着。
 *
 * 台账里这个节点的 hostRequirements 是 `recursive-enumeration+file-io`，而
 * **这份文件本身仍然零 I/O**：七类动作触达机器的动作全从 `LinkuRuntime` 那 7 个方法注入
 * （上游原本就这么设计），落地实现在 `src/platform.ts`。
 *
 * 语义随上游保持，接线方与 platform 都不许"顺手改进"（这些都是会被顺手改掉的地方）：
 * - 七个动作 `info / create / move_link / list / recover / import / restore` 各有一条前置校验，
 *   缺参时**由内核说那句话**（`core.ts:146` `Path is required.` 等），外面不许抢先做参数校验；
 * - `create` 先 `pathInfo(source)` 再 `pathInfo(target)`，**目标存在或是软链就拒绝**
 *   （`core.ts:171`），然后才 `createSymlink` + `recordLink`；
 * - `move_link` 的次序是"移动 → 在原位置建链 → 记账"，中间夹两次进度（40 / 75）；
 *   源与目标同路径且源是目录 ⇒ `Target must be different from source.`（`core.ts:72-74`）；
 * - `recordLink` 写的 `type` 把内核的 `dir`/`file` 翻成上游落盘用的 `directory`/`file`
 *   （`core.ts:351`），其余原样透传；`createdAt` 用 `new Date().toISOString()`；
 * - `upsertLinkRecord` 按 **小写 link** 覆盖，`removeLinkRecord` 按
 *   `normalizeComparablePath`（去 `\\?\` 前缀、`\`→`/`→`\`、去尾斜杠、小写）删；
 *   这套归一是**Windows 形状**的规则，不许"顺手改成平台相关"；
 * - `recover` 逐条记录：目标不存在 ⇒ `failedCount`；已经是那条软链 ⇒ **静默跳过**
 *   （`core.ts:201`，不计数）；建链抛错 ⇒ `failedCount` 而不中断整轮；
 * - `restore` 三层回滚（`restoreSymlinkIfPossible` / `rollbackRestore`），
 *   里面那三个 `catch` 是上游**有意**的尽力回滚：主错误已经先说出去了，
 *   回滚自身的失败要么并进消息（`core.ts:272`）要么写进句子（`core.ts:274`），
 *   不是把错误咽掉；这条区别在 `tests/core.spec.ts` 里有对照；
 * - `import` 默认**只导活的链接**（`isLiveLinkRecord`），`includeInvalid` 才保留失效记录，
 *   且只在真有新记录时写盘；
 * - `isLiveLinkRecord` 走运行时注入的那条（platform 用 `lstat`+`readlink`+双向 `exists`），
 *   没注入时落回 `pathInfo` 那份近似判断（`core.ts:316-332`）。
 *
 * @module xaihi-linku/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type LinkuAction = "info" | "create" | "move_link" | "list" | "recover" | "import" | "restore"
export type LinkuPathKind = "file" | "dir" | "missing" | "other"

export interface LinkuInput {
  action?: LinkuAction
  path?: string
  target?: string
  configPath?: string
  includeInvalid?: boolean
}

export interface LinkRecord {
  link: string
  target: string
  type: string
  createdAt: string
}

export interface LinkPathInfo {
  path: string
  exists: boolean
  kind: LinkuPathKind
  isSymlink: boolean
  linkTarget?: string
  targetExists?: boolean
  sizeMb?: number
  fileCount?: number
}

export interface LinkuData {
  pathInfo?: LinkPathInfo
  links: LinkRecord[]
  created: boolean
  recoveredCount: number
  restoredCount: number
  failedCount: number
  importedCount: number
  skippedCount: number
}

export interface LinkuRuntime {
  pathInfo: (path: string) => Promise<LinkPathInfo>
  isLiveLinkRecord?: (record: LinkRecord) => Promise<boolean>
  removeSymlink: (path: string) => Promise<void>
  createSymlink: (source: string, link: string) => Promise<void>
  movePath: (source: string, target: string) => Promise<void>
  readConfig: (path?: string) => Promise<string | null>
  writeConfig: (content: string, path?: string) => Promise<void>
}

export type LinkuResult = NodeRunResult<LinkuData>

export function normalizeLinkuInput(input: LinkuInput): Required<LinkuInput> {
  return {
    action: input.action ?? "info",
    path: normalizePath(input.path),
    target: normalizePath(input.target),
    configPath: normalizePath(input.configPath),
    includeInvalid: input.includeInvalid ?? false,
  }
}

export function normalizePath(path?: string): string {
  return (path ?? "").trim().replace(/^["']|["']$/g, "")
}

export function resolveMoveTarget(sourceInfo: LinkPathInfo, targetInput: string): { target: string; error?: string } {
  const target = normalizePath(targetInput)
  if (!target) return { target, error: "Target path is required." }
  if (sourceInfo.kind === "dir" && sourceInfo.exists && sourceInfo.path === target) {
    return { target, error: "Target must be different from source." }
  }
  return { target }
}

export function parseLinkRecords(content: string | null): LinkRecord[] {
  if (!content) return []
  const records: LinkRecord[] = []
  let current: Partial<LinkRecord> | null = null

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    if (line === "[[links]]") {
      current = {}
      records.push(current as LinkRecord)
      continue
    }
    if (!current || !line.includes("=")) continue
    const [rawKey, ...rawValueParts] = line.split("=")
    // 本仓开着 `noUncheckedIndexedAccess`（`tsconfig.base.json`），解构结果在类型上可能是
    // undefined。`line.includes("=")` 已经保证至少有这一段，所以 `?? ""` 只是把类型收窄，
    // 不改判定：`rawKey` 最坏是空串，`"".trim()` 之后对不上任何键名，与上游一样被跳过。
    const key = (rawKey ?? "").trim()
    const value = unquoteTomlString(rawValueParts.join("=").trim())
    if (key === "link") current.link = value
    else if (key === "target") current.target = value
    else if (key === "type") current.type = value
    else if (key === "created_at") current.createdAt = value
    else if (key === "createdAt") current.createdAt = value
  }

  return records.filter((record) => record.link && record.target).map((record) => ({
    link: record.link,
    target: record.target,
    type: record.type ?? "",
    createdAt: record.createdAt ?? "",
  }))
}

export function dumpLinkRecords(records: LinkRecord[]): string {
  const lines = ["# linku config generated by xiranite", "config_version = 1", ""]
  for (const record of records) {
    lines.push("[[links]]")
    lines.push(`link = "${escapeTomlString(record.link)}"`)
    lines.push(`target = "${escapeTomlString(record.target)}"`)
    lines.push(`type = "${escapeTomlString(record.type)}"`)
    lines.push(`created_at = "${escapeTomlString(record.createdAt)}"`)
    lines.push("")
  }
  return `${lines.join("\n").trimEnd()}\n`
}

export function upsertLinkRecord(records: LinkRecord[], next: LinkRecord): LinkRecord[] {
  const key = next.link.toLowerCase()
  let replaced = false
  const updated = records.map((record) => {
    if (record.link.toLowerCase() !== key) return record
    replaced = true
    return next
  })
  return replaced ? updated : [...updated, next]
}

export function removeLinkRecord(records: LinkRecord[], linkPath: string): LinkRecord[] {
  const key = normalizeComparablePath(linkPath)
  return records.filter((record) => normalizeComparablePath(record.link) !== key)
}

export async function runLinku(
  input: LinkuInput,
  runtime: LinkuRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<LinkuResult> {
  const normalized = normalizeLinkuInput(input)
  if (normalized.action === "info") {
    if (!normalized.path) return failure("Path is required.")
    const pathInfo = await runtime.pathInfo(normalized.path)
    return success("Path info loaded.", { pathInfo, links: [], created: false, recoveredCount: 0, failedCount: 0 })
  }

  if (normalized.action === "list") {
    const links = parseLinkRecords(await runtime.readConfig(normalized.configPath))
    return success(`Found ${links.length} link record(s).`, { links, created: false, recoveredCount: 0, failedCount: 0 })
  }

  if (normalized.action === "import") {
    if (!normalized.path) return failure("Legacy Linku TOML path is required.")
    return importLinkRecords(normalized.path, normalized.configPath, normalized.includeInvalid, runtime)
  }

  if (normalized.action === "restore") {
    if (!normalized.path) return failure("Recorded link path is required.")
    return restoreLink(normalized.path, normalized.configPath, runtime)
  }

  if (normalized.action === "create") {
    if (!normalized.path || !normalized.target) return failure("Source and link paths are required.")
    const sourceInfo = await runtime.pathInfo(normalized.path)
    if (!sourceInfo.exists) return failure(`Source path does not exist: ${normalized.path}`)
    const linkInfo = await runtime.pathInfo(normalized.target)
    if (linkInfo.exists || linkInfo.isSymlink) return failure(`Link path already exists: ${normalized.target}`)
    await runtime.createSymlink(normalized.path, normalized.target)
    await recordLink(runtime, normalized.configPath, normalized.target, normalized.path, sourceInfo.kind)
    return success(`Symlink created: ${normalized.target} -> ${normalized.path}`, { links: [], created: true, recoveredCount: 0, failedCount: 0 })
  }

  if (normalized.action === "move_link") {
    if (!normalized.path || !normalized.target) return failure("Source and target paths are required.")
    const sourceInfo = await runtime.pathInfo(normalized.path)
    if (!sourceInfo.exists) return failure(`Source path does not exist: ${normalized.path}`)
    const planned = resolveMoveTarget(sourceInfo, normalized.target)
    if (planned.error) return failure(planned.error)
    onEvent({ type: "progress", progress: 40, message: `Moving ${normalized.path}` })
    await runtime.movePath(normalized.path, planned.target)
    onEvent({ type: "progress", progress: 75, message: "Creating symlink" })
    await runtime.createSymlink(planned.target, normalized.path)
    await recordLink(runtime, normalized.configPath, normalized.path, planned.target, sourceInfo.kind)
    return success(`Moved and linked: ${normalized.path} -> ${planned.target}`, { links: [], created: true, recoveredCount: 0, failedCount: 0 })
  }

  const links = parseLinkRecords(await runtime.readConfig(normalized.configPath))
  let recoveredCount = 0
  let failedCount = 0
  for (const link of links) {
    const linkInfo = await runtime.pathInfo(link.link)
    const targetInfo = await runtime.pathInfo(link.target)
    if (!targetInfo.exists) {
      failedCount += 1
      continue
    }
    if (linkInfo.isSymlink && linkInfo.linkTarget?.toLowerCase() === link.target.toLowerCase()) continue
    try {
      await runtime.createSymlink(link.target, link.link)
      recoveredCount += 1
    } catch {
      failedCount += 1
    }
  }
  return success(`Recovery completed: ${recoveredCount} recovered, ${failedCount} failed.`, { links, created: false, recoveredCount, failedCount })
}

async function restoreLink(linkPath: string, configPath: string, runtime: LinkuRuntime): Promise<LinkuResult> {
  const records = parseLinkRecords(await runtime.readConfig(configPath))
  const record = records.find((candidate) => normalizeComparablePath(candidate.link) === normalizeComparablePath(linkPath))
  if (!record) return failure(`No recorded link found for: ${linkPath}`)
  if (!await isLiveLinkRecord(record, runtime)) {
    return failure(`Restore aborted because the recorded link is not valid: ${record.link}`)
  }

  try {
    await runtime.removeSymlink(record.link)
    try {
      await runtime.movePath(record.target, record.link)
    } catch (error) {
      await restoreSymlinkIfPossible(record, runtime)
      return failure(`Restore failed while moving ${record.target} back to ${record.link}: ${messageFrom(error)}`)
    }
  } catch (error) {
    return failure(`Restore failed for ${record.link}: ${messageFrom(error)}`)
  }

  try {
    await runtime.writeConfig(dumpLinkRecords(removeLinkRecord(records, record.link)), configPath)
  } catch (error) {
    const rollbackMessage = await rollbackRestore(record, runtime)
    return failure(`Restored ${record.link}, but could not remove its record: ${messageFrom(error)}${rollbackMessage}`)
  }

  return success(`Restored ${record.target} to ${record.link} and removed its link record.`, {
    links: [],
    created: false,
    recoveredCount: 0,
    restoredCount: 1,
    failedCount: 0,
  })
}

async function restoreSymlinkIfPossible(record: LinkRecord, runtime: LinkuRuntime): Promise<void> {
  try {
    const [linkInfo, targetInfo] = await Promise.all([
      runtime.pathInfo(record.link),
      runtime.pathInfo(record.target),
    ])
    if (!linkInfo.exists && targetInfo.exists) await runtime.createSymlink(record.target, record.link)
  } catch {
    // The primary error explains the failed restore; this best-effort rollback must not hide it.
  }
}

async function rollbackRestore(record: LinkRecord, runtime: LinkuRuntime): Promise<string> {
  try {
    const [linkInfo, targetInfo] = await Promise.all([
      runtime.pathInfo(record.link),
      runtime.pathInfo(record.target),
    ])
    if (linkInfo.exists && !linkInfo.isSymlink && !targetInfo.exists) {
      await runtime.movePath(record.link, record.target)
      await runtime.createSymlink(record.target, record.link)
      return " The filesystem restore was rolled back."
    }
  } catch {
    return " The filesystem was restored, but the link-record rollback failed."
  }
  return " The filesystem was restored, but the link record remains stale."
}

async function importLinkRecords(
  legacyPath: string,
  configPath: string,
  includeInvalid: boolean,
  runtime: LinkuRuntime,
): Promise<LinkuResult> {
  const content = await runtime.readConfig(legacyPath)
  if (content === null) return failure(`Legacy Linku TOML was not found: ${legacyPath}`)

  const legacyRecords = parseLinkRecords(content)
  const imported: LinkRecord[] = []
  let skippedCount = 0

  for (const record of legacyRecords) {
    if (includeInvalid || await isLiveLinkRecord(record, runtime)) {
      imported.push(record)
    } else {
      skippedCount += 1
    }
  }

  if (imported.length) {
    let merged = parseLinkRecords(await runtime.readConfig(configPath))
    for (const record of imported) merged = upsertLinkRecord(merged, record)
    await runtime.writeConfig(dumpLinkRecords(merged), configPath)
  }

  const skipped = skippedCount ? `; skipped ${skippedCount} invalid record(s)` : ""
  return success(`Imported ${imported.length} link record(s) from ${legacyPath}${skipped}.`, {
    links: imported,
    created: false,
    recoveredCount: 0,
    failedCount: 0,
    importedCount: imported.length,
    skippedCount,
  })
}

async function isLiveLinkRecord(record: LinkRecord, runtime: LinkuRuntime): Promise<boolean> {
  if (runtime.isLiveLinkRecord) return runtime.isLiveLinkRecord(record)

  try {
    const [linkInfo, targetInfo] = await Promise.all([
      runtime.pathInfo(record.link),
      runtime.pathInfo(record.target),
    ])
    return linkInfo.exists
      && linkInfo.isSymlink
      && linkInfo.targetExists === true
      && targetInfo.exists
      && linkInfo.linkTarget !== undefined
      && pathsMatch(linkInfo.linkTarget, record.target)
  } catch {
    return false
  }
}

function pathsMatch(left: string, right: string): boolean {
  return normalizeComparablePath(left) === normalizeComparablePath(right)
}

function normalizeComparablePath(path: string): string {
  return normalizePath(path)
    .replace(/^\\\\\?\\/, "")
    .replace(/\//g, "\\")
    .replace(/\\+$/, "")
    .toLowerCase()
}

async function recordLink(runtime: LinkuRuntime, configPath: string, link: string, target: string, kind: string) {
  const records = parseLinkRecords(await runtime.readConfig(configPath))
  const next = upsertLinkRecord(records, {
    link,
    target,
    type: kind === "dir" ? "directory" : kind === "file" ? "file" : kind,
    createdAt: new Date().toISOString(),
  })
  await runtime.writeConfig(dumpLinkRecords(next), configPath)
}

function success(message: string, data: Partial<LinkuData>): LinkuResult {
  return {
    success: true,
    message,
    data: { links: [], created: false, recoveredCount: 0, restoredCount: 0, failedCount: 0, importedCount: 0, skippedCount: 0, ...data },
  }
}

function failure(message: string): LinkuResult {
  return {
    success: false,
    message,
    data: { links: [], created: false, recoveredCount: 0, restoredCount: 0, failedCount: 0, importedCount: 0, skippedCount: 0 },
  }
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function unquoteTomlString(value: string): string {
  const trimmed = value.trim()
  const unquoted = trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed
  return unquoted.replace(/\\"/g, '"').replace(/\\\\/g, "\\")
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
