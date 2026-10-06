// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import {
  ContextMenuProvider,
  type ContextMenuItemDef,
} from "./ContextMenuProvider"
import { useContextMenuBuilder } from "./context"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe("ContextMenuProvider", () => {
  test("[neoview.context-menu.keyboard] opens the focused target from Shift+F10", async () => {
    render(<ContextMenuProvider><ContextTarget onSelect={vi.fn()} /></ContextMenuProvider>)
    const target = screen.getByText("Target")
    target.setAttribute("tabindex", "0")
    target.focus()

    fireEvent.keyDown(target, { key: "F10", shiftKey: true })

    expect(await screen.findByRole("menuitem", { name: /Open target/ })).toBeTruthy()
  })

  test("[neoview.context-menu.lifecycle] restores the previous builder when a newer registration with the same scope unmounts", async () => {
    const view = render(
      <ContextMenuProvider>
        <div data-context-menu="stacked" data-testid="stacked-target">Target</div>
        <StackedBuilder key="first" label="First action" />
        <StackedBuilder key="second" label="Second action" />
      </ContextMenuProvider>,
    )
    fireEvent.contextMenu(screen.getByTestId("stacked-target"))
    expect(await screen.findByText("Second action")).toBeTruthy()
    fireEvent.keyDown(document, { key: "Escape" })
    await waitFor(() => expect(screen.queryByText("Second action")).toBeNull())

    view.rerender(
      <ContextMenuProvider>
        <div data-context-menu="stacked" data-testid="stacked-target">Target</div>
        <StackedBuilder key="first" label="First action" />
      </ContextMenuProvider>,
    )
    fireEvent.contextMenu(screen.getByTestId("stacked-target"))
    expect(await screen.findByText("First action")).toBeTruthy()
  })

  test("opens a registered context menu and runs the selected item", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(
      <ContextMenuProvider>
        <ContextTarget onSelect={onSelect} />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("context-target"), {
      clientX: 48,
      clientY: 64,
    })

    expect(await screen.findByText("Open target")).toBeTruthy()
    await user.click(screen.getByText("Open target"))

    expect(onSelect).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByText("Open target")).toBeNull())

    fireEvent.contextMenu(screen.getByTestId("context-target"), { clientX: 24, clientY: 32 })
    expect(await screen.findByText("Open target")).toBeTruthy()
  })

  test("[neoview.context-menu.keyboard-position] positions a keyboard-triggered context menu at the target center", async () => {
    render(<ContextMenuProvider><ContextTarget onSelect={vi.fn()} /></ContextMenuProvider>)
    const target = screen.getByTestId("context-target")
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      x: 100, y: 40, left: 100, top: 40, right: 300, bottom: 120, width: 200, height: 80, toJSON: () => ({}),
    })

    fireEvent.contextMenu(target, { clientX: 0, clientY: 0 })

    await screen.findByText("Open target")
    const anchor = document.querySelector<HTMLElement>('[data-context-menu-anchor="true"]')!
    expect(anchor.style.left).toBe("200px")
    expect(anchor.style.top).toBe("80px")
  })

  test("disabled item does not call its handler", async () => {
    const onDisabled = vi.fn()
    const onOk = vi.fn()
    const user = userEvent.setup()

    render(
      <ContextMenuProvider>
        <ContextTarget
          items={[
            { label: "Disabled", disabled: true, onSelect: onDisabled },
            { label: "OK", onSelect: onOk },
          ]}
        />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("context-target"), {
      clientX: 10,
      clientY: 10,
    })

    // Disabled items render with disabled state. Clicking should not invoke handler.
    const disabledItem = await screen.findByText("Disabled")
    // Radix renders disabled items with data-disabled; click is a no-op.
    await user.click(disabledItem)
    expect(onDisabled).not.toHaveBeenCalled()

    // Menu stays open; click OK to close.
    await user.click(screen.getByText("OK"))
    expect(onOk).toHaveBeenCalledTimes(1)
  })

  test("hidden items are not rendered", async () => {
    render(
      <ContextMenuProvider>
        <ContextTarget
          items={[
            { label: "Visible", onSelect: vi.fn() },
            { label: "Hidden", hidden: true, onSelect: vi.fn() },
          ]}
        />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("context-target"), {
      clientX: 10,
      clientY: 10,
    })

    await screen.findByText("Visible")
    expect(screen.queryByText("Hidden")).toBeNull()
  })

  test("consecutive separators are collapsed and leading/trailing separators trimmed", async () => {
    render(
      <ContextMenuProvider>
        <ContextTarget
          items={[
            { type: "separator" },
            { type: "separator" },
            { label: "First", onSelect: vi.fn() },
            { type: "separator" },
            { type: "separator" },
            { label: "Second", onSelect: vi.fn() },
            { type: "separator" },
          ]}
        />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("context-target"), {
      clientX: 10,
      clientY: 10,
    })

    await screen.findByText("First")
    await screen.findByText("Second")
    // Exactly one separator between First and Second — represented by a single
    // separator element. We assert that the menu rendered both items and that
    // no leading/trailing separator was emitted.
    const separators = document.querySelectorAll("[data-slot='dropdown-menu-separator']")
    expect(separators.length).toBe(1)
  })

  test("checkbox item calls onCheckedChange with new value", async () => {
    const onCheckedChange = vi.fn()
    const user = userEvent.setup()

    render(
      <ContextMenuProvider>
        <ContextTarget
          items={[
            {
              type: "checkbox",
              label: "Toggle me",
              checked: false,
              onCheckedChange,
            },
          ]}
        />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("context-target"), {
      clientX: 10,
      clientY: 10,
    })

    await user.click(await screen.findByText("Toggle me"))
    expect(onCheckedChange).toHaveBeenCalledTimes(1)
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  test("radio group renders a single group and calls onRadioChange", async () => {
    const onRadioChange = vi.fn()
    const user = userEvent.setup()

    render(
      <ContextMenuProvider>
        <ContextTarget
          items={[
            {
              type: "radio",
              radioGroup: "color",
              radioValue: "red",
              onRadioChange,
              value: "red",
              label: "Red",
            },
            {
              type: "radio",
              radioGroup: "color",
              value: "blue",
              label: "Blue",
            },
          ]}
        />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("context-target"), {
      clientX: 10,
      clientY: 10,
    })

    // Both options present.
    await screen.findByText("Red")
    await screen.findByText("Blue")

    // Exactly one radio group element.
    const groups = document.querySelectorAll("[data-slot='dropdown-menu-radio-group']")
    expect(groups.length).toBe(1)

    // Selecting Blue should call onRadioChange with "blue".
    await user.click(screen.getByText("Blue"))
    expect(onRadioChange).toHaveBeenCalledTimes(1)
    expect(onRadioChange).toHaveBeenCalledWith("blue")
  })

  test("submenu renders its children", async () => {
    const user = userEvent.setup()

    render(
      <ContextMenuProvider>
        <ContextTarget
          items={[
            {
              label: "Parent",
              children: [{ label: "Sub item", onSelect: vi.fn() }],
            },
          ]}
        />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("context-target"), {
      clientX: 10,
      clientY: 10,
    })

    // Submenu trigger is visible.
    await screen.findByText("Parent")

    // Hovering the trigger opens the sub content in Radix.
    await user.hover(screen.getByText("Parent"))
    // Sub content should now render (possibly after a small delay).
    await waitFor(() => {
      expect(screen.getByText("Sub item")).toBeTruthy()
    })
  })

  test("icon-row renders compact icon-only actions", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(
      <ContextMenuProvider>
        <ContextTarget
          items={[
            {
              type: "icon-row",
              id: "demo-icons",
              label: "Quick",
              children: [
                { id: "copy", label: "复制", onSelect },
                { id: "cut", label: "剪切", onSelect },
              ],
            },
          ]}
        />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("context-target"), {
      clientX: 10,
      clientY: 10,
    })

    const row = await screen.findByRole("group", { name: "Quick" })
    expect(row.getAttribute("data-context-menu-icon-row")).toBe("demo-icons")
    expect(row.className).toContain("justify-start")
    expect(row.className).not.toContain("justify-between")
    const content = document.querySelector<HTMLElement>('[data-slot="dropdown-menu-content"]')
    expect(content?.className).toMatch(/max-w-\[15rem\]/)
    await user.click(screen.getByRole("menuitem", { name: "复制" }))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  test("long labels truncate inside a capped menu width", async () => {
    render(
      <ContextMenuProvider>
        <ContextTarget
          items={[
            {
              type: "icon-row",
              id: "icons",
              label: "Quick",
              children: [
                { id: "a", label: "A", onSelect: vi.fn() },
                { id: "b", label: "B", onSelect: vi.fn() },
              ],
            },
            {
              type: "label",
              label: "(2017.05) (COMIC ExE 07) Extremely Long Archive Name That Must Not Stretch The Menu.zip",
            },
          ]}
        />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("context-target"), {
      clientX: 10,
      clientY: 10,
    })

    const footer = await screen.findByText(/Extremely Long Archive Name/)
    expect(footer.className).toContain("truncate")
    expect(document.querySelector('[data-slot="dropdown-menu-content"]')?.className).toMatch(/max-w-\[15rem\]/)
  })

  test("editable target keeps native context menu (no custom menu opens)", async () => {
    const onSelect = vi.fn()

    render(
      <ContextMenuProvider>
        <ContextTargetWithInput onSelect={onSelect} />
      </ContextMenuProvider>,
    )

    const input = screen.getByTestId("editable-input")
    fireEvent.contextMenu(input, { clientX: 10, clientY: 10 })

    // No custom menu content should appear.
    await waitFor(() => {
      expect(screen.queryByText("Open target")).toBeNull()
    })
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("editable target via role=textbox also keeps native menu", async () => {
    const onSelect = vi.fn()

    render(
      <ContextMenuProvider>
        <ContextTargetWithRoleTextbox onSelect={onSelect} />
      </ContextMenuProvider>,
    )

    const div = screen.getByTestId("role-textbox")
    fireEvent.contextMenu(div, { clientX: 10, clientY: 10 })

    await waitFor(() => {
      expect(screen.queryByText("Open target")).toBeNull()
    })
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("tldraw canvas keeps its own context menu instead of workspace menu", async () => {
    const onSelect = vi.fn()

    render(
      <ContextMenuProvider>
        <TldrawCanvasTarget onWorkspaceSelect={onSelect} />
      </ContextMenuProvider>,
    )

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    })
    screen.getByTestId("tldraw-canvas").dispatchEvent(event)

    await waitFor(() => {
      expect(screen.queryByText("Workspace action")).toBeNull()
    })
    expect(event.defaultPrevented).toBe(false)
    expect(onSelect).not.toHaveBeenCalled()
  })

  test("project menu scopes inside tldraw still open the project menu", async () => {
    render(
      <ContextMenuProvider>
        <TldrawFlowNodeTarget />
      </ContextMenuProvider>,
    )

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    })
    screen.getByTestId("flow-node-target").dispatchEvent(event)

    expect(await screen.findByText("Flow node action")).toBeTruthy()
    expect(event.defaultPrevented).toBe(true)
  })

  test("data-context-menu-stop keeps node menus and blocks host ancestor menus", async () => {
    render(
      <ContextMenuProvider>
        <HostCardWithNodeBoundary />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("node-entry"), {
      clientX: 12,
      clientY: 18,
    })

    expect(await screen.findByText("Node entry action")).toBeTruthy()
    expect(screen.queryByText("Host focus")).toBeNull()
  })

  test("data-context-menu-stop on empty node surface blocks host menus entirely", async () => {
    render(
      <ContextMenuProvider>
        <HostCardWithNodeBoundary />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("node-surface"), {
      clientX: 12,
      clientY: 18,
    })

    await waitFor(() => {
      expect(screen.queryByText("Host focus")).toBeNull()
      expect(screen.queryByText("Node entry action")).toBeNull()
    })
  })

  test("confirm dialog requires confirmation before running onSelect", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()

    render(
      <ContextMenuProvider>
        <ContextTarget
          items={[
            {
              label: "Delete",
              destructive: true,
              confirm: {
                title: "Delete component?",
                description: "This removes the component.",
                confirmLabel: "Delete",
                cancelLabel: "Cancel",
              },
              onSelect,
            },
          ]}
        />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("context-target"), {
      clientX: 10,
      clientY: 10,
    })

    // Click Delete in the menu.
    await user.click(await screen.findByText("Delete"))

    // Confirm dialog appears.
    await screen.findByText("Delete component?")
    expect(onSelect).not.toHaveBeenCalled()

    // Confirm.
    await user.click(screen.getByText("Delete"))
    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  test("[neoview.context-menu.confirm-focus] restores the trigger focus after cancelling confirmation", async () => {
    const user = userEvent.setup()
    render(
      <ContextMenuProvider>
        <ContextTarget items={[{
          label: "Delete",
          destructive: true,
          confirm: { title: "Delete component?", cancelLabel: "Cancel" },
          onSelect: vi.fn(),
        }]} />
      </ContextMenuProvider>,
    )
    const target = screen.getByTestId("context-target")
    target.setAttribute("tabindex", "0")
    target.focus()
    fireEvent.contextMenu(target, { clientX: 10, clientY: 10 })
    await user.click(await screen.findByText("Delete"))
    await user.click(await screen.findByText("Cancel"))
    await waitFor(() => expect(document.activeElement).toBe(target))
  })

  test("keepOpen keeps menu open after selecting item", async () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()

    render(
      <ContextMenuProvider>
        <KeepOpenTarget onSelect={onSelect} onClose={onClose} />
      </ContextMenuProvider>,
    )

    fireEvent.contextMenu(screen.getByTestId("context-target"), {
      clientX: 10,
      clientY: 10,
    })

    await user.click(await screen.findByText("Persistent"))
    expect(onSelect).toHaveBeenCalledTimes(1)
    // Menu should still be open.
    expect(screen.getByText("Persistent")).toBeTruthy()
  })
})

function ContextTarget({
  onSelect,
  items,
}: {
  onSelect?: () => void
  items?: ContextMenuItemDef[]
}) {
  useContextMenuBuilder("target", () => items ?? [{ label: "Open target", shortcut: "Enter", onSelect }])
  return (
    <div data-context-menu="target" data-testid="context-target">
      Target
    </div>
  )
}

function StackedBuilder({ label }: { label: string }) {
  useContextMenuBuilder("stacked", () => [{ label }])
  return null
}

function ContextTargetWithInput({ onSelect }: { onSelect: () => void }) {
  useContextMenuBuilder("target", () => [{ label: "Open target", onSelect }])
  return (
    <div data-context-menu="target" data-testid="context-target">
      <input data-testid="editable-input" defaultValue="text" />
    </div>
  )
}

function ContextTargetWithRoleTextbox({ onSelect }: { onSelect: () => void }) {
  useContextMenuBuilder("target", () => [{ label: "Open target", onSelect }])
  return (
    <div data-context-menu="target" data-testid="context-target">
      <div data-testid="role-textbox" role="textbox" contentEditable suppressContentEditableWarning>
        editable
      </div>
    </div>
  )
}

function TldrawCanvasTarget({ onWorkspaceSelect }: { onWorkspaceSelect: () => void }) {
  useContextMenuBuilder("workspace-canvas", () => [{ label: "Workspace action", onSelect: onWorkspaceSelect }])
  return (
    <div data-context-menu="workspace-canvas">
      <div className="tl-container" data-testid="tldraw-canvas">
        tldraw
      </div>
    </div>
  )
}

function TldrawFlowNodeTarget() {
  useContextMenuBuilder("flow-node", () => [{ label: "Flow node action", onSelect: vi.fn() }])
  return (
    <div data-context-menu="workspace-canvas">
      <div className="tl-container">
        <div data-context-menu="flow-node" data-testid="flow-node-target">
          flow node
        </div>
      </div>
    </div>
  )
}

function KeepOpenTarget({ onSelect, onClose }: { onSelect: () => void; onClose: () => void }) {
  useContextMenuBuilder("target", () => [
    { label: "Persistent", keepOpen: true, onSelect },
    { label: "Close", onSelect: onClose },
  ])
  return (
    <div data-context-menu="target" data-testid="context-target">
      Target
    </div>
  )
}

function HostCardWithNodeBoundary() {
  useContextMenuBuilder("component-card", () => [{ label: "Host focus", onSelect: vi.fn() }])
  useContextMenuBuilder("node-entry", () => [{ label: "Node entry action", onSelect: vi.fn() }])
  return (
    <div data-context-menu="component-card" data-testid="host-card">
      <div data-context-menu-stop="" data-testid="node-surface">
        <button type="button" data-context-menu="node-entry" data-testid="node-entry">
          entry
        </button>
      </div>
    </div>
  )
}
