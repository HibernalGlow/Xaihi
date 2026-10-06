/**
 * encodeb 的内核，从 `<Xiranite>` tag `noxide`（ADR-0003 记的 commit `ccf465fe`）的
 * `packages/nodes/encodeb/src/core.ts`（**185 行**）逐字搬来：类型、预设表、判定正则、
 * 函数顺序与消息文案全部原样，**一处逻辑都没改**。唯一改动是第 1 行那条 import ——
 * `@xiranite/contract` 的两个类型换成本包的 `./contract.ts` 垫片（理由见那个文件的头注释
 * 与 `docs/adr/0002-self-contained-plugin-packages.md`）。保真度由 `tests/core.spec.ts` 守住，
 * 期望值手抄上游 `core.test.ts`。
 *
 * 台账里这个节点的 hostRequirements 是 `file-io` + 递归枚举：本文件仍然**零 I/O**，
 * 触达机器的动作全从 `EncodebRuntime` 那三个方法注入（`:41-45`），落地实现在 `src/platform.ts`。
 *
 * 会被"顺手优化"改掉的枚举与顺序语义，逐条钉在这里：
 * - 内核默认与定义里的界面默认**不是同一套**（`:64-74`）：`action` 是 `preview`、
 *   `srcEncoding` `cp437`、`dstEncoding` `cp936`、`transform` `recode`、`strategy` `replace`、
 *   `limit` `Math.max(1, Math.trunc(200))`；定义里 `preset` 默认 `auto`、编码默认 `auto`。
 *   两边不许合并，也不许在这里替界面补 `preset`（内核词表里没有 `preset` 这个输入槽）。
 * - `parseEncodebPaths`（`:76-79`）**只按换行切**，并且剥掉首尾引号；分号不是分隔符。
 *   上游 CLI 自己先用 `;` 拼 stdin、再 `split(";")`（`cli.ts:221`），所以那一步属于终端面。
 * - `ENCODEB_PRESETS`（`:52-62`）没有 `custom` 这一条：`custom` 是界面层的概念，
 *   由调用方换成显式编码（上游 `interaction.ts:88-101`），不在这里发明。
 * - `SUSPICIOUS_CHARS`（`:50`）里 `╔╚` 写了两次：它是 `Set`，重复项是无害的，**不许"清理"**。
 * - `isSuspiciousName`（`:85-92`）是六条**或**：方块字符集、`#U` 转义、`[ÃÂâã]\S`、
 *   cp437→GBK 假名集、重音字母**满两条才算**、以及出现 U+FFFD。
 * - `findSuspicious`（`:94-103`）到 limit 就 `break`，返回的是**前 limit 条**，不是"跳过后面的"。
 * - `createEncodebMappings`（`:105-130`）：`changedOnly` 默认 **true**，比较的是
 *   `newParts.join("\0")`（NUL 连接，`:116`）；limit 截断**只在 changedOnly 分支**生效（`:126`）。
 * - `sortReplaceMappings`（`:132-134`）：深度大的在前，同深度**源路径长的在前**。
 * - `runEncodeb`（`:136-176`）：空路径直接 `success:false` + `No valid paths provided.`；
 *   `recover` 那条腿**一个 progress 都不发**（`:146-153`），find/preview 才发
 *   `Math.round((index / paths.length) * 80)` 与收尾的 `100`（`:160`、`:169`）⇒ 单位是百分数，
 *   与 crashu / formatv 同档，与 dissolvef 那份 0..1 不同。
 * - `joinPath`（`:178-181`）的分隔符默认看 root 里有没有 `\\`，并砍掉 root 尾部的分隔符；
 *   `emptyData()`（`:183-185`）三个字段都是空/0，`processed` 只有 recover 那条腿会填。
 *
 * @module xaihi-encodeb/core
 */

import type { NodeRunEvent, NodeRunResult } from "./contract.ts"

export type EncodebAction = "find" | "preview" | "recover"
export type EncodebStrategy = "replace" | "copy"
export type EncodebEntryType = "file" | "dir"
export type EncodebTransform = "auto" | "recode" | "decode-hash-u" | "normalize-middle-dot"

export interface EncodebInput {
  action?: EncodebAction
  paths?: string[]
  srcEncoding?: string
  dstEncoding?: string
  transform?: EncodebTransform
  strategy?: EncodebStrategy
  limit?: number
}

export interface EncodebEntry {
  path: string
  name: string
  type: EncodebEntryType
  rootPath: string
  relativeParts: string[]
  depth: number
  separator?: string
}

export interface EncodebMapping {
  src: string
  dst: string
  type: EncodebEntryType
  depth: number
}

export interface EncodebData {
  mappings: EncodebMapping[]
  matches: string[]
  processed: number
}

export interface EncodebRuntime {
  scanPath: (path: string) => Promise<EncodebEntry[]>
  recoverPath: (path: string, input: Required<EncodebInput>, onEvent: (event: NodeRunEvent) => void) => Promise<string>
  transcodeName?: NameTranscoder
}

export type EncodebResult = NodeRunResult<EncodebData>
export type NameTranscoder = (name: string, srcEncoding: string, dstEncoding: string, transform?: EncodebTransform) => string

export const SUSPICIOUS_CHARS = new Set("╘╙═╝║╧╞╫╔╚┌┐└┘├┤┬┴┼▓█▐▌▀▄╔╦╩╠╬")

