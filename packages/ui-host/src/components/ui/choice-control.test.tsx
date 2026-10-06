// @vitest-environment happy-dom
import { afterEach, describe, expect, test } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { ChoiceControlField } from "./choice-control"
import { FIELD_TITLE_STYLES } from "./choice-control-variants"
import { ToggleGroup, ToggleGroupItem } from "./toggle-group"

afterEach(() => { cleanup(); delete document.documentElement.dataset.fieldTitleStyle })

describe("ChoiceControlField", () => {
  test.each(FIELD_TITLE_STYLES)("keeps the official ToggleGroup interactive with the %s title style", async (style) => {
    document.documentElement.dataset.fieldTitleStyle = style
    render(<Fixture />)
    const user = userEvent.setup()
    await user.click(screen.getByRole("radio", { name: "有损" }))
    expect(screen.getByRole("radio", { name: "有损" }).getAttribute("data-state")).toBe("on")
  })
})

function Fixture() {
  const [value, setValue] = useState("lossless")
  return <ChoiceControlField label="压缩模式"><ToggleGroup type="single" value={value} onValueChange={(next) => next && setValue(next)}><ToggleGroupItem value="lossless">无损</ToggleGroupItem><ToggleGroupItem value="lossy">有损</ToggleGroupItem></ToggleGroup></ChoiceControlField>
}
