/* @jsxImportSource @opentui/react */
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import type { ReadStream, WriteStream } from "node:tty"

import type { CliHost } from "@xiranite/cli-runtime"
import type { TerminalTaskQueueController } from "@xiranite/cli-runtime/terminal"

import { XiraniteTui, type XiraniteWorkspaceController } from "./Tui.js"
import type { NodeCliRegistration } from "./index.js"

export async function renderXiraniteTui(options: { host: CliHost; nodes: readonly NodeCliRegistration[]; workspace: XiraniteWorkspaceController; taskQueue: TerminalTaskQueueController }): Promise<string | undefined> {
  let resolveResult!: (nodeId?: string) => void
  const result = new Promise<string | undefined>((resolve) => { resolveResult = resolve })
  const renderer = await createCliRenderer({ stdin: options.host.stdin as ReadStream, stdout: options.host.stdout as WriteStream, exitOnCtrlC: true, clearOnShutdown: true, useMouse: true, enableMouseMovement: true, screenMode: "alternate-screen" })
  const root = createRoot(renderer)
  const finish = (nodeId?: string) => { root.unmount(); renderer.destroy(); resolveResult(nodeId) }
  root.render(<XiraniteTui nodes={options.nodes} workspace={options.workspace} taskQueue={options.taskQueue} onOpenNode={(nodeId) => finish(nodeId)} onExit={() => finish()} />)
  return await result
}
