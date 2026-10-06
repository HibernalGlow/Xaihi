/**
 * Vendored from PieMenu — joaopmarques/pie-menu, distributed as the shadcn registry
 * item `@jpmarques/pie-menu` (https://piemenu.jpmarqu.es/r/pie-menu.json), MIT licensed.
 * Fetched 2026-10-06. Third-party surface is react / react-dom / radix-ui only, all of
 * which this repo already carries, so this adds no dependency.
 *
 * Kept byte-identical to upstream on purpose: the pie geometry (centered wedges,
 * disabled-item aiming, measured extents + viewport clamping) is the reason it is used
 * instead of the repo's own first attempt. Any local change here must be recorded below.
 *
 * Departures from upstream: none.
 */
"use client"

import type { ComponentProps } from "react"

import * as PieMenuPrimitive from "@/lib/pie-menu/primitive"
import { cn } from "@/lib/utils"

const EASE_OUT = "ease-[cubic-bezier(0.22,1,0.36,1)]"

function PieMenu(props: PieMenuPrimitive.PieMenuProps) {
  return <PieMenuPrimitive.Root {...props} />
}

function PieMenuTrigger({
  className,
  ...props
}: PieMenuPrimitive.PieMenuTriggerProps) {
  return (
    <PieMenuPrimitive.Trigger
      data-slot="pie-menu-trigger"
      className={cn(
        "select-none [-webkit-touch-callout:none] data-[open-on=press]:touch-none",
        className
      )}
      {...props}
    />
  )
}

function PieMenuContent({
  className,
  overlayProps,
  ...props
}: PieMenuPrimitive.PieMenuContentProps) {
  return (
    <PieMenuPrimitive.Content
      data-slot="pie-menu-content"
      className={cn("group/pie-menu outline-none", className)}
      overlayProps={
        {
          "data-slot": "pie-menu-overlay",
          ...overlayProps,
          className: cn("z-50", overlayProps?.className),
        } as ComponentProps<"div">
      }
      {...props}
    />
  )
}

function PieMenuItem({
  className,
  variant = "default",
  ...props
}: PieMenuPrimitive.PieMenuItemProps & {
  variant?: "default" | "destructive"
}) {
  return (
    <PieMenuPrimitive.Item
      data-slot="pie-menu-item"
      data-variant={variant}
      className={cn(
        // Base look: a shadcn/ui popover pill.
        "z-10 flex h-9 cursor-default items-center gap-2 rounded-full border bg-popover px-3.5 text-sm font-medium whitespace-nowrap text-popover-foreground shadow-md outline-hidden select-none",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        // Position on the ring, and motion between states.
        "[translate:var(--pie-item-translate)] transition-[translate,scale,opacity,background-color,color,border-color,box-shadow] duration-200",
        EASE_OUT,
        // Highlight. Items float over any background, so the highlight uses the strong primary pair.
        "data-highlighted:scale-105 data-highlighted:border-primary data-highlighted:bg-primary data-highlighted:text-primary-foreground data-highlighted:shadow-lg data-highlighted:[&_svg:not([class*='text-'])]:text-primary-foreground",
        "data-[variant=destructive]:text-destructive data-[variant=destructive]:[&_svg:not([class*='text-'])]:text-destructive",
        "data-[variant=destructive]:data-highlighted:border-destructive data-[variant=destructive]:data-highlighted:bg-destructive data-[variant=destructive]:data-highlighted:text-white data-[variant=destructive]:data-highlighted:[&_svg:not([class*='text-'])]:text-white",
        "data-disabled:opacity-50",
        // Enter: grow out of the center, one item after another.
        "group-data-entering/pie-menu:delay-[calc(var(--pie-item-index)*16ms)]",
        "group-data-starting-style/pie-menu:opacity-0 motion-safe:group-data-starting-style/pie-menu:[translate:-50%_-50%] motion-safe:group-data-starting-style/pie-menu:scale-50",
        // An item added while the menu is open grows out of the center on its own.
        "data-starting-style:opacity-0 motion-safe:data-starting-style:[translate:-50%_-50%] motion-safe:data-starting-style:scale-50",
        // Exit: the chosen item lingers and swells, the others fold back in.
        "group-data-ending-style/pie-menu:opacity-0",
        "group-data-ending-style/pie-menu:not-data-selected:duration-150 motion-safe:group-data-ending-style/pie-menu:not-data-selected:[translate:-50%_-50%] motion-safe:group-data-ending-style/pie-menu:not-data-selected:scale-75",
        "group-data-ending-style/pie-menu:data-selected:duration-300 motion-safe:group-data-ending-style/pie-menu:data-selected:scale-110",
        className
      )}
      {...props}
    />
  )
}

function PieMenuCenter({
  className,
  ...props
}: ComponentProps<typeof PieMenuPrimitive.Center>) {
  return (
    <PieMenuPrimitive.Center
      data-slot="pie-menu-center"
      className={cn(
        "grid -translate-1/2 place-items-center transition-[opacity,scale] duration-200",
        EASE_OUT,
        "group-data-starting-style/pie-menu:opacity-0 motion-safe:group-data-starting-style/pie-menu:scale-75",
        "group-data-ending-style/pie-menu:opacity-0 group-data-ending-style/pie-menu:duration-200 motion-safe:group-data-ending-style/pie-menu:scale-90",
        className
      )}
      {...props}
    />
  )
}

/** A ring around the dead zone with an arc that turns toward the highlighted item. */
function PieMenuIndicator({
  className,
  children,
  ...props
}: ComponentProps<typeof PieMenuPrimitive.Indicator>) {
  return (
    <PieMenuPrimitive.Indicator
      data-slot="pie-menu-indicator"
      className={cn(
        "group/pie-indicator pointer-events-none size-[calc(var(--pie-dead-zone)*2_+_16px)] -translate-1/2 text-primary",
        "[rotate:var(--pie-indicator-rotate)] transition-[rotate,opacity,scale] duration-200 motion-reduce:transition-[opacity]",
        EASE_OUT,
        "group-data-ending-style/pie-menu:opacity-0 group-data-ending-style/pie-menu:duration-100 group-data-starting-style/pie-menu:opacity-0",
        className
      )}
      {...props}
    >
      {children ?? (
        <svg
          viewBox="0 0 100 100"
          className="size-full overflow-visible drop-shadow-sm"
          fill="none"
        >
          <circle
            cx="50"
            cy="50"
            r="44"
            className="fill-popover stroke-border"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M29.34 11.15 A44 44 0 0 1 70.66 11.15"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            className="opacity-0 transition-opacity duration-150 group-data-visible/pie-indicator:opacity-100"
          />
        </svg>
      )}
    </PieMenuPrimitive.Indicator>
  )
}

const usePieMenuAim = PieMenuPrimitive.usePieMenuAim

export {
  PieMenu,
  PieMenuTrigger,
  PieMenuContent,
  PieMenuItem,
  PieMenuCenter,
  PieMenuIndicator,
  usePieMenuAim,
}