export const ENCODEB_PRESETS = {
  auto: { label: "Auto detect", srcEncoding: "auto", dstEncoding: "auto", transform: "auto", example: "ã‚» / #U30BB / ╓╨╬─ → detected text" },
  cn: { label: "Chinese", srcEncoding: "cp437", dstEncoding: "cp936", transform: "recode" },
  jp: { label: "Japanese", srcEncoding: "cp437", dstEncoding: "cp932", transform: "recode" },
  kr: { label: "Korean", srcEncoding: "cp437", dstEncoding: "cp949", transform: "recode" },
  jp_from_cn: { label: "Japanese from GBK mojibake", srcEncoding: "cp936", dstEncoding: "cp932", transform: "recode" },
  jp_iso2022_from_cn: { label: "ISO-2022-JP from GBK mojibake", srcEncoding: "cp936", dstEncoding: "iso-2022-jp", transform: "recode" },
  latin1_utf8: { label: "UTF-8 from Latin-1 mojibake", srcEncoding: "windows-1252", dstEncoding: "utf8", transform: "recode" },
  hash_u: { label: "Decode #Uxxxx escapes", srcEncoding: "unicode-escape", dstEncoding: "unicode", transform: "decode-hash-u" },
  middle_dot: { label: "Normalize Japanese middle dot", srcEncoding: "U+30FB", dstEncoding: "U+00B7", transform: "normalize-middle-dot" },
} as const

export function normalizeEncodebInput(input: EncodebInput): Required<EncodebInput> {
  return {
    action: input.action ?? "preview",
    paths: parseEncodebPaths(input.paths),
    srcEncoding: input.srcEncoding ?? "cp437",
    dstEncoding: input.dstEncoding ?? "cp936",
    transform: input.transform ?? "recode",
    strategy: input.strategy ?? "replace",
    limit: Math.max(1, Math.trunc(input.limit ?? 200)),
  }
}

export function parseEncodebPaths(textOrPaths: string | string[] | undefined): string[] {
  const values = Array.isArray(textOrPaths) ? textOrPaths : (textOrPaths ?? "").split(/\r?\n/)
  return values.map((path) => path.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
}

export function defaultTranscodeName(name: string): string {
  return name
}

export function isSuspiciousName(name: string): boolean {
  return [...name].some((char) => SUSPICIOUS_CHARS.has(char))
    || /#U[0-9a-fA-F]{4,6}/.test(name)
    || /[ÃÂâã]\S/.test(name)
    || /[僋儖儞僗僥僼傾偺丄]/.test(name)
    || ([...name].filter((char) => /[éâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥ƒáíóúñÑªº¿]/u.test(char)).length >= 2)
    || name.includes("\ufffd")
}

export function findSuspicious(entries: EncodebEntry[], limit = 200): EncodebEntry[] {
  const results: EncodebEntry[] = []
  for (const entry of entries) {
    if (isSuspiciousName(entry.name)) {
      results.push(entry)
      if (results.length >= limit) break
    }
  }
  return results
}

export function createEncodebMappings(
  entries: EncodebEntry[],
  input: Pick<Required<EncodebInput>, "srcEncoding" | "dstEncoding" | "transform" | "limit">,
  transcodeName: NameTranscoder = defaultTranscodeName,
  options: { changedOnly?: boolean; destRoot?: string } = {},
): EncodebMapping[] {
  const changedOnly = options.changedOnly ?? true
  const mappings: EncodebMapping[] = []

  for (const entry of entries) {
    const newParts = entry.relativeParts.map((part) => transcodeName(part, input.srcEncoding, input.dstEncoding, input.transform))
    const changed = newParts.join("\0") !== entry.relativeParts.join("\0")
    if (changedOnly && !changed) continue

    mappings.push({
      src: entry.path,
      dst: joinPath(options.destRoot ?? entry.rootPath, newParts, entry.separator),
      type: entry.type,
      depth: entry.depth,
    })

    if (changedOnly && mappings.length >= input.limit) break
  }

  return mappings
}

export function sortReplaceMappings(mappings: EncodebMapping[]): EncodebMapping[] {
  return [...mappings].sort((a, b) => b.depth - a.depth || b.src.length - a.src.length)
}

export async function runEncodeb(
  input: EncodebInput,
  runtime: EncodebRuntime,
  onEvent: (event: NodeRunEvent) => void = () => {},
): Promise<EncodebResult> {
  const normalized = normalizeEncodebInput(input)
  if (!normalized.paths.length) {
    return { success: false, message: "No valid paths provided.", data: emptyData() }
  }

  if (normalized.action === "recover") {
    let processed = 0
    for (const path of normalized.paths) {
      await runtime.recoverPath(path, normalized, onEvent)
      processed += 1
    }
    return { success: true, message: `Recovery completed, processed ${processed} path(s).`, data: { ...emptyData(), processed } }
  }

  const mappings: EncodebMapping[] = []
  const matches: string[] = []

  for (let index = 0; index < normalized.paths.length; index += 1) {
    const path = normalized.paths[index]
    onEvent({ type: "progress", progress: Math.round((index / normalized.paths.length) * 80), message: `Scanning ${path}` })
    const entries = await runtime.scanPath(path)
    if (normalized.action === "find") {
      matches.push(...findSuspicious(entries, normalized.limit).map((entry) => entry.path))
    } else {
      mappings.push(...createEncodebMappings(entries, normalized, runtime.transcodeName))
    }
  }

  onEvent({ type: "progress", progress: 100, message: "Scan completed." })
  const count = normalized.action === "find" ? matches.length : mappings.length
  return {
    success: true,
    message: `${normalized.action === "find" ? "Find" : "Preview"} completed, ${count} item(s).`,
    data: { mappings, matches, processed: 0 },
  }
}

function joinPath(root: string, parts: string[], separator = root.includes("\\") ? "\\" : "/"): string {
  const trimmedRoot = root.replace(/[\\/]+$/, "")
  return [trimmedRoot, ...parts].filter(Boolean).join(separator)
}

function emptyData(): EncodebData {
  return { mappings: [], matches: [], processed: 0 }
}
