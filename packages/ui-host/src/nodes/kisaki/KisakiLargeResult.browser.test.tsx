import { useState } from "react"
import { expect, test } from "vitest"
import { page } from "vitest/browser"
import { cleanup, render } from "vitest-browser-react"
import type { KisakiEntry, KisakiGroup } from "@hibernalglow/xaihi-kisaki/core"

import i18n from "@/i18n"
import { KisakiResultTable } from "./result-table"

test("keeps a 10000-result Kisaki table virtualized through selection and filtering", async () => {
  await i18n.changeLanguage("en")
  const groups = largeGroups()
  const started = performance.now()
  await render(<LargeResultHarness groups={groups} />)
  const mountElapsedMs = performance.now() - started

  const viewport = page.getByTestId("czkawka-result-viewport")
  await expect.element(viewport).toHaveAttribute("data-virtualized", "true")
  const mountedRows = document.querySelectorAll('[data-slot="table-body"] tr').length
  const mountedMediaNodes = document.querySelectorAll("img, video, audio").length
  expect(mountedRows).toBeLessThan(80)
  expect(mountedMediaNodes).toBe(0)
  expect(mountElapsedMs).toBeLessThan(1_500)

  const selectionStarted = performance.now()
  await page.getByRole("checkbox", { name: "Select entry-00000.dat" }).click()
  await expect.poll(() => document.querySelector('[data-row-id="entry-00000.dat"]')?.getAttribute("data-state")).toBe("selected")
  const selectionElapsedMs = performance.now() - selectionStarted
  expect(selectionElapsedMs).toBeLessThan(1_500)

  const filterStarted = performance.now()
  await page.getByRole("textbox", { name: "Filter results" }).fill("entry-09999.dat")
  await expect.element(page.getByText("entry-09999.dat").first()).toBeVisible()
  const filterElapsedMs = performance.now() - filterStarted
  expect(filterElapsedMs).toBeLessThan(1_500)

  console.info(JSON.stringify({ benchmark: "czkawka-large-result", mountElapsedMs, selectionElapsedMs, filterElapsedMs, mountedRows, mountedMediaNodes }))
  cleanup()
  await i18n.changeLanguage("zh")
})

function LargeResultHarness({ groups }: { groups: KisakiGroup[] }) {
  const [selectedPaths, setSelectedPaths] = useState<string[]>([])
  const [filterText, setFilterText] = useState("")
  return <div style={{ height: 640 }}><KisakiResultTable tool="empty-files" groups={groups} running={false} selectedPaths={selectedPaths} filterText={filterText} thumbnailEnabled={false} onFilterTextChange={setFilterText} onSelectionChange={setSelectedPaths} /></div>
}

function largeGroups(): KisakiGroup[] {
  const entries: KisakiEntry[] = Array.from({ length: 10_000 }, (_, index) => {
    const name = `entry-${String(index).padStart(5, "0")}.dat`
    return { id: name, groupId: 0, path: name, name, size: index + 1, modifiedDate: 1 }
  })
  return [{ id: 0, entries, totalBytes: entries.reduce((total, entry) => total + entry.size, 0), reclaimableBytes: 0 }]
}
