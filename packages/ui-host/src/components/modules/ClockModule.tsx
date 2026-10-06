import { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"

export default function ClockModule() {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(() => new Date())
  const rafRef = useRef<number>(0)

  useEffect(() => {
    let last = 0
    function tick(ts: number) {
      if (ts - last >= 1000) {
        last = ts
        setNow(new Date())
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const hh = now.getHours().toString().padStart(2, "0")
  const mm = now.getMinutes().toString().padStart(2, "0")
  const ss = now.getSeconds().toString().padStart(2, "0")
  const ms = now.getMilliseconds().toString().padStart(3, "0").slice(0, 2)

  const locale = i18n.language === "zh" ? "zh-CN" : "en-US"
  const dateStr = now.toLocaleDateString(locale, { weekday: "short", year: "numeric", month: "short", day: "2-digit" })
  const utcOffset = -(now.getTimezoneOffset() / 60)
  const tzStr = `UTC${utcOffset >= 0 ? "+" : ""}${utcOffset}`

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 p-2">
      <div className="flex items-baseline gap-0.5">
        <span className="font-mono text-5xl font-bold tabular-nums text-foreground tracking-tight">
          {hh}<span className="text-muted-foreground/60 mx-0.5">:</span>{mm}<span className="text-muted-foreground/60 mx-0.5">:</span>{ss}
        </span>
        <span className="font-mono text-xl text-muted-foreground ml-1">.{ms}</span>
      </div>
      <span className="text-xs font-mono text-muted-foreground tracking-widest uppercase">{dateStr}</span>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-mono text-[10px] text-primary border-primary/40">{t("module:clock.local")}</Badge>
        <span className="text-[10px] font-mono text-muted-foreground">{tzStr}</span>
        <Badge variant="outline" className="font-mono text-[10px]">{t("module:clock.sync")}</Badge>
      </div>
    </div>
  )
}
