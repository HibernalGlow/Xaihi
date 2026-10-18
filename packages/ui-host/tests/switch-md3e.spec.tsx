// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { Switch } from "../src/components/ui/switch"

afterEach(cleanup)

describe("Switch Material 3 Expressive Specification", () => {
  test("implements 2025/2026 Material 3 Expressive switch spec with 52x32dp track and handle morphing", () => {
    const { rerender } = render(
      <Switch aria-label="Expressive toggle" checked={false} showIcon onCheckedChange={() => undefined} />,
    )

    const control = screen.getByRole("switch", { name: "Expressive toggle" })
    expect(control.getAttribute("data-state")).toBe("unchecked")
    expect(control.getAttribute("data-variant")).toBe("expressive")
    expect(control.className).toContain("w-[52px]")
    expect(control.className).toContain("h-8")
    expect(control.className).toContain("rounded-full")

    // 检查手柄存在且包含按压弹性拉伸形变类名
    const thumb = control.querySelector('[data-slot="switch-thumb"]')
    expect(thumb).not.toBeNull()
    expect(thumb?.className).toContain("group-data-[state=unchecked]/switch:h-4")
    expect(thumb?.className).toContain("group-active/switch:w-7")
    expect(thumb?.className).toContain("group-active/switch:rounded-[12px]")

    // 切换到 checked
    rerender(
      <Switch aria-label="Expressive toggle" checked={true} showIcon onCheckedChange={() => undefined} />,
    )
    expect(control.getAttribute("data-state")).toBe("checked")
    expect(thumb?.className).toContain("group-data-[state=checked]/switch:h-6")
    expect(thumb?.className).toContain("group-data-[state=checked]/switch:translate-x-[20px]")

    // 检查内嵌图标渲染
    const icon = control.querySelector('[data-slot="switch-icon"]')
    expect(icon).not.toBeNull()
  })

  test("supports compact sm size for space-constrained panels", () => {
    render(<Switch aria-label="Compact toggle" size="sm" checked={false} onCheckedChange={() => undefined} />)
    const control = screen.getByRole("switch", { name: "Compact toggle" })
    expect(control.className).toContain("w-10")
    expect(control.className).toContain("h-6")
  })

  test("maintains legacy variant compatibility for fallback scenarios", () => {
    render(
      <Switch
        variant="legacy"
        aria-label="Legacy preview mode"
        checked={false}
        onCheckedChange={() => undefined}
      />,
    )

    const control = screen.getByRole("switch", { name: "Legacy preview mode" })
    expect(control.getAttribute("data-state")).toBe("unchecked")
    expect(control.className).toContain("data-[state=unchecked]:!border-input")
    expect(control.className).toContain("data-[state=unchecked]:!bg-muted")
    expect(control.className).toContain("data-[size=default]:!h-[1.15rem]")
    expect(control.className).toContain("!p-0")
  })
})
