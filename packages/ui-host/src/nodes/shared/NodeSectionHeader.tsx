import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export function NodeSectionHeader({
  className,
  description,
  icon: Icon,
  title,
}: {
  className?: string
  description?: string
  icon: LucideIcon
  title: string
}) {
  return (
    <div className={cn("flex min-w-0 items-start gap-2 px-1.5", className)}>
      <span className="mt-px grid size-5 shrink-0 place-items-center rounded-md border bg-card text-muted-foreground">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="truncate text-sm font-semibold leading-5">{title}</div>
        {description && <div className="mt-0.5 text-xs leading-5 text-muted-foreground">{description}</div>}
      </div>
    </div>
  )
}
