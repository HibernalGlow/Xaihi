import { useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  filterSettingsMatches,
  type SettingsSearchMatch,
} from "./settingsNavigation"

export function SettingsSearch({
  onSelect,
  className,
}: {
  onSelect(match: SettingsSearchMatch): void
  className?: string
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const matches = useMemo(
    () => filterSettingsMatches(query, (key) => t(key)),
    [query, t],
  )

  return (
    <div className={cn("relative min-w-0", className)} data-settings-search>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("settings:search.placeholder")}
          aria-label={t("settings:search.placeholder")}
          role="combobox"
          aria-expanded={query.trim().length > 0}
          aria-controls="settings-search-results"
          className="h-8 bg-background/70 pl-8 pr-8 text-xs"
        />
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1 size-6 -translate-y-1/2"
            onClick={() => setQuery("")}
            aria-label={t("settings:search.clear")}
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {query.trim() ? (
        <div
          id="settings-search-results"
          role="listbox"
          aria-label={t("settings:search.results")}
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border/70 bg-popover p-1 shadow-md"
        >
          {matches.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-muted-foreground">{t("settings:search.empty")}</p>
          ) : (
            matches.map((match) => {
              const key = match.kind === "field"
                ? `field:${match.fieldId}`
                : match.kind === "step" ? `step:${match.stepId}` : `stage:${match.sectionId}`
              return (
                <button
                  key={key}
                  type="button"
                  role="option"
                  className="flex w-full flex-col gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-muted"
                  onClick={() => {
                    onSelect(match)
                    setQuery("")
                  }}
                >
                  <span className="truncate text-xs font-medium text-foreground">{match.label}</span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {match.kind === "step"
                      ? t("settings:search.stepInStage", { stage: match.stageLabel })
                      : match.kind === "field"
                        ? t("settings:search.fieldInStep", { step: match.stepLabel, stage: match.stageLabel })
                      : t("settings:search.stage")}
                  </span>
                </button>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}
