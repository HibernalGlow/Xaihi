import { ContextMenuCheckboxItem, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger } from "@/components/ui/context-menu"
import { PanelBottom, PanelLeft, PanelRight, PanelTop, Pin } from "lucide-react"
import type { SwimlaneNavigatorDock } from "./model"

const DOCK_OPTIONS: Array<{ value: Exclude<SwimlaneNavigatorDock, "floating">; label: string; icon: typeof PanelLeft }> = [
  { value: "left", label: "固定到左侧", icon: PanelLeft },
  { value: "right", label: "固定到右侧", icon: PanelRight },
  { value: "top", label: "固定到顶部", icon: PanelTop },
  { value: "bottom", label: "固定到底部", icon: PanelBottom },
]

export function SwimlaneNavigatorDockMenu({ dock, followsFocus, allowedDocks, onDockChange, onFollowsFocusChange }: {
  dock: SwimlaneNavigatorDock
  followsFocus: boolean
  allowedDocks?: readonly Exclude<SwimlaneNavigatorDock, "floating">[]
  onDockChange(dock: SwimlaneNavigatorDock): void
  onFollowsFocusChange(enabled: boolean): void
}) {
  const options = DOCK_OPTIONS.filter((option) => !allowedDocks || allowedDocks.includes(option.value))
  return <>
    <ContextMenuSub>
      <ContextMenuSubTrigger><Pin /><span>固定位置</span></ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-40">
        <ContextMenuRadioGroup value={dock === "floating" ? "floating" : dock} onValueChange={(value) => onDockChange(value as SwimlaneNavigatorDock)}>
          <ContextMenuRadioItem value="floating">悬浮</ContextMenuRadioItem>
          {options.map(({ value, label, icon: Icon }) => <ContextMenuRadioItem key={value} value={value}><Icon /><span>{label}</span></ContextMenuRadioItem>)}
        </ContextMenuRadioGroup>
      </ContextMenuSubContent>
    </ContextMenuSub>
    <ContextMenuCheckboxItem checked={followsFocus} onCheckedChange={(checked) => onFollowsFocusChange(checked === true)}>固定栏跟随聚焦泳道</ContextMenuCheckboxItem>
  </>
}
