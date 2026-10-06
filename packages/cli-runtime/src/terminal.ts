/**
 * Terminal-only entrypoint. Browser and desktop UI code must not import this
 * module because it can load OpenTUI, Bun-specific code, and native files.
 */
export * from "./tui/index.js"
