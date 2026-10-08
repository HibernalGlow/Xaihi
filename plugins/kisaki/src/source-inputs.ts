export function parseKisakiList(value: unknown): string[] {
  if (Array.isArray(value)) return unique(value.map((item) => clean(String(item))).filter(Boolean))
  return unique(String(value ?? "").replace(/[\u2068\u2069]/g, "").split(/\r?\n|,|;/).map(clean).filter(Boolean))
}

export function serializeKisakiPaths(paths: readonly string[]): string {
  return unique(paths.map(clean).filter(Boolean)).join("\n")
}

export function addKisakiPaths(current: unknown, additions: unknown, prepend = true): string[] {
  const existing = parseKisakiList(current)
  const added = parseKisakiList(additions)
  return unique(prepend ? [...added, ...existing] : [...existing, ...added])
}

export function addKisakiPathsWithReferences(current: unknown, references: unknown, additions: unknown, referenceKeywords: unknown): { paths: string[]; references: string[] } {
  const existing = parseKisakiList(current)
  const paths = addKisakiPaths(existing, additions)
  const added = new Set(paths.filter((path) => !existing.includes(path)))
  const keywords = parseKisakiList(referenceKeywords)
  const nextReferences = new Set(reconcileKisakiReferences(paths, references))
  for (const path of added) if (keywords.some((keyword) => path.includes(keyword))) nextReferences.add(path)
  return { paths, references: paths.filter((path) => nextReferences.has(path)) }
}

export function removeKisakiPaths(current: unknown, removed: Iterable<string>): string[] {
  const rejected = new Set(removed)
  return parseKisakiList(current).filter((path) => !rejected.has(path))
}

export function reconcileKisakiReferences(included: unknown, references: unknown): string[] {
  const allowed = new Set(parseKisakiList(included))
  return parseKisakiList(references).filter((path) => allowed.has(path))
}

export function toggleKisakiReference(included: unknown, references: unknown, path: string): string[] {
  const allowed = parseKisakiList(included)
  if (!allowed.includes(path)) return reconcileKisakiReferences(allowed, references)
  const selected = new Set(reconcileKisakiReferences(allowed, references))
  if (selected.has(path)) selected.delete(path)
  else selected.add(path)
  return allowed.filter((candidate) => selected.has(candidate))
}

export function setAllKisakiReferences(included: unknown, checked: boolean): string[] {
  return checked ? parseKisakiList(included) : []
}

export function parseKisakiExtensionTokens(value: unknown): string[] {
  return unique(parseKisakiList(value).map((token) => token.startsWith(".") ? token.slice(1) : token).filter(Boolean))
}

export function serializeKisakiExtensionTokens(tokens: readonly string[]): string {
  return unique(tokens.map((token) => clean(token).replace(/^\./, "")).filter(Boolean)).join(",")
}

export function isValidKisakiExtensionToken(token: string): boolean {
  const value = token.replace(/^\./, "")
  return Boolean(value) && !value.includes(".") && !/\s/.test(value)
}

export function isValidKisakiExcludedItem(rule: string): boolean {
  return rule === "DEFAULT" || rule === "$TRASH" || rule.includes("*")
}

function clean(value: string): string {
  const trimmed = value.replace(/[\u2068\u2069]/g, "").trim()
  return trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1 ? trimmed.slice(1, -1) : trimmed
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)]
}
