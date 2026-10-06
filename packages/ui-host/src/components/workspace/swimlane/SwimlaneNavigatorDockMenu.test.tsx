// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu"
import { SwimlaneNavigatorDockMenu } from "./SwimlaneNavigatorDockMenu"

describe("SwimlaneNavigatorDockMenu", () => {
  it("opens four dock choices on hover and keeps follow-focus independent", async () => {
    const onDockChange = vi.fn()
    const onFollowsFocusChange = vi.fn()
    render(<ContextMenu>
      <ContextMenuTrigger asChild><button type="button">操作栏</button></ContextMenuTrigger>
      <ContextMenuContent>
        <SwimlaneNavigatorDockMenu dock="floating" followsFocus={false} onDockChange={onDockChange} onFollowsFocusChange={onFollowsFocusChange} />
      </ContextMenuContent>
    </ContextMenu>)

    fireEvent.contextMenu(screen.getByRole("button", { name: "操作栏" }), { clientX: 40, clientY: 40 })
    const dockMenu = await screen.findByRole("menuitem", { name: "固定位置" })
    fireEvent.pointerMove(dockMenu, { pointerType: "mouse" })
    await waitFor(() => expect(screen.getByRole("menuitemradio", { name: "固定到顶部" })).toBeTruthy())
    fireEvent.click(screen.getByRole("menuitemradio", { name: "固定到顶部" }))
    fireEvent.contextMenu(screen.getByRole("button", { name: "操作栏" }), { clientX: 40, clientY: 40 })
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "固定栏跟随聚焦泳道" }))

    expect(onDockChange).toHaveBeenCalledWith("top")
    expect(onFollowsFocusChange).toHaveBeenCalledWith(true)
  })
})
