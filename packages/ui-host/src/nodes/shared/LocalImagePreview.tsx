import { useState, type ReactNode } from "react"
import { FileImage } from "lucide-react"
import { cn } from "@/lib/utils"

export const LOCAL_IMAGE_EXTENSIONS = [".jxl", ".jpg", ".jpeg", ".jfif", ".jif", ".jpe", ".png", ".apng", ".gif", ".webp", ".jp2", ".bmp", ".ico", ".icns", ".tiff", ".tif", ".avif", ".svg"] as const

export interface LocalImagePreviewProps {
  path: string
  getFileUrl?: (path: string) => string
  enabled?: boolean
  alt?: string
  className?: string
  imageClassName?: string
  fallback?: ReactNode
  eager?: boolean
}

export function LocalImagePreview({ path, getFileUrl, enabled = true, alt = "", className, imageClassName, fallback, eager = false }: LocalImagePreviewProps) {
  const [failedPath, setFailedPath] = useState("")
  const source = enabled && getFileUrl && isLocalImagePath(path) ? getFileUrl(path) : undefined
  const failed = failedPath === path
  return <div className={cn("grid shrink-0 place-items-center overflow-hidden rounded-md border bg-background", className)}>{source && !failed ? <img src={source} alt={alt} className={cn("size-full object-cover", imageClassName)} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} onError={() => setFailedPath(path)} /> : fallback ?? <FileImage className="size-4 text-muted-foreground" />}</div>
}

export function isLocalImagePath(path: string): boolean {
  const normalized = path.toLowerCase().split(/[?#]/, 1)[0] ?? ""
  return LOCAL_IMAGE_EXTENSIONS.some((extension) => normalized.endsWith(extension))
}
