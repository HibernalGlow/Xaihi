import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export interface ModulePanelProps {
  badge?: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  fill?: boolean
  grow?: boolean
  icon?: LucideIcon
  subtitle?: ReactNode
  title: ReactNode
  titleClassName?: string
}

export function ModulePanel({ badge, children, className, contentClassName, fill = false, grow = false, icon: Icon, subtitle, title, titleClassName }: ModulePanelProps) {
  return <div
    className={cn(
      "module-panel-frame min-w-0 rounded-xl bg-card/85",
      "[[data-module-panel-style=outline]_&]:bg-transparent",
      "[[data-module-panel-style=flat]_&]:bg-transparent",
      (fill || grow) && "min-h-0",
      fill && "h-full",
    )}
  >
    <section
      data-slot="module-panel"
    className={cn(
      "group/module-panel relative flex min-w-0 flex-col rounded-xl border px-2.5 pb-2.5 shadow-none",
      "[[data-module-panel-style=solid]_&]:shadow-sm",
      "[[data-module-panel-style=outline]_&]:bg-transparent",
      "[[data-module-panel-style=flat]_&]:rounded-none [[data-module-panel-style=flat]_&]:border-x-0 [[data-module-panel-style=flat]_&]:border-b-0 [[data-module-panel-style=flat]_&]:bg-transparent [[data-module-panel-style=flat]_&]:px-0",
      "[[data-module-title-style=inline]_&]:pt-2.5 [[data-module-title-style=bar]_&]:pt-9 [[data-module-title-style=minimal]_&]:pt-6",
      (fill || grow) && "min-h-0",
      fill && "h-full",
      className,
    )}
  >
    <header
      data-slot="module-panel-title"
      className={cn(
        "relative -top-2 ml-1 flex w-fit max-w-[calc(100%-0.5rem)] items-start gap-1",
        "[[data-module-title-style=inline]_&]:static [[data-module-title-style=inline]_&]:mb-2 [[data-module-title-style=inline]_&]:ml-0",
        "[[data-module-title-style=bar]_&]:absolute [[data-module-title-style=bar]_&]:inset-x-0 [[data-module-title-style=bar]_&]:top-0 [[data-module-title-style=bar]_&]:ml-0 [[data-module-title-style=bar]_&]:h-8 [[data-module-title-style=bar]_&]:w-auto [[data-module-title-style=bar]_&]:rounded-t-xl [[data-module-title-style=bar]_&]:border-b [[data-module-title-style=bar]_&]:bg-muted/40 [[data-module-title-style=bar]_&]:px-2.5",
        "[[data-module-title-style=minimal]_&]:absolute [[data-module-title-style=minimal]_&]:left-2.5 [[data-module-title-style=minimal]_&]:top-1 [[data-module-title-style=minimal]_&]:ml-0",
      )}
    >
      <Badge className={cn("min-w-0 gap-1 px-1.5 py-0 text-[10px] font-medium text-foreground shadow-none [[data-module-title-style=inline]_&]:border-0 [[data-module-title-style=inline]_&]:bg-transparent [[data-module-title-style=inline]_&]:px-0 [[data-module-title-style=bar]_&]:border-0 [[data-module-title-style=bar]_&]:bg-transparent [[data-module-title-style=bar]_&]:px-0 [[data-module-title-style=minimal]_&]:border-0 [[data-module-title-style=minimal]_&]:bg-transparent [[data-module-title-style=minimal]_&]:px-0", titleClassName)} variant="outline">
        {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
        <span className="min-w-0">
          <span className="block truncate">{title}{badge ? <span className="font-mono text-muted-foreground"> · {badge}</span> : null}</span>
          {subtitle ? <span className="mt-0.5 block truncate text-[10px] font-normal text-muted-foreground [[data-module-title-style=legend]_&]:hidden [[data-module-title-style=minimal]_&]:hidden">{subtitle}</span> : null}
        </span>
      </Badge>
    </header>
    <div data-slot="module-panel-content" className={cn("flex min-h-0 flex-col gap-2.5", fill && "flex-1 overflow-y-auto overscroll-contain", contentClassName)}>{children}</div>
  </section>
  </div>
}
