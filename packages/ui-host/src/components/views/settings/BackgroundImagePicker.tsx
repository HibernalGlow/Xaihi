import { useState } from "react"
import { useTranslation } from "react-i18next"
import { Upload, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  BACKGROUND_IMAGE_MAX_DATA_URL_BYTES,
  BACKGROUND_IMAGE_MAX_EDGE,
  BackgroundImageTooLargeError,
  estimateBackgroundImageBytes,
  isBackgroundImageDataUrl,
  prepareBackgroundImage,
} from "@/lib/backgroundImage"
import { formatBytes } from "@/lib/format"

const FILE_INPUT_ID = "bg-file-upload"

type Translate = (key: string, options?: Record<string, string | number>) => string

type PickerStatus =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; sourceBytes: number; outputBytes: number; width: number; height: number; recompressed: boolean }
  | { kind: "failed"; message: string }

export interface BackgroundImagePickerProps {
  value: string
  onChange: (value: string) => void
}

/**
 * 背景图选择与输入区。
 *
 * 存在的理由：data URL 会同时进 store、CSS 变量与后端 SQLite，直接读原图 base64
 * 会让一张超大壁纸把内存打满。两条入口（选文件、粘贴 data URL）都收敛到体积上限内，
 * 并把「压了多少」显示出来，而不是静默改写用户选中的图片。
 */
export function BackgroundImagePicker({ value, onChange }: BackgroundImagePickerProps) {
  const { t } = useTranslation()
  const [status, setStatus] = useState<PickerStatus>({ kind: "idle" })
  const inlinedBytes = isBackgroundImageDataUrl(value) ? estimateBackgroundImageBytes(value) : 0

  async function applySource(source: Blob | string, sourceBytes: number) {
    setStatus({ kind: "busy" })
    try {
      const prepared = await prepareBackgroundImage(source)
      onChange(prepared.dataUrl)
      setStatus({
        kind: "done",
        sourceBytes: Math.max(sourceBytes, prepared.sourceBytes),
        outputBytes: prepared.outputBytes,
        width: prepared.width,
        height: prepared.height,
        recompressed: prepared.recompressed,
      })
    } catch (error) {
      setStatus({ kind: "failed", message: describeFailure(error, t) })
    }
  }

  function handleUrlInput(raw: string) {
    if (isBackgroundImageDataUrl(raw)) {
      // 已经是小体积的 data URL 直接接受；超限的才走压缩，压缩在飞时不重复起活。
      if (estimateBackgroundImageBytes(raw) <= BACKGROUND_IMAGE_MAX_DATA_URL_BYTES) {
        onChange(raw)
        setStatus({ kind: "idle" })
      } else if (status.kind !== "busy") {
        void applySource(raw, estimateBackgroundImageBytes(raw))
      }
      return
    }
    setStatus({ kind: "idle" })
    onChange(raw)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-mono tracking-widest text-muted-foreground">{t("settings:background.uploadImage")}</p>
        <div className="flex gap-2">
          <input
            type="file"
            accept="image/*"
            id={FILE_INPUT_ID}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) void applySource(file, file.size)
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="cursor-pointer font-mono text-xs"
            onClick={() => document.getElementById(FILE_INPUT_ID)?.click()}
          >
            <Upload className="mr-1.5 size-3.5" />
            {t("settings:background.chooseFile")}
          </Button>
          {value && (
            <Button
              variant="outline"
              size="sm"
              className="cursor-pointer font-mono text-xs hover:text-destructive"
              onClick={() => {
                onChange("")
                setStatus({ kind: "idle" })
              }}
            >
              <X className="mr-1.5 size-3.5" />
              {t("common:clear")}
            </Button>
          )}
        </div>
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {t("settings:background.autoCompressHint", {
            limit: formatBytes(BACKGROUND_IMAGE_MAX_DATA_URL_BYTES),
            edge: `${BACKGROUND_IMAGE_MAX_EDGE}px`,
          })}
        </p>
        <StatusLine status={status} t={t} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-mono tracking-widest text-muted-foreground">{t("settings:background.imageUrl")}</p>
        <input
          type="text"
          value={isBackgroundImageDataUrl(value) ? "" : value}
          onChange={(event) => handleUrlInput(event.target.value)}
          placeholder={inlinedBytes
            ? t("settings:background.inlineImage", { size: formatBytes(inlinedBytes) })
            : "https://example.com/bg.jpg"}
          className="w-full rounded border border-border bg-muted/20 px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
        />
      </div>
    </div>
  )
}

function StatusLine({ status, t }: { status: PickerStatus; t: Translate }) {
  if (status.kind === "failed") {
    return <p data-testid="bg-image-status" className="text-[10px] leading-relaxed text-destructive">{status.message}</p>
  }
  if (status.kind === "busy") {
    return <p data-testid="bg-image-status" className="text-[10px] leading-relaxed text-muted-foreground">{t("settings:background.compressing")}</p>
  }
  if (status.kind === "done") {
    const dimensions = status.width > 0 && status.height > 0 ? ` · ${status.width}×${status.height}` : ""
    const text = status.recompressed
      ? `${t("settings:background.compressed", { from: formatBytes(status.sourceBytes), to: formatBytes(status.outputBytes) })}${dimensions}`
      : t("settings:background.keptOriginal", { size: formatBytes(status.outputBytes) })
    return <p data-testid="bg-image-status" className="text-[10px] leading-relaxed text-muted-foreground">{text}</p>
  }
  return null
}

function describeFailure(error: unknown, t: Translate): string {
  if (error instanceof BackgroundImageTooLargeError) {
    return t("settings:background.stillTooLarge", { limit: formatBytes(BACKGROUND_IMAGE_MAX_DATA_URL_BYTES) })
  }
  return t("settings:background.processFailed", { message: error instanceof Error ? error.message : String(error) })
}
