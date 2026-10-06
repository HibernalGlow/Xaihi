import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Copy, Trash2 } from "lucide-react"

export default function ScratchModule() {
  const { t } = useTranslation()
  const [text, setText] = useState("")
  const ref = useRef<HTMLTextAreaElement>(null)

  function handleCopy() {
    navigator.clipboard.writeText(text).catch(() => {})
  }

  function handleClear() {
    setText("")
    ref.current?.focus()
  }

  return (
    <div className="flex flex-col h-full gap-2 p-1">
      <Textarea
        ref={ref}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={t("module:scratch.placeholder")}
        className="flex-1 min-h-[120px] resize-none font-mono text-xs bg-muted/40 border-border/60 placeholder:text-muted-foreground/50 focus-visible:ring-primary/40"
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground">{t("module:scratch.chars", { count: text.length })}</span>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} title={t("common:copy")}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleClear} title={t("common:clear")}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
