import type { ReactNode } from "react"
import { File, Music } from "lucide-react"
import { LocalImagePreview, isLocalImagePath } from "./LocalImagePreview"
import { isLocalVideoPath, LocalVideoPreview } from "./LocalVideoPreview"

const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "flac", "aac", "ogg", "m4a", "wma", "opus", "ape"])

export type LocalMediaKind = "image" | "video" | "audio"

export interface LocalMediaPreviewProps {
  path: string
  getFileUrl?: (path: string) => string
  className?: string
  fallback?: ReactNode
}

export function LocalMediaPreview({ path, getFileUrl, className, fallback }: LocalMediaPreviewProps) {
  const kind = getLocalMediaKind(path)
  if (kind === "image") return <LocalImagePreview path={path} getFileUrl={getFileUrl} className={className} fallback={fallback} />
  if (kind === "video") return <LocalVideoPreview path={path} getFileUrl={getFileUrl} className={className} fallback={fallback} />
  if (kind === "audio") return <div className={className}><Music className="size-4 text-muted-foreground" /></div>
  return <div className={className}>{fallback ?? <File className="size-4 text-muted-foreground" />}</div>
}

export function getLocalMediaKind(path: string): LocalMediaKind | undefined {
  if (isLocalImagePath(path)) return "image"
  if (isLocalVideoPath(path)) return "video"
  return isLocalAudioPath(path) ? "audio" : undefined
}

export function isLocalAudioPath(path: string): boolean {
  const cleanPath = path.split(/[?#]/, 1)[0] ?? path
  const extension = cleanPath.slice(cleanPath.lastIndexOf(".") + 1).toLocaleLowerCase()
  return AUDIO_EXTENSIONS.has(extension)
}

export function formatMediaTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.floor(seconds % 60)
  return `${minutes}:${String(remainder).padStart(2, "0")}`
}
