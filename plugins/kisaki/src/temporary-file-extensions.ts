export const DEFAULT_TEMPORARY_FILE_EXTENSIONS = "#,thumbs.db,.bak,~,.tmp,.temp,.ds_store,.crdownload,.part,.cache,.dmp,.download,.partial"

export function parseTemporaryFileExtensions(value: unknown): string[] {
  const values = Array.isArray(value) ? value.map(String) : [String(value ?? "")]
  return unique(values.flatMap((item) => item.split(/[\r\n,;]/)).map((item) => toAsciiLowercase(item.trim())).filter(Boolean))
}

export function normalizeTemporaryFileExtensions(value: unknown): string {
  const extensions = parseTemporaryFileExtensions(value)
  return (extensions.length ? extensions : parseTemporaryFileExtensions(DEFAULT_TEMPORARY_FILE_EXTENSIONS)).join(",")
}

export function isDefaultTemporaryFileExtensions(value: unknown): boolean {
  return sameExtensions(parseTemporaryFileExtensions(value), parseTemporaryFileExtensions(DEFAULT_TEMPORARY_FILE_EXTENSIONS))
}

function sameExtensions(left: readonly string[], right: readonly string[]): boolean {
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()
  return sortedLeft.length === sortedRight.length && sortedLeft.every((value, index) => value === sortedRight[index])
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function toAsciiLowercase(value: string): string {
  return value.replace(/[A-Z]/g, (character) => character.toLowerCase())
}
