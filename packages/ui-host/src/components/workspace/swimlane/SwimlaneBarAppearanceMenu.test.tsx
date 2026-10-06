// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { SwimlaneBarAppearanceMenu } from "./SwimlaneBarAppearanceMenu"

describe("SwimlaneBarAppearanceMenu", () => {
  it("opens a native submenu on hover and keeps direct appearance choices available", async () => {
    const onStyleChange = vi.fn()
    const onPositionChange = vi.fn()
    render(
      <ContextMenu>
        <ContextMenuTrigger asChild><button type="button">操作栏</button></ContextMenuTrigger>
        <ContextMenuContent>
          <SwimlaneBarAppearanceMenu
            style="grip"
            position="left"
            onStyleChange={onStyleChange}
            onPositionChange={onPositionChange}
          />
        </ContextMenuContent>
      </ContextMenu>,
    )

    fireEvent.contextMenu(screen.getByRole("button", { name: "操作栏" }), { clientX: 40, clientY: 40 })
    const appearance = await screen.findByRole("menuitem", { name: "操作栏外观" })
    fireEvent.pointerMove(appearance, { pointerType: "mouse" })
    await waitFor(() => expect(screen.getByRole("menuitemradio", { name: "三槽" })).toBeTruthy())

    fireEvent.click(screen.getByRole("menuitemradio", { name: "三槽" }))
    fireEvent.click(screen.getByRole("menuitemradio", { name: "右侧" }))
    expect(onStyleChange).toHaveBeenCalledWith("groove")
    expect(onPositionChange).toHaveBeenCalledWith("right")
  })
})
