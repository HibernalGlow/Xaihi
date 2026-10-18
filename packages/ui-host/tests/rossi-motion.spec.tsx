// @vitest-environment happy-dom
import * as React from "react"
import { afterEach, describe, expect, test } from "vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { buttonVariants } from "@/components/ui/button-variants"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

afterEach(cleanup)

describe("Rossi-inspired motion mechanics", () => {
  describe("Tab switching & sliding lens indicator", () => {
    test("renders active sliding indicator and transfers smoothly on tab switch", async () => {
      const user = userEvent.setup()
      render(
        <Tabs defaultValue="first">
          <TabsList data-testid="tabs-list">
            <TabsTrigger value="first">Tab 1</TabsTrigger>
            <TabsTrigger value="second">Tab 2</TabsTrigger>
          </TabsList>
          <TabsContent value="first">Content 1</TabsContent>
          <TabsContent value="second">Content 2</TabsContent>
        </Tabs>
      )

      const list = screen.getByTestId("tabs-list")
      const tab1 = within(list).getByRole("tab", { name: "Tab 1" })
      const tab2 = within(list).getByRole("tab", { name: "Tab 2" })

      // Initially Tab 1 is active and contains the indicator lens
      expect(tab1.getAttribute("aria-selected")).toBe("true")
      expect(tab1.querySelector('[data-slot="tabs-indicator"]')).toBeTruthy()
      expect(tab2.querySelector('[data-slot="tabs-indicator"]')).toBeNull()

      // Content 1 has expressive entrance classes
      const content1 = screen.getByText("Content 1")
      expect(content1.className).toContain("data-[state=active]:animate-in")
      expect(content1.className).toContain("data-[state=active]:slide-in-from-bottom-1")

      // Click Tab 2
      await user.click(tab2)

      // Tab 2 is now active and indicator has moved to Tab 2
      expect(tab2.getAttribute("aria-selected")).toBe("true")
      expect(tab2.querySelector('[data-slot="tabs-indicator"]')).toBeTruthy()
      expect(tab1.querySelector('[data-slot="tabs-indicator"]')).toBeNull()
      expect(screen.getByText("Content 2")).toBeTruthy()
    })

    test("line variant renders directional indicator line", () => {
      render(
        <Tabs defaultValue="h" orientation="horizontal">
          <TabsList variant="line" data-testid="line-list">
            <TabsTrigger value="h">Horizontal</TabsTrigger>
          </TabsList>
        </Tabs>
      )
      const tab = screen.getByRole("tab", { name: "Horizontal" })
      const indicator = tab.querySelector('[data-slot="tabs-indicator"]')
      expect(indicator).toBeTruthy()
      expect(indicator?.className).toContain("h-0.5")
      expect(indicator?.className).toContain("-bottom-[5px]")
    })
  })

  describe("Mouse hover & elastic press motion", () => {
    test("buttonVariants and TabsTrigger include Rossi elastic press (active:scale-[0.97]) and smooth timing", () => {
      const btnClass = buttonVariants({ variant: "default" })
      expect(btnClass).toContain("active:scale-[0.97]")
      expect(btnClass).toContain("duration-200")
      expect(btnClass).toContain("ease-[cubic-bezier(0.2,0,0,1)]")

      render(
        <Tabs defaultValue="a">
          <TabsList>
            <TabsTrigger value="a">Trigger</TabsTrigger>
          </TabsList>
        </Tabs>
      )
      const trigger = screen.getByRole("tab", { name: "Trigger" })
      expect(trigger.className).toContain("active:scale-[0.97]")
      expect(trigger.className).toContain("duration-200")
      expect(trigger.className).toContain("hover:bg-accent/30")
    })
  })

  describe("Popup menu & overlay motion", () => {
    test("DropdownMenuContent and PopoverContent inherit rossi-popup-motion and rounded-xl", () => {
      render(
        <>
          <DropdownMenu open>
            <DropdownMenuTrigger>Open</DropdownMenuTrigger>
            <DropdownMenuContent data-testid="dropdown-content">
              <DropdownMenuItem data-testid="dropdown-item">Item 1</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover open>
            <PopoverTrigger>Open Pop</PopoverTrigger>
            <PopoverContent data-testid="popover-content">
              Popover Body
            </PopoverContent>
          </Popover>
        </>
      )

      const dropdownContent = screen.getByTestId("dropdown-content")
      expect(dropdownContent.className).toContain("rossi-popup-motion")
      expect(dropdownContent.className).toContain("rounded-xl")
      expect(dropdownContent.className).toContain("backdrop-blur-md")

      const item = screen.getByTestId("dropdown-item")
      expect(item.className).toContain("active:scale-[0.98]")
      expect(item.className).toContain("duration-150")
      expect(item.className).toContain("ease-[cubic-bezier(0.2,0,0,1)]")

      const popoverContent = screen.getByTestId("popover-content")
      expect(popoverContent.className).toContain("rossi-popup-motion")
      expect(popoverContent.className).toContain("rounded-xl")
    })

    test("positive control: static non-animated container fails the motion requirement", () => {
      const staticDiv = document.createElement("div")
      staticDiv.className = "rounded-sm bg-popover p-1 shadow-md"
      expect(staticDiv.className.includes("rossi-popup-motion")).toBe(false)
      expect(staticDiv.className.includes("rounded-xl")).toBe(false)
    })
  })
})
