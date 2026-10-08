/**
 * Kisaki's scanner vocabulary: the tools the node knows, and the subset a terminal face may route to.
 *
 * Both lists used to live only in `core.ts`. That left `interaction.ts` — the node's shared data contract, which
 * the CLI's `--tool` flag, the guided picker and the TUI's scanner tabs all read — with one way to get them: a
 * *value* import of `./core.js`. That edge pulls the whole engine graph into the face process (ADR-0074 §5), and
 * for the GUI it would ship a second copy of the node's business logic in the browser chunk. So the vocabulary
 * lives here and `core.ts` re-exports it: still exactly one definition, and every existing `./core.js` consumer
 * (`core.test.ts`, `platform.test.ts`, `tool-options.test.ts`, the host bundle) keeps reading the same name.
 * Same shape as sleept's `schedule.ts`.
 *
 * This module imports nothing at all — no `core.js`, no runtime, no filesystem. A derived `Record<KisakiTool, …>`
 * in a face that forgets a scanner becomes a type error rather than a missing option, which is why the types are
 * built from the arrays instead of written beside them.
 */

/** Every scanner kisaki can drive, GUI included. */
export const KISAKI_TOOLS = [
  "duplicate-files",
  "empty-folders",
  "big-files",
  "empty-files",
  "temporary-files",
  "similar-images",
  "similar-videos",
  "duplicate-music",
  "invalid-symlinks",
  "broken-files",
  "bad-extensions",
  "bad-names",
  "exif-remover",
  "video-optimizer",
] as const

export type KisakiTool = typeof KISAKI_TOOLS[number]

/** New safe-operation scanners are GUI-only until terminal contracts are designed and verified. */
export const KISAKI_TERMINAL_TOOLS = [
  "duplicate-files",
  "empty-folders",
  "big-files",
  "empty-files",
  "temporary-files",
  "similar-images",
  "similar-videos",
  "duplicate-music",
  "invalid-symlinks",
  "broken-files",
  "bad-extensions",
] as const satisfies readonly KisakiTool[]

export type KisakiTerminalTool = typeof KISAKI_TERMINAL_TOOLS[number]
