import { NumberTicker } from "@/components/ui/number-ticker"
import { cn } from "@/lib/utils"

export interface StatsPanelItem {
  label: string
  tone?: "default" | "error"
  value: string | number
}

const BASE_COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
}

const FULL_COLS_CLASS: Record<number, string> = {
  1: "@3xl:grid-cols-1",
  2: "@3xl:grid-cols-2",
  3: "@3xl:grid-cols-3",
  4: "@3xl:grid-cols-4",
  5: "@3xl:grid-cols-5",
  6: "@3xl:grid-cols-6",
}

export function StatsPanel(props: {
  columns?: number
  items: StatsPanelItem[]
}) {
  const cols = props.columns ?? Math.min(Math.max(props.items.length, 1), 6)
  const baseCols = Math.min(cols, 4)
  const baseClass = BASE_COLS_CLASS[baseCols] ?? "grid-cols-4"
  const fullClass = FULL_COLS_CLASS[cols] ?? "@3xl:grid-cols-6"
  return (
    <div className={cn("grid shrink-0 gap-1", baseClass, fullClass)}>
      {props.items.map((item) => {
        const numeric = typeof item.value === "number"
        const errorTone = item.tone === "error" && Number(item.value) > 0
        return (
          <div key={item.label} className="min-w-0 rounded-md bg-muted/35 px-2 py-1.5 text-center">
            <div className="truncate text-[11px] text-muted-foreground">{item.label}</div>
            <div
              className={cn(
                "text-sm font-semibold tabular-nums",
                errorTone && "text-destructive",
              )}
            >
              {numeric ? (
                <NumberTicker
                  value={item.value as number}
                  decimalPlaces={Number.isInteger(item.value) ? 0 : 2}
                />
              ) : (
                item.value
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
