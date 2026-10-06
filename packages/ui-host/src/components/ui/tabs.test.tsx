// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs"

afterEach(cleanup)

describe("shared Tabs", () => {
  test("uses the upstream themed tab rail by default and updates the selected tab", async () => {
    render(
      <Tabs defaultValue="plan">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="plan">计划</TabsTrigger>
          <TabsTrigger value="logs">日志</TabsTrigger>
        </TabsList>
        <TabsContent value="plan">计划内容</TabsContent>
        <TabsContent value="logs">日志内容</TabsContent>
      </Tabs>,
    )
    const user = userEvent.setup()
    const list = screen.getByTestId("tabs-list")
    const plan = within(list).getByRole("tab", { name: "计划" })
    const logs = within(list).getByRole("tab", { name: "日志" })

    expect(list.getAttribute("data-variant")).toBe("default")
    expect(list.className).toContain("rounded-lg")
    expect(list.className).toContain("bg-muted")
    expect(plan.getAttribute("aria-selected")).toBe("true")

    await user.click(logs)

    expect(logs.getAttribute("aria-selected")).toBe("true")
    expect(screen.getByText("日志内容")).toBeTruthy()
  })

  test("keeps the official line variant semantic without turning it into a button group", () => {
    render(
      <Tabs defaultValue="tree" orientation="vertical">
        <TabsList variant="line" data-testid="vertical-list">
          <TabsTrigger value="tree">目录</TabsTrigger>
          <TabsTrigger value="issues">问题</TabsTrigger>
        </TabsList>
        <TabsContent value="tree">目录内容</TabsContent>
      </Tabs>,
    )

    const list = screen.getByTestId("vertical-list")
    expect(list.getAttribute("data-variant")).toBe("line")
    expect(list.className).toContain("data-[variant=line]:rounded-none")
    expect(within(list).getByRole("tab", { name: "目录" }).getAttribute("aria-selected")).toBe("true")
  })
})
