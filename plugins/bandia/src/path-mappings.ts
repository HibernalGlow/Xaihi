/**
 * Bandia's path and path-mapping text parsing: one implementation, two consumers.
 *
 * These functions used to live in `core.ts`, which left `src/nodes/bandia/Component.tsx` with no way to show the
 * archive count and the mapping preview without value-importing `@xiranite/node-bandia/core`. A core value import
 * puts a second execution host in the face process, which ADR-0074 §5 rejects, so the parsing now lives here and
 * `core.ts` only re-exports it: the QuickJS bundle still gets exactly one copy (through this relative edge), and the
 * GUI reaches it through the package's `./path-mappings` subpath. Same shape as classf's `blacklist.ts` — the
 * implementation sits next to the core, the core forwards.
 *
 * Pure text work only: no `BandiaRuntime`, no filesystem, no Bandizip invocation.
 */

/** Extensions bandia treats as archives; both `isArchivePath` and `parseBandiaPaths` read this one table. */
export const ARCHIVE_EXTENSIONS = [".zip", ".7z", ".rar", ".tar", ".gz", ".bz2", ".xz"] as const

/** One archive and the folder it was extracted to — `extract` produces it, `repack` consumes it. */
export interface BandiaPathMapping {
  archivePath: string
  extractedPath: string
}

export function parseBandiaPaths(text = ""): string[] {
  const results: string[] = []
  for (const rawLine of text.split(/\r?\n|[;]/)) {
    const line = stripOuterQuotes(rawLine.trim())
    if (!line) continue
    if (isArchivePath(line)) {
      results.push(line)
      continue
    }

    const match = line.match(/(?:^|\s)([^\s"']+\.(?:zip|7z|rar|tar|gz|bz2|xz))(?:\s|$)/i)
    if (match?.[1]) results.push(stripOuterQuotes(match[1]))
  }
  return unique(results)
}

export function isArchivePath(path: string): boolean {
  return ARCHIVE_EXTENSIONS.some((ext) => path.toLowerCase().endsWith(ext))
}

export function parsePathMappings(text = ""): BandiaPathMapping[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed) as unknown
    return normalizeMappings(parsed)
  } catch {
    const mappings: BandiaPathMapping[] = []
    for (const rawLine of trimmed.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue
      const parts = line.includes("=>")
        ? line.split("=>")
        : line.includes("\t")
          ? line.split("\t")
          : line.split("|")
      if (parts.length < 2) continue
      mappings.push({
        archivePath: stripOuterQuotes(parts[0]?.trim() ?? ""),
        extractedPath: stripOuterQuotes(parts.slice(1).join("|").trim()),
      })
    }
    return mappings.filter((mapping) => mapping.archivePath && mapping.extractedPath)
  }
}

export function normalizeMappings(value: unknown): BandiaPathMapping[] {
  const raw = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { mappings?: unknown }).mappings)
      ? (value as { mappings: unknown[] }).mappings
      : []

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const record = item as Record<string, unknown>
      const archivePath = stringValue(record.archivePath) || stringValue(record.archive_path)
      const extractedPath = stringValue(record.extractedPath) || stringValue(record.extracted_path)
      return archivePath && extractedPath ? { archivePath, extractedPath } : null
    })
    .filter((item): item is BandiaPathMapping => Boolean(item))
}

export function mappingsToText(mappings: BandiaPathMapping[]): string {
  return JSON.stringify({ mappings }, null, 2)
}

/**
 * Quoted paths are what clipboard paste and Bandizip listings actually look like, so every consumer must strip
 * quotes the same way. Exported because `core.ts` normalizes collected paths with this exact rule too — a private
 * copy there would be a second implementation of the same semantics.
 */
export function stripOuterQuotes(value: string): string {
  let resultValue = value.trim()
  while (resultValue.length >= 2 && isQuote(resultValue[0]!) && isQuote(resultValue[resultValue.length - 1]!)) {
    resultValue = resultValue.slice(1, -1).trim()
  }
  if (resultValue && isQuote(resultValue[0]!)) resultValue = resultValue.slice(1).trim()
  if (resultValue && isQuote(resultValue[resultValue.length - 1]!)) resultValue = resultValue.slice(0, -1).trim()
  return resultValue
}

/** Order-preserving de-duplication, shared for the same reason as `stripOuterQuotes`. */
export function unique(values: string[]): string[] {
  const seen = new Set<string>()
  return values.filter((value) => value && !seen.has(value) && Boolean(seen.add(value)))
}

function isQuote(value: string): boolean {
  return value === "\"" || value === "'"
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : ""
}
