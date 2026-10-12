import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { CompactViewSwitch } from "@/components/workspace/CompactViewSwitch"
import type { CardLayout, ViewMode } from "@/types/workspace"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, options?: { name?: string }) => options?.name ?? key }),
}))

const CardsIcon = () => <svg data-testid="icon-cards" />
const FlowIcon = () => <svg data-testid="icon-flow" />
const LaneIcon = () => <svg data-testid="icon-lane" />
const FocusIcon = () => <svg data-testid="icon-focus" />
const TrellisIcon = () => <svg data-testid="icon-trellis" />

const views = [
  { key: "cards" as ViewMode, labelKey: "topbar:viewMode.cards", hintKey: "topbar:viewMode.cardsHint", icon: CardsIcon },
  { key: "flow" as ViewMode, labelKey: "topbar:viewMode.flow", hintKey: "topbar:viewMode.flowHint", icon: FlowIcon },
  { key: "lane" as ViewMode, labelKey: "topbar:viewMode.lane", hintKey: "topbar:viewMode.laneHint", icon: LaneIcon },
]

const layouts = [
  { key: "focus" as CardLayout, labelKey: "topbar:cardLayout.focus", hintKey: "topbar:cardLayout.focusHint", icon: FocusIcon },
  { key: "trellis" as CardLayout, labelKey: "topbar:cardLayout.trellis", hintKey: "topbar:cardLayout.trellisHint", icon: TrellisIcon },
]

afterEach(cleanup)

describe("CompactViewSwitch trigger icon", () => {
  it("renders the child layout icon instead of main cards icon when in cards mode with trellis layout", () => {
    render(
      <CompactViewSwitch
        viewMode="cards"
        cardLayout="trellis"
        views={views}
        layouts={layouts}
        onView={vi.fn()}
        onLayout={vi.fn()}
      />
    )
    const trigger = screen.getByTestId("compact-view-switch")
    expect(trigger.querySelector('[data-testid="icon-trellis"]')).not.toBeNull()
    expect(trigger.querySelector('[data-testid="icon-cards"]')).toBeNull()
  })

  it("renders the focus icon when in cards mode with focus layout", () => {
    render(
      <CompactViewSwitch
        viewMode="cards"
        cardLayout="focus"
        views={views}
        layouts={layouts}
        onView={vi.fn()}
        onLayout={vi.fn()}
      />
    )
    const trigger = screen.getByTestId("compact-view-switch")
    expect(trigger.querySelector('[data-testid="icon-focus"]')).not.toBeNull()
    expect(trigger.querySelector('[data-testid="icon-cards"]')).toBeNull()
  })

  it("updates the trigger icon when switching cardLayout", () => {
    const { rerender } = render(
      <CompactViewSwitch
        viewMode="cards"
        cardLayout="focus"
        views={views}
        layouts={layouts}
        onView={vi.fn()}
        onLayout={vi.fn()}
      />
    )
    let trigger = screen.getByTestId("compact-view-switch")
    expect(trigger.querySelector('[data-testid="icon-focus"]')).not.toBeNull()

    rerender(
      <CompactViewSwitch
        viewMode="cards"
        cardLayout="trellis"
        views={views}
        layouts={layouts}
        onView={vi.fn()}
        onLayout={vi.fn()}
      />
    )
    trigger = screen.getByTestId("compact-view-switch")
    expect(trigger.querySelector('[data-testid="icon-trellis"]')).not.toBeNull()
    expect(trigger.querySelector('[data-testid="icon-focus"]')).toBeNull()
    expect(trigger.querySelector('[data-testid="icon-cards"]')).toBeNull()
  })

  it("renders main view icon when not in cards mode", () => {
    const { rerender } = render(
      <CompactViewSwitch
        viewMode="flow"
        cardLayout="trellis"
        views={views}
        layouts={layouts}
        onView={vi.fn()}
        onLayout={vi.fn()}
      />
    )
    let trigger = screen.getByTestId("compact-view-switch")
    expect(trigger.querySelector('[data-testid="icon-flow"]')).not.toBeNull()
    expect(trigger.querySelector('[data-testid="icon-trellis"]')).toBeNull()

    rerender(
      <CompactViewSwitch
        viewMode="lane"
        cardLayout="trellis"
        views={views}
        layouts={layouts}
        onView={vi.fn()}
        onLayout={vi.fn()}
      />
    )
    trigger = screen.getByTestId("compact-view-switch")
    expect(trigger.querySelector('[data-testid="icon-lane"]')).not.toBeNull()
    expect(trigger.querySelector('[data-testid="icon-trellis"]')).toBeNull()
  })
})
