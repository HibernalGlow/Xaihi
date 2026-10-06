import { FileImage, LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { RunStateIcon } from "@/nodes/shared/controls"

export function SourceThumbnailSurface({
  url,
  alt,
  loading = false,
  className,
}: {
  url?: string
  alt: string
  loading?: boolean
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  const showImage = Boolean(url) && !failed

  return <span
    className={cn("grid shrink-0 place-items-center overflow-hidden border bg-muted/30", className)}
    data-source-thumbnail-state={showImage ? "ready" : loading ? "loading" : url ? "error" : "empty"}
  >
    {showImage
      ? <img src={url} alt={alt} loading="lazy" decoding="async" draggable={false} className="size-full select-none object-cover" onError={() => setFailed(true)} />
      : loading
        ? <RunStateIcon className="size-4 text-muted-foreground" icon={LoaderCircle} running aria-label="正在加载缩略图" />
        : <FileImage className="size-5 text-muted-foreground" aria-label="缩略图不可用" />}
  </span>
}
