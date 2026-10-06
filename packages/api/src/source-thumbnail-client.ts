import { appendUrlPath } from "@xiranite/shared"

export type SourceThumbnailKind = "file" | "folder"
export type SourceThumbnailPreviewCount = 1 | 4 | 9 | 16

export interface SourceThumbnailRegistrationItem {
  id: string
  path: string
  kind: SourceThumbnailKind
  previewCount?: SourceThumbnailPreviewCount
  refresh?: boolean
}

export interface SourceThumbnailItem {
  id: string
  thumbnailUrl: string
  thumbnailUrls?: readonly string[]
  contentVersion: string
}

export interface SourceThumbnailBatch {
  contextId: string
  generation: number
  items: SourceThumbnailItem[]
}

export interface SourceThumbnailClient {
  register(
    contextId: string,
    generation: number,
    items: readonly SourceThumbnailRegistrationItem[],
    signal?: AbortSignal,
  ): Promise<SourceThumbnailBatch>
  releaseContext(contextId: string): Promise<void>
}

export function createSourceThumbnailClient(
  baseUrl: string,
  options: { token?: string } = {},
): SourceThumbnailClient {
  const authorization: Record<string, string> = options.token ? { "x-xiranite-token": options.token } : {}
  return {
    async register(contextId, generation, items, signal) {
      const response = await fetch(appendUrlPath(baseUrl, "/source-thumbnails"), {
        method: "POST",
        headers: { ...authorization, "content-type": "application/json" },
        body: JSON.stringify({ contextId, generation, items }),
        signal,
      })
      if (!response.ok) throw new Error(`Source thumbnail registration failed: ${response.status}`)
      return await response.json() as SourceThumbnailBatch
    },
    async releaseContext(contextId) {
      const response = await fetch(appendUrlPath(baseUrl, `/source-thumbnail-contexts/${encodeURIComponent(contextId)}`), {
        method: "DELETE",
        headers: authorization,
        keepalive: true,
      })
      if (!response.ok) throw new Error(`Source thumbnail context release failed: ${response.status}`)
    },
  }
}
