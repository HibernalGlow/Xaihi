import type { NodeRunEvent, NodeRunResult } from "@xiranite/contract"
import type { ProgressEvent } from "../shared/types"

export interface StorageRuntime {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
  keys(prefix: string): Promise<string[]>
}

export interface FsStat {
  path: string
  isDirectory: boolean
  sizeBytes: number
  lastModified: number
}

export interface FsEntry {
  name: string
  path: string
  isDirectory: boolean
  sizeBytes: number
  lastModified: number
}

export interface FileSystemRuntime {
  exists(path: string): Promise<boolean>
  listDir(dirPath: string): Promise<FsEntry[]>
  readFileText(path: string): Promise<string>
  readFileBytes(path: string): Promise<Uint8Array>
  writeFile(path: string, content: string | Uint8Array): Promise<void>
  remove(path: string, opts?: { permanent?: boolean }): Promise<void>
  rename(oldPath: string, newPath: string): Promise<void>
  stat(path: string): Promise<FsStat>
}

export interface NativeFileDropEvent {
  files: string[]
  targetId?: string
}

export interface NativeFileDropRuntime {
  subscribe(handler: (event: NativeFileDropEvent) => void): Promise<() => void>
}

export interface SubprocessSpawnOpts {
  cwd?: string
  env?: Record<string, string>
  stdin?: string
}

export interface SubprocessResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface SubprocessRuntime {
  spawn(
    cmd: string,
    args: string[],
    opts: SubprocessSpawnOpts,
    handlers?: {
      onStdout?: (chunk: string) => void
      onStderr?: (chunk: string) => void
    },
  ): Promise<SubprocessResult>
  kill?(pid: number): Promise<void>
}

export interface EventBusRuntime {
  subscribe(topic: string, handler: (event: ProgressEvent) => void): Promise<() => void>
  publish(topic: string, event: ProgressEvent): Promise<void>
}

export interface NodeRunnerRuntime {
  runNode: <TInput = unknown, TData = unknown>(
    nodeId: string,
    input: TInput,
    onEvent?: (event: NodeRunEvent) => void,
  ) => Promise<NodeRunResult<TData>>
}

export type MainWindowAction = "minimize" | "maximize" | "toggle-fullscreen" | "restore" | "close"

export interface WindowCapabilities {
  supported: boolean
  nativeWindowControls: boolean
  frameless: boolean
  /**
   * Who paints the caption buttons. `system` means the OS title bar owns them — a shell reports this from
   * the window's own `titleBarStyle` (`hiddenInset` on macOS), so the app must not draw a second set over
   * the traffic lights. Defaults to `renderer`, i.e. `TopBar` and `FloatingWindowFrame` paint them as before.
   */
  captionOwner: "system" | "renderer"
  /** Where AppKit puts the traffic lights in CSS pixels; only reported when {@link captionOwner} is `system`. */
  captionInset?: { x: number; y: number }
  componentWindows: "native" | "browser-fallback" | "browser-popup" | "unsupported"
  message?: string
}

export interface WindowCommandResult {
  success: boolean
  supported: boolean
  id?: string
  message: string
  state?: "normal" | "maximized" | "fullscreen" | "minimized" | "closed"
}

export interface WindowFrame {
  x: number
  y: number
  width: number
  height: number
}

export interface ComponentWindowFrameEvent {
  componentId: string
  moduleId: string
  workspaceId?: string
  width: number
  height: number
}

export interface OpenComponentWindowInput {
  componentId: string
  moduleId: string
  workspaceId?: string
  title?: string
  width?: number
  height?: number
}

