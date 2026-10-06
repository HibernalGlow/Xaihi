// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import BlockNoteModule from "./BlockNoteModule"
import { useComponentData } from "@/hooks/useComponentData"

const setDataMock = vi.hoisted(() => vi.fn())

vi.mock("@/hooks/useComponentData", () => ({
  useComponentData: vi.fn(() => [{ doc: [{ id: "initial-block", type: "paragraph" }] }, setDataMock]),
}))

vi.mock("./BlockNoteEditor", () => ({
  default: ({ onDocChange }: { onDocChange(doc: unknown[]): void }) => (
    <button
      type="button"
      data-testid="mock-blocknote-editor"
      onClick={() => onDocChange([{ id: "next-block", type: "paragraph" }])}
    >
      Mock BlockNote editor
    </button>
  ),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "module:blocknote.loadEditor") return "Open editor"
      if (key === "module:blocknote.loading") return "Loading editor"
      return key
    },
  }),
}))

type IdleTestWindow = Window & {
  requestIdleCallback?: unknown
  cancelIdleCallback?: unknown
}

const idleWindow = window as IdleTestWindow
const originalRequestIdleCallback = idleWindow.requestIdleCallback
const originalCancelIdleCallback = idleWindow.cancelIdleCallback

beforeEach(() => {
  Object.defineProperty(window, "requestIdleCallback", { configurable: true, value: undefined })
  Object.defineProperty(window, "cancelIdleCallback", { configurable: true, value: undefined })
})

afterEach(() => {
  cleanup()
  Object.defineProperty(window, "requestIdleCallback", { configurable: true, value: originalRequestIdleCallback })
  Object.defineProperty(window, "cancelIdleCallback", { configurable: true, value: originalCancelIdleCallback })
  vi.clearAllMocks()
  setDataMock.mockReset()
})

describe("BlockNoteModule", () => {
  test("renders a lightweight shell before loading the heavy editor on idle", async () => {
    render(<BlockNoteModule compId="comp-blocknote" />)

    expect(screen.queryByTestId("mock-blocknote-editor")).toBeNull()
    expect(screen.getByRole("button", { name: "Open editor" })).toBeTruthy()

    expect(await screen.findByTestId("mock-blocknote-editor")).toBeTruthy()
    expect(useComponentData).toHaveBeenCalledWith("comp-blocknote")
  })

  test("loads the editor immediately when the shell is activated and preserves doc writeback", async () => {
    const user = userEvent.setup()
    render(<BlockNoteModule compId="comp-blocknote" />)

    await user.click(screen.getByRole("button", { name: "Open editor" }))
    const editor = await screen.findByTestId("mock-blocknote-editor")

    await user.click(editor)

    await waitFor(() => expect(setDataMock).toHaveBeenCalledWith({
      doc: [{ id: "next-block", type: "paragraph" }],
    }))
  })
})
