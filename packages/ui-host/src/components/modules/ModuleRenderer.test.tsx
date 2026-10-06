// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ComponentType } from "react"
import type {
  AppNodeEntry,
  NodeCapabilityId,
  NodeComponentProps,
  NodeHostRequirements,
} from "@xiranite/contract"
import { NODE_HOST_CONTRACT_VERSION } from "@xiranite/contract"

// Mutable per-test state. Held in vi.hoisted so the hoisted mock factories
// can close over the same reference.
const testState = vi.hoisted(() => ({
  hostRequirements: undefined as NodeHostRequirements | undefined,
  childThrow: false,
  controlledInput: false,
  loadFailuresRemaining: 0,
  dedupeLoadCount: 0,
}))

const supportedCapabilities: readonly NodeCapabilityId[] = [
  "contract",
  "state",
  "workspace",
  "runner",
  "clipboard",
  "config",
  "env",
  // NOTE: "downloads" intentionally absent so capability-mismatch tests can
  // require it and observe the diagnostic fallback.
]

vi.mock("./hostApi", async () => {
  const { useMemo, useRef, useState } = await import("react")
  return {
    useNodeHostApi: () => {
      const dataRef = useRef<Record<string, unknown>>({})
      const [, rerender] = useState(0)
      return useMemo(() => {
        const patchData = (patch: Record<string, unknown>) => {
          dataRef.current = { ...dataRef.current, ...patch }
          rerender((revision) => revision + 1)
        }
        return {
          contract: {
            name: "xiranite.node-host",
            version: NODE_HOST_CONTRACT_VERSION,
            supportedCapabilities,
            hasCapability: (cap: NodeCapabilityId) => supportedCapabilities.includes(cap),
          },
          state: { getData: () => dataRef.current, patchData },
          env: { theme: "light", platform: "web" },
          // deprecated aliases kept so the mock satisfies NodeHostApi structurally
          getData: () => dataRef.current,
          patchData: (_compId: string, patch: Record<string, unknown>) => patchData(patch),
          listComponents: () => [],
          updateComponent: () => undefined,
        }
      }, [])
    },
  }
})

function TestNodeComponent(props: NodeComponentProps) {
  "use no memo"
  if (testState.childThrow) throw new Error("child exploded")
  if (testState.controlledInput) {
    const value = String((props.host.state.getData() as { value?: string } | undefined)?.value ?? "")
    return (
      <div>
        <input
          aria-label="controlled node input"
          value={value}
          onChange={(event) => props.host.state.patchData({ value: event.currentTarget.value })}
        />
        <output data-testid="controlled-node-value">{value}</output>
      </div>
    )
  }
  return <div data-testid="test-node-content">test node rendered</div>
}

vi.mock("./packageModules.generated", () => ({
  packageModuleLoaders: {
    "test-node": async () => {
      return { default: {
        def: {
          id: "test-node",
          name: "Test",
          version: "0.1.0",
          category: "other",
          description: "test",
          icon: "Box",
        },
        core: {},
        Component: TestNodeComponent as ComponentType<NodeComponentProps>,
        get host() {
          return testState.hostRequirements
        },
      } as AppNodeEntry }
    },
    "retry-node": async () => {
      if (testState.loadFailuresRemaining > 0) {
        testState.loadFailuresRemaining -= 1
        throw new Error("stale module graph")
      }
      return { default: {
        def: {
          id: "retry-node",
          name: "Retry",
          version: "0.1.0",
          category: "other",
          description: "test",
          icon: "Box",
        },
        core: {},
        Component: TestNodeComponent as ComponentType<NodeComponentProps>,
      } as AppNodeEntry }
    },
    "headless-node": () => Promise.resolve({
      default: {
        def: {
          id: "headless-node",
          name: "Headless",
          version: "0.1.0",
          category: "other",
          description: "headless",
          icon: "Box",
        },
        core: {},
      },
    }),
    "dedupe-node": async () => {
      testState.dedupeLoadCount += 1
      return { default: {
        def: {
          id: "dedupe-node",
          name: "Dedupe",
          version: "0.1.0",
          category: "other",
          description: "test",
          icon: "Box",
        },
        core: {},
        Component: TestNodeComponent as ComponentType<NodeComponentProps>,
      } as AppNodeEntry }
    },
  },
}))

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

