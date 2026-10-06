import { useTranslation } from "react-i18next"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { AppDesignThemeId, DesignThemeConfig } from "@/lib/design-theme/contract"
import { DESIGN_THEME_ENTRIES } from "@/lib/design-theme/registry"

/**
 * 顶栏「主题」下拉里的设计语言选择器。
 *
 * 单独成文件是因为 `TopBar.tsx` 已经顶着仓库的 1000 行上限；这里也确实是
 * 一个完整边界：一份词表 + 一次写入，没有别的消费者。
 * 词表只有一份——条目来自 `DESIGN_THEME_ENTRIES`，不在顶栏再枚举一遍 id，
 * 否则设置页与顶栏会各自漂移（这条已经栽过一次：三处手写清单）。
 */
export function DesignLanguagePicker({
  value,
  onChange,
}: {
  value: DesignThemeConfig
  onChange(next: DesignThemeConfig): void
}) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-1.5">
      <p className="text-[9px] font-mono tracking-widest text-muted-foreground">
        {t("settings:timeline.steps.designLanguage")}
      </p>
      <ToggleGroup
        data-testid="design-language-group"
        type="single"
        value={value.id}
        onValueChange={(next) => {
          if (!next) return
          onChange({ ...value, id: next as AppDesignThemeId })
        }}
        variant="outline"
        size="sm"
        className="flex w-full flex-col gap-1"
        spacing={1}
      >
        {DESIGN_THEME_ENTRIES.map((option) => (
          <ToggleGroupItem
            key={option.id}
            data-design-theme-choice={option.id}
            value={option.id}
            title={t(option.descriptionKey)}
            className="h-8 w-full justify-start gap-2 px-2 text-left font-mono text-[10px] text-muted-foreground data-[state=on]:border-primary/50 data-[state=on]:bg-primary/10 data-[state=on]:text-primary"
          >
            <span className="min-w-0 flex-1 truncate">{t(option.labelKey)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
