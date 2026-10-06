import { Columns3 } from "lucide-react"

import { ContextMenuCheckboxItem, ContextMenuItem } from "@/components/ui/context-menu"

export function SwimlaneFitMenuItems({ autoFit, onFit, onAutoFitChange }: {
  autoFit: boolean
  onFit(): void
  onAutoFitChange(enabled: boolean): void
}) {
  return <>
    <ContextMenuItem onSelect={onFit}>
      <Columns3 />
      按当前比例填满视口
    </ContextMenuItem>
    <ContextMenuCheckboxItem checked={autoFit} onCheckedChange={(checked) => onAutoFitChange(checked === true)}>
      常驻按比例适应视口
    </ContextMenuCheckboxItem>
  </>
}
