import { cva } from "class-variance-authority"

/**
 * Global visual treatments for the shared Radix Tabs primitive.
 *
 * The preference is intentionally separate from `TabsList`'s local `variant`:
 * local variants describe layout constraints, while this setting lets people
 * choose one visual language across the application.
 */
export const TAB_DISPLAY_STYLES = ["underline", "surface", "pill", "boxed", "quiet", "none"] as const

export type TabDisplayStyle = (typeof TAB_DISPLAY_STYLES)[number]

export const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
      layout: {
        fit: "",
        fill: "w-full [&>[data-slot=tabs-trigger]]:flex-1",
        scroll: "w-full max-w-full flex-row flex-nowrap justify-start overflow-x-auto [&>[data-slot=tabs-trigger]]:flex-none",
      },
    },
    defaultVariants: {
      variant: "default",
      layout: "fit",
    },
  }
)
