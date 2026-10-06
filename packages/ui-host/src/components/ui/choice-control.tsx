import type { ComponentProps, ReactNode } from "react"

import type { FieldTitleStyle } from "@/components/ui/choice-control-variants"
import { FieldLegend, FieldSet } from "@/components/ui/field"
import { cn } from "@/lib/utils"

type ChoiceControlFieldProps = Omit<ComponentProps<typeof FieldSet>, "children"> & {
  children: ReactNode
  label: string
  labelStyle?: FieldTitleStyle
  contentClassName?: string
}

function ChoiceControlField({ children, className, contentClassName, label, labelStyle, ...props }: ChoiceControlFieldProps) {
  return (
    <FieldSet
      data-field-title-style={labelStyle}
      data-slot="choice-control-field"
      className={cn(
        "min-w-0 gap-1.5",
        "[[data-field-title-style=stacked]_&]:border-0 [[data-field-title-style=stacked]_&]:p-0",
        "[[data-field-title-style=legend]_&]:rounded-lg [[data-field-title-style=legend]_&]:border [[data-field-title-style=legend]_&]:px-2 [[data-field-title-style=legend]_&]:pb-2 [[data-field-title-style=legend]_&]:pt-0",
        "[[data-field-title-style=inline]_&]:grid [[data-field-title-style=inline]_&]:grid-cols-[auto_minmax(0,1fr)] [[data-field-title-style=inline]_&]:items-center [[data-field-title-style=inline]_&]:gap-2 [[data-field-title-style=inline]_&]:border-0 [[data-field-title-style=inline]_&]:p-0",
        "[[data-field-title-style=hidden]_&]:border-0 [[data-field-title-style=hidden]_&]:p-0",
        labelStyle === "stacked" && "border-0 p-0",
        labelStyle === "legend" && "rounded-lg border px-2 pb-2 pt-0",
        labelStyle === "inline" && "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 border-0 p-0",
        labelStyle === "hidden" && "border-0 p-0",
        className,
      )}
      {...props}
    >
      <FieldLegend
        variant="label"
        className={cn(
          "w-fit text-[10px] text-muted-foreground",
          "[[data-field-title-style=stacked]_&]:mb-0 [[data-field-title-style=stacked]_&]:px-0",
          "[[data-field-title-style=legend]_&]:pointer-events-none [[data-field-title-style=legend]_&]:mb-0 [[data-field-title-style=legend]_&]:ml-1 [[data-field-title-style=legend]_&]:px-1",
          "[[data-field-title-style=inline]_&]:mb-0 [[data-field-title-style=inline]_&]:px-0",
          "[[data-field-title-style=hidden]_&]:sr-only",
          labelStyle === "stacked" && "mb-0 px-0",
          labelStyle === "legend" && "pointer-events-none mb-0 ml-1 px-1",
          labelStyle === "inline" && "mb-0 px-0",
          labelStyle === "hidden" && "sr-only",
        )}
      >
        {label}
      </FieldLegend>
      <div className={cn("min-w-0", contentClassName)}>{children}</div>
    </FieldSet>
  )
}

export { ChoiceControlField }
