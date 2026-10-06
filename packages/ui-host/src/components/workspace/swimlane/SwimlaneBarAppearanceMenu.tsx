import {
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu"
import { BarHandleGlyph } from "./BarHandleGlyph"
import type { SwimlaneBarHandlePosition, SwimlaneBarHandleStyle } from "./model"

const HANDLE_STYLES: readonly { value: SwimlaneBarHandleStyle; label: string }[] = [
  { value: "grip", label: "六点" },
  { value: "groove", label: "三槽" },
  { value: "move", label: "四向" },
  { value: "grab", label: "抓手" },
  { value: "edge", label: "短轨" },
]

export function SwimlaneBarAppearanceMenu({ style, position, onStyleChange, onPositionChange }: {
  style: SwimlaneBarHandleStyle
  position: SwimlaneBarHandlePosition
  onStyleChange(style: SwimlaneBarHandleStyle): void
  onPositionChange(position: SwimlaneBarHandlePosition): void
}) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <BarHandleGlyph style={style} horizontal />
        <span>操作栏外观</span>
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="w-40">
        <ContextMenuLabel>拖拽手柄样式</ContextMenuLabel>
        <ContextMenuRadioGroup value={style} onValueChange={(value) => onStyleChange(value as SwimlaneBarHandleStyle)}>
          {HANDLE_STYLES.map((item) => (
            <ContextMenuRadioItem key={item.value} value={item.value} onSelect={(event) => event.preventDefault()}>
              <BarHandleGlyph style={item.value} horizontal />
              <span>{item.label}</span>
            </ContextMenuRadioItem>
          ))}
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuLabel>手柄位置</ContextMenuLabel>
        <ContextMenuRadioGroup value={position} onValueChange={(value) => onPositionChange(value as SwimlaneBarHandlePosition)}>
          <ContextMenuRadioItem value="left" onSelect={(event) => event.preventDefault()}>左侧</ContextMenuRadioItem>
          <ContextMenuRadioItem value="right" onSelect={(event) => event.preventDefault()}>右侧</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      </ContextMenuSubContent>
    </ContextMenuSub>
  )
}
