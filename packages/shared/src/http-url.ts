export function appendUrlPath(baseUrl: string | URL, path: string): URL {
  const normalizedBase = new URL(baseUrl)
  normalizedBase.pathname = `${normalizedBase.pathname.replace(/\/+$/u, "")}/`
  normalizedBase.search = ""
  normalizedBase.hash = ""
  return new URL(path.replace(/^\/+/, ""), normalizedBase)
}
