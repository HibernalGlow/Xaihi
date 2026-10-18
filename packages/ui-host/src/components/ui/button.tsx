import * as React from "react"
import type { VariantProps } from "class-variance-authority"
import * as Slot from "@radix-ui/react-slot"

import { buttonVariants } from "@/components/ui/button-variants"
import { cn } from "@/lib/utils"
import { useMd3eShapeContext } from "@/nodes/shared/Md3eShapeContext"
import {
  isIconButtonSize,
  mapVariantToMd3eButtonRole,
  type Md3eButtonRole,
} from "@/nodes/shared/md3eShapeSystem"

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** MD3E 同类一致按钮角色覆盖；不传时按 variant 自动归类。 */
    shapeRole?: Md3eButtonRole
  }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, shapeRole, style, ...props }, ref) => {
    const Comp = asChild ? Slot.Root : "button"
    const shapeCtx = useMd3eShapeContext()
    const md3eActive = Boolean(shapeCtx?.enabled)
    const isIcon = isIconButtonSize(size)

    if (!md3eActive || !shapeCtx) {
      return (
        <Comp
          ref={ref}
          data-slot="button"
          data-variant={variant}
          data-size={size}
          style={style}
          className={cn(buttonVariants({ variant, size, className }))}
          {...props}
        />
      )
    }

    if (isIcon) {
      const role = shapeRole ?? mapVariantToMd3eButtonRole(variant)
      const resolved = shapeCtx.resolveIconButtonShape(role, size ?? "icon")
      const mergedStyle: React.CSSProperties = resolved.applyClipPath
        ? { clipPath: resolved.spec.clipPath, ...style }
        : { ...style }

      return (
        <Comp
          ref={ref}
          data-slot="button"
          data-variant={variant}
          data-size={size}
          data-md3e-button-kind="icon"
          data-md3e-shape={resolved.id}
          data-md3e-shape-requested={resolved.requestedId}
          data-md3e-shape-role={role}
          data-md3e-shape-status={resolved.status}
          data-md3e-shape-degraded-reason={resolved.degradedReason ?? undefined}
          style={mergedStyle}
          className={cn(
            buttonVariants({ variant, size }),
            "rounded-full transition-[transform,clip-path,border-radius,background-color] duration-200 ease-[var(--md3-spring-spatial,cubic-bezier(0.2,0,0,1))] active:scale-[0.95] motion-reduce:transition-none motion-reduce:active:scale-100",
            className,
          )}
          {...props}
        />
      )
    }

    return (
      <Comp
        ref={ref}
        data-slot="button"
        data-variant={variant}
        data-size={size}
        data-md3e-button-kind="text"
        data-md3e-shape={variant === "link" ? "link" : "capsule"}
        data-md3e-shape-status="active"
        style={style}
        className={cn(
          buttonVariants({ variant, size }),
          variant !== "link" &&
            "rounded-full active:rounded-[12px] transition-[transform,border-radius,background-color] duration-200 ease-[var(--md3-spring-spatial,cubic-bezier(0.2,0,0,1))] active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100",
          className,
        )}
        {...props}
      />
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
