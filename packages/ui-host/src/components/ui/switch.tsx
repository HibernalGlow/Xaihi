import * as React from "react"
import * as SwitchPrimitive from "@radix-ui/react-switch"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

function Switch({
  className,
  size = "default",
  variant = "expressive",
  showIcon = false,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
  variant?: "legacy" | "expressive"
  showIcon?: boolean
}) {
  const expressive = variant === "expressive"
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      data-variant={variant}
      className={cn(
        expressive
          ? "peer group/switch !inline-flex !shrink-0 !items-center !rounded-full !border-2 !p-0 !leading-none !shadow-xs transition-all outline-none focus-visible:!border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:!h-8 data-[size=default]:!w-[52px] data-[size=sm]:!h-6 data-[size=sm]:!w-10 data-[state=checked]:!border-primary data-[state=checked]:!bg-primary data-[state=unchecked]:!border-outline data-[state=unchecked]:!bg-surface-container-high"
          : "peer group/switch !inline-flex !shrink-0 !items-center !rounded-full !border !p-0 !leading-none !shadow-xs transition-all outline-none focus-visible:!border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:!h-[1.15rem] data-[size=default]:!w-8 data-[size=sm]:!h-3.5 data-[size=sm]:!w-6 data-[state=checked]:!border-primary data-[state=checked]:!bg-primary data-[state=unchecked]:!border-input data-[state=unchecked]:!bg-muted",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          expressive
            ? "pointer-events-none relative block !rounded-full !bg-background ring-0 transition-all group-data-[size=default]/switch:!size-4 group-data-[size=sm]/switch:!size-3 group-data-[state=unchecked]/switch:h-4 group-data-[state=checked]/switch:h-6 group-data-[state=checked]/switch:translate-x-[20px] group-data-[state=unchecked]/switch:translate-x-0 group-active/switch:w-7 group-active/switch:rounded-[12px]"
            : "pointer-events-none block !rounded-full !bg-background ring-0 transition-transform group-data-[size=default]/switch:!size-4 group-data-[size=sm]/switch:!size-3 data-[state=checked]:!translate-x-[calc(100%-2px)] data-[state=unchecked]:!translate-x-0 dark:data-[state=checked]:!bg-primary-foreground dark:data-[state=unchecked]:!bg-foreground",
        )}
      >
        {showIcon ? <Check data-slot="switch-icon" className="absolute inset-0 m-auto size-3" aria-hidden="true" /> : null}
      </SwitchPrimitive.Thumb>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
