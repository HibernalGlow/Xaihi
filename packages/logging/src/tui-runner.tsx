/* @jsxImportSource @opentui/react */
import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import type { ReadStream, WriteStream } from "node:tty"
import type { CliHost } from "@xiranite/cli-runtime"
import { readLogDirectory } from "./node.js"
import { LogTui } from "./Tui.js"

export async function runLogTui(options: { directory: string; host: CliHost }): Promise<void> {
  const result = await readLogDirectory(options.directory)
  let resolveDestroyed: (() => void) | undefined
  const destroyed = new Promise<void>((resolve) => { resolveDestroyed = resolve })
  const renderer = await createCliRenderer({
    stdin: options.host.stdin as ReadStream,
    stdout: options.host.stdout as WriteStream,
    exitOnCtrlC: true,
    clearOnShutdown: true,
    useMouse: true,
    screenMode: "alternate-screen",
    onDestroy: () => resolveDestroyed?.(),
  })
  const root = createRoot(renderer)
  const exit = () => { root.unmount(); renderer.destroy() }
  root.render(<LogTui events={result.events} directory={options.directory} onExit={exit} />)
  await destroyed
}