// Import after mocks are registered.
import { ModuleRenderer } from "./ModuleRenderer"

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  testState.hostRequirements = undefined
  testState.childThrow = false
  testState.controlledInput = false
  testState.loadFailuresRemaining = 0
  testState.dedupeLoadCount = 0
})

describe("ModuleRenderer package node rendering", () => {
  test("does not load the temporarily disabled BlockNote node", () => {
    render(<ModuleRenderer moduleId="blocknote" compId="c1" />)
    expect(screen.getByText("module:unknown")).toBeTruthy()
  })

  test("renders the unknown placeholder for every retired toy module", () => {
    for (const moduleId of ["scratch", "counter", "tasks", "clock", "calculator"]) {
      const { unmount } = render(<ModuleRenderer moduleId={moduleId} compId="c1" />)
      expect(screen.getByText("module:unknown")).toBeTruthy()
      unmount()
    }
  })

  test("renders the node component when host requirements are satisfied", async () => {
    testState.hostRequirements = {
      contractVersion: "^1.0.0",
      capabilities: ["state", "env"],
    }
    render(<ModuleRenderer moduleId="test-node" compId="c1" />)
    expect(await screen.findByTestId("test-node-content")).toBeTruthy()
  })

  test("retries a package entry after a stale module graph fails to load", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    testState.loadFailuresRemaining = 1
    render(<ModuleRenderer moduleId="retry-node" compId="c1" />)

    fireEvent.click(await screen.findByRole("button", { name: "Retry loading" }))

    expect(await screen.findByTestId("test-node-content")).toBeTruthy()
    expect(spy).toHaveBeenCalledWith(
      "[module-renderer] failed to load entry for retry-node",
      expect.objectContaining({ message: "stale module graph" }),
    )
    spy.mockRestore()
  })

  test("shares one dynamic entry load across concurrent node instances", async () => {
    render(
      <>
        <ModuleRenderer moduleId="dedupe-node" compId="c1" />
        <ModuleRenderer moduleId="dedupe-node" compId="c2" />
      </>,
    )

    expect((await screen.findAllByTestId("test-node-content"))).toHaveLength(2)
    expect(testState.dedupeLoadCount).toBe(1)
  })

  test("rerenders controlled node inputs when stable host state changes", async () => {
    testState.controlledInput = true
    render(<ModuleRenderer moduleId="test-node" compId="c1" />)

    const input = await screen.findByRole("textbox", { name: "controlled node input" })
    fireEvent.change(input, { target: { value: "typed value" } })

    expect(screen.getByTestId("controlled-node-value").textContent).toBe("typed value")
  })

  test("renders diagnostic fallback when a required capability is missing", async () => {
    testState.hostRequirements = {
      capabilities: ["state", "downloads"],
    }
    render(<ModuleRenderer moduleId="test-node" compId="c1" />)
    expect(await screen.findByText(/Node "test-node" unavailable/)).toBeTruthy()
    expect(screen.getByText(/Missing host capabilities: downloads/)).toBeTruthy()
  })

  test("renders diagnostic fallback when contract version is incompatible", async () => {
    testState.hostRequirements = { contractVersion: "^2.0.0" }
    render(<ModuleRenderer moduleId="test-node" compId="c1" />)
    expect(await screen.findByText(/Node "test-node" unavailable/)).toBeTruthy()
    expect(screen.getByText(/Contract version mismatch/)).toBeTruthy()
    expect(screen.getByText(/\^2\.0\.0/)).toBeTruthy()
  })

  test("catches render throws via NodeRenderBoundary instead of crashing the workspace", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    testState.hostRequirements = { capabilities: ["state"] }
    testState.childThrow = true
    render(<ModuleRenderer moduleId="test-node" compId="c1" />)
    expect(await screen.findByText(/Node "test-node" failed to render/)).toBeTruthy()
    expect(screen.getByText("child exploded")).toBeTruthy()
    spy.mockRestore()
  })

  test("renders a diagnostic for headless package nodes instead of mounting an undefined component", async () => {
    render(<ModuleRenderer moduleId="headless-node" compId="c1" />)
    expect(await screen.findByText(/Node "headless-node" has no UI component/)).toBeTruthy()
  })
})
