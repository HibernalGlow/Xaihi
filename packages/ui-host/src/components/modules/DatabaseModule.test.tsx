// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import DatabaseModule from "./DatabaseModule"

vi.mock("./DatabaseDataView", () => ({
  default: ({ compId }: { compId: string }) => (
    <div data-testid="mock-database-data-view">Database data view {compId}</div>
  ),
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === "module:database.loadView") return "Open database view"
      if (key === "module:database.loadingView") return "Loading database view"
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
})

describe("DatabaseModule", () => {
  test("renders a lightweight shell before loading the heavy ocean data view on idle", async () => {
    render(<DatabaseModule compId="comp-database" />)

    expect(screen.queryByTestId("mock-database-data-view")).toBeNull()
    expect(screen.getByRole("button", { name: "Open database view" })).toBeTruthy()

    expect((await screen.findByTestId("mock-database-data-view")).textContent).toContain("comp-database")
  })

  test("loads the data view immediately when the shell is activated", async () => {
    const user = userEvent.setup()
    render(<DatabaseModule compId="comp-database" />)

    await user.click(screen.getByRole("button", { name: "Open database view" }))

    expect(await screen.findByTestId("mock-database-data-view")).toBeTruthy()
  })
})
