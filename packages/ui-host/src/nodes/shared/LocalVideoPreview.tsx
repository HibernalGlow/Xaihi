import { useState } from "react"
import type { ReactNode } from "react"
import { Video } from "lucide-react"
import { cn } from "@/lib/utils"

const VIDEO_EXTENSIONS = new Set(["mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "m4v", "mpeg", "mpg", "3gp", "ts", "mts", "m2ts"])

export interface LocalVideoPreviewProps {
  path: string
  getFileUrl?: (path: string) => string
  enabled?: boolean
  className?: string
  videoClassName?: string
  fallback?: ReactNode
  eager?: boolean
  seekSeconds?: number
}

export function LocalVideoPreview({ path, getFileUrl, enabled = true, className, videoClassName, fallback, eager = false, seekSeconds = 1 }: LocalVideoPreviewProps) {
  const [failedPath, setFailedPath] = useState("")
  const source = enabled && getFileUrl && isLocalVideoPath(path) ? getFileUrl(path) : undefined
  const failed = failedPath === path
  return <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-md border bg-background", className)}>{source && !failed ? <video aria-label="视频缩略图" src={source} className={cn("size-full bg-muted/20 object-cover", videoClassName)} preload={eager ? "auto" : "metadata"} muted playsInline tabIndex={-1} onLoadedMetadata={(event) => { const duration = event.currentTarget.duration; if (Number.isFinite(duration) && duration > 0) event.currentTarget.currentTime = Math.min(seekSeconds, duration * 0.1) }} onError={() => setFailedPath(path)} /> : fallback ?? <Video className="size-4 text-muted-foreground" />}</div>
}

export function isLocalVideoPath(path: string): boolean {
  const cleanPath = path.split(/[?#]/, 1)[0] ?? path
  const extension = cleanPath.slice(cleanPath.lastIndexOf(".") + 1).toLocaleLowerCase()
  return VIDEO_EXTENSIONS.has(extension)
}
