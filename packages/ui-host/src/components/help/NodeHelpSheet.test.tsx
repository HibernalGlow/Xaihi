// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { NodeHelp } from "@xiranite/contract"
import { NodeHelpContent } from "./NodeHelpSheet"

const translations: Record<string, string> = {
  "registry:help.tabs.overview": "Overview",
  "registry:help.tabs.workflows": "Workflows",
  "registry:help.tabs.details": "Details",
  "registry:help.sections.whenToUse": "When to use",
  "registry:help.sections.workflows": "Workflows",
  "registry:help.sections.workflowsDescription": "Follow the workflow in order.",
  "registry:help.sections.fields": "Fields",
  "registry:help.sections.fieldsDescription": "Available fields.",
  "registry:help.sections.safety": "Safety",
  "registry:help.sections.safetyDescription": "Review risks.",
  "registry:help.sections.links": "Links",
  "registry:help.labels.tip": "Tip",
  "registry:help.labels.required": "required",
  "registry:help.labels.defaultValue": "default",
  "registry:help.labels.defaultMode": "Default mode",
  "registry:help.labels.destructive": "Destructive",
  "registry:help.labels.note": "Note",
}

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
    i18n: { language: "en", exists: () => false },
  }),
}))

afterEach(cleanup)

const help = {
  title: "Demo node",
  short: "Run a safe, guided demo workflow.",
  description: "Inspect the plan before applying changes.",
  whenToUse: ["Use this node when a folder needs a guided pass."],
  workflows: [
    {
      title: "Guided workflow",
      summary: "Select, preview, then apply.",
      ui: ["Choose source files.", "Review the preview.", "Apply the plan."],
      cli: ["Run the preview command.", "Confirm the live command."],
      tips: ["Keep a backup."],
    },
  ],
  commands: [
    {
      title: "Preview command",
      command: "xiranite demo",
      description: "Inspect the plan.",
      examples: [
        {
          label: "Preview",
          command: "xiranite demo --preview",
          description: "Does not modify files.",
        },
      ],
    },
  ],
  fields: [
    {
      name: "paths",
      type: "string[]",
      required: true,
      description: "Source paths.",
      defaultValue: "[]",
    },
  ],
  safety: {
    defaultMode: "preview",
    destructive: ["apply"],
    notes: ["Existing targets are skipped."],
  },
} satisfies NodeHelp

describe("NodeHelpContent", () => {
  test("uses shared Tabs and exposes visual workflows, CLI examples, fields, and safety alerts", async () => {
    render(
      <NodeHelpContent
        help={help}
        moduleId="demo"
        moduleName="Demo"
        version="0.1.0"
        category="file"
      />,
    )
    const user = userEvent.setup()
    const tabs = screen.getByRole("tablist")

    expect(tabs.getAttribute("data-variant")).toBe("default")
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-selected")).toBe("true")
    expect(screen.getByText("Run a safe, guided demo workflow.")).toBeTruthy()

    await user.click(screen.getByRole("tab", { name: "Workflows" }))
    expect(screen.getByText("Choose source files.")).toBeTruthy()
    expect(screen.getByText("Review the preview.")).toBeTruthy()
    expect(screen.getByText("Keep a backup.")).toBeTruthy()

    await user.click(screen.getByRole("tab", { name: "CLI" }))
    expect(screen.getByText("xiranite demo --preview")).toBeTruthy()
    expect(screen.getByText("Does not modify files.")).toBeTruthy()

    await user.click(screen.getByRole("tab", { name: "Details" }))
    expect(screen.getByText("paths")).toBeTruthy()
    expect(screen.getByText("apply")).toBeTruthy()
    expect(screen.getByText("Existing targets are skipped.")).toBeTruthy()
    expect(screen.getAllByRole("alert")).toHaveLength(2)
  })
})