export interface WindowRuntime {
  getCapabilities(): Promise<WindowCapabilities>
  controlMain(action: MainWindowAction): Promise<WindowCommandResult>
  controlComponent(id: string, action: MainWindowAction): Promise<WindowCommandResult>
  openComponent(input: OpenComponentWindowInput): Promise<WindowCommandResult>
  focus(id: string): Promise<WindowCommandResult>
  close(id: string): Promise<WindowCommandResult>
  openDevTools(id?: string): Promise<WindowCommandResult>
  getFrame(id?: string): Promise<WindowFrame | null>
  setFrame(frame: WindowFrame, id?: string): Promise<WindowCommandResult>
  /**
   * Begin an OS-level move of a frameless window from a drag region. `-webkit-app-region` only works when
   * the renderer owns the frame, so a shell that owns the window answers this explicitly instead; a
   * `supported: false` result means the region simply does nothing.
   */
  startDragging(id?: string): Promise<WindowCommandResult>
  subscribeFrameChanges(handler: (event: ComponentWindowFrameEvent) => void): Promise<() => void>
}

export interface TrayCapabilities {
  supported: boolean
  mainTray: boolean
  standaloneTrays: boolean
  message?: string
}

export interface TrayMenuItemSpec {
  id: string
  label: string
  type?: "action" | "separator"
  enabled?: boolean
  checked?: boolean
  children?: TrayMenuItemSpec[]
}

export interface NativeTraySpec {
  id: string
  kind: "main" | "standalone"
  tooltip: string
  /** Browser-resolvable image URL or data URL; the active adapter resolves it. */
  icon?: string
  items: TrayMenuItemSpec[]
}

export interface TrayActionEvent {
  trayId: string
  itemId: string
}

export interface TrayRuntime {
  getCapabilities(): Promise<TrayCapabilities>
  setMainEnabled(enabled: boolean): Promise<void>
  sync(specs: NativeTraySpec[]): Promise<void>
  subscribe(handler: (event: TrayActionEvent) => void): Promise<() => void>
}

/**
 * What a caller wants from a native open dialog. The retired Wails bridge took
 * `CanChooseFiles`/`CanChooseDirectories`/`AllowsMultipleSelection`; this is that triple spelled as data,
 * so the browser face can answer it over HTTP too.
 */
export interface FilePickerRequest {
  kind: "files" | "directory"
  /** Defaults to multi-select, matching the host command. */
  multiple?: boolean
  title?: string
  /** Extension filters without the dot, as `NodeFilePickerOptions.filters` patterns declare them. */
  extensions?: string[]
  startingPath?: string
}

/**
 * The shell actions a desktop host answers natively: the pick dialogs, and handing a finished path to the
 * operating system. `hostApi.ts` is the only app-facing caller — nodes see these as
 * `localFiles.pickFiles / openPath / revealPath`, never as a runtime import (`docs/desktop-file-drop-api.md`
 * states the same rule for drops).
 */
export interface ShellRuntime {
  /** Absolute paths the user chose; an empty list means "cancelled", which is not an error. */
  pickPaths(request: FilePickerRequest): Promise<string[]>
  openPath(path: string): Promise<void>
  revealPath(path: string): Promise<void>
}

export interface RuntimeInterface {
  /**
   * `web` is the browser face (`adapters/web.ts`): the loopback channel plus DOM fallbacks. `electron`
   * (`adapters/dshDesktop.ts`) overlays only the native surface the shipped shell really serves — `windows` —
   * and delegates the rest, because the channel stays HTTP (ADR-0065). The `wails`, `deno-desktop` and `tauri`
   * members went with the bridges that returned them.
   */
  readonly kind: "web" | "electron"
  storage: StorageRuntime
  fs: FileSystemRuntime
  fileDrops: NativeFileDropRuntime
  shell: ShellRuntime
  subprocess: SubprocessRuntime
  events: EventBusRuntime
  nodeRunner: NodeRunnerRuntime
  windows: WindowRuntime
  trays: TrayRuntime
}

export type RuntimeAdapterFactory = () => RuntimeInterface | Promise<RuntimeInterface>

export interface RuntimeAdapterRegistration {
  kind: RuntimeInterface["kind"]
  detect: () => boolean
  factory: RuntimeAdapterFactory
}
