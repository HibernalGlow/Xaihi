import { createLogger } from "@/lib/logger"
import { useMemo } from "react"
import type {
  HostComponentRef,
  NodeCapabilityId,
  NodeRunEvent,
  NodeFilePickerOptions,
  NodeHostApi,
  NodeSchema,
  NodeSchemas,
} from "@xiranite/contract"
import { NODE_HOST_CONTRACT_VERSION } from "@xiranite/contract"

import { localBackendFileUrl } from "@/backend/localBackendConfig"
import { getRuntime } from "@/backend/client"
import { detectTauriRuntime } from "@/backend/adapters/tauri"
import { clearLocalFilesClipboard, copyLocalFilesToClipboard, listLocalFiles, readLocalFilesFromClipboard, stageLocalFiles } from "@/backend/localFilesClient"
import { applyHazardRunPolicy, resolveHazardComponentData } from "@/lib/hazardMode"
import {
  createNodePresetOnBackend,
  createNodeConfigBackupOnBackend,
  deleteNodePresetOnBackend,
  exportNodeConfigFromBackend,
  getConfigHistoryRepositoryFromBackend,
  getNodeConfigFromBackend,
  getNodeConfigVersionsFromBackend,
  getNodePresetsFromBackend,
  getNodeUiConfigFromBackend,
  importNodeConfigOnBackend,
  inspectNodeConfigVersionFromBackend,
  openConfigFileWithBackend,
  saveNodeConfigToBackend,
  saveNodeUiConfigToBackend,
  restoreNodeConfigVersionOnBackend,
  setConfigHistoryRemoteOnBackend,
  syncConfigHistoryOnBackend,
  updateNodePresetOnBackend,
} from "@/backend/configRpcClient"
import { cancelNodeOperationOnLocalBackend, getNodeRuntimeInfoFromLocalBackend, runNodeOnLocalBackend } from "@/backend/nodeRpcClient"
import { useTheme } from "@/components/use-theme"
import { useNodeOperations } from "@/store/nodeOperations"
import { getWorkspaceState, useWorkspaceActions, useWorkspaceComponentData } from "@/store/workspaceStore"
import type { ComponentInstance, ComponentState, ViewMode } from "@/types/workspace"

const logger = createLogger("node.host")

type ComponentVisibilityMode = Exclude<ViewMode, "dashboard">

const componentStates = new Set<ComponentState>(["docked", "floating", "focused", "fullscreen", "compact"])
const viewModes = new Set<ComponentVisibilityMode>(["cards", "dockview", "flow", "lane", "bento"])

const injectedCapabilities: readonly NodeCapabilityId[] = [
  "contract",
  "state",
  "workspace",
  "runner",
  "clipboard",
  "downloads",
  "localFiles",
  "config",
  "env",
]

export function useNodeHostApi(
  compId: string,
  nodeId?: string,
  schemas?: NodeSchemas,
): NodeHostApi {
  useWorkspaceComponentData(compId)
  const workspaceActions = useWorkspaceActions()
  const { theme } = useTheme()
  const hostTheme: "light" | "dark" = theme === "dark"
    ? "dark"
    : theme === "light"
      ? "light"
      : document.documentElement.classList.contains("dark")
        ? "dark"
        : "light"

  return useMemo(() => {
    const readComponentData = () => {
      const workspaceState = getWorkspaceState()
      const component = workspaceState.components.find((item) => item.id === compId)
      return resolveHazardComponentData(component, workspaceState.hazardMode)
    }

    const stateCapability = {
      getData: () => {
        const raw = readComponentData()
        if (raw === undefined) return undefined
        return parseWithSchema(schemas?.data, raw, {} as Record<string, unknown>)
      },
      patchData: (patch: Record<string, unknown>) => {
        workspaceActions.patchComponentData(compId, patch)
        const next = { ...(readComponentData() ?? {}), ...patch }
        warnOnSchemaMismatch(schemas?.data, next, "patchData")
      },
    }

    const workspaceCapability = {
      listComponents: () => {
        const state = getWorkspaceState()
        return state.components
          .filter((component) => component.workspaceId === state.activeWorkspaceId)
          .map(toHostRef)
      },
      updateComponent: (id: string, patch: Partial<HostComponentRef>) => {
        const nextHiddenIn: Partial<Record<ViewMode, boolean>> = {}
        if (patch.hiddenIn) {
          for (const [mode, hidden] of Object.entries(patch.hiddenIn)) {
            if (isComponentVisibilityMode(mode)) {
              nextHiddenIn[mode] = hidden
            }
          }
        }
        workspaceActions.updateComponent(id, {
          data: patch.data,
          tags: patch.tags,
          state: patch.state && componentStates.has(patch.state as ComponentState)
            ? patch.state as ComponentState
            : undefined,
          hiddenIn: Object.keys(nextHiddenIn).length ? nextHiddenIn : undefined,
        })
      },
    }

    const runnerCapability = {
      getInfo: <TInfo = unknown>(id: string) => getNodeRuntimeInfoFromLocalBackend<TInfo>(id),
      run: <TInput = unknown, TData = unknown>(
        id: string,
        input: TInput,
        onEvent?: (event: NodeRunEvent) => void,
      ) => {
        const workspaceState = getWorkspaceState()
        const workspaceId = workspaceState.components.find((component) => component.id === compId)?.workspaceId
        const effectiveInput = applyHazardRunPolicy(id || nodeId, input, workspaceState.hazardMode)
        return runNodeOnLocalBackend<TInput, TData>(id, effectiveInput, onEvent, {
          componentId: compId,
          workspaceId,
        })
      },
      cancelCurrent: async () => {
        const activeOperation = useNodeOperations.getState().operations.find(
          (operation) => operation.componentId === compId && (operation.phase === "queued" || operation.phase === "running"),
        )
        if (!activeOperation) return false
        await cancelNodeOperationOnLocalBackend(activeOperation.operationId)
        return true
      },
    }

    const clipboardCapability = {
      readText: () => navigator.clipboard.readText(),
      writeText: (text: string) => navigator.clipboard.writeText(text),
      ...(supportsNativeFileClipboard() ? {
        readFiles: readLocalFilesFromClipboard,
        writeFiles: copyLocalFilesToClipboard,
        clearFiles: clearLocalFilesClipboard,
      } : {}),
      readImage: async () => {
        if (!navigator.clipboard?.read) throw new Error("当前运行环境不支持读取剪贴板图片。")
        const items = await navigator.clipboard.read()
        for (const item of items) {
          const mimeType = item.types.find((type) => type.startsWith("image/"))
          if (!mimeType) continue
          const blob = await item.getType(mimeType)
          return { base64: await blobToBase64(blob), mimeType }
        }
        return undefined
      },
      writeImage: async ({ base64, mimeType }: { base64: string; mimeType: string }) => {
        if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("当前运行环境不支持写入剪贴板图片。")
        const encoded = await (await fetch(`data:${mimeType};base64,${base64}`)).blob()
        const supported = !ClipboardItem.supports || ClipboardItem.supports(mimeType)
        const blob = supported ? encoded : await encodedImageToPng(encoded)
        const clipboardMime = supported ? mimeType : "image/png"
        await navigator.clipboard.write([new ClipboardItem({ [clipboardMime]: blob })])
      },
    }

    const downloadsCapability = {
      text: (filename: string, content: string) => {
        const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement("a")
        anchor.href = url
        anchor.download = filename
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        URL.revokeObjectURL(url)
      },
    }

    /**
     * Local-file capabilities now go through the active runtime: the desktop shell answers picks, open/reveal
     * and absolute-path drops natively (`adapters/tauri.ts` → `shell.rs`), while the browser face keeps the
     * HTTP picker and the `window.open` degradation (`adapters/web.ts`). This is the layering
     * `docs/desktop-file-drop-api.md` fixes — node UI never imports a runtime, and the host decides.
     *
     * `subscribeDrops` presence is decided synchronously on purpose: `useLocalFileDrop` gates its DOM
     * `File.path` fallback on the *presence* of this member (useLocalFileDrop.tsx:71), so advertising it on a
     * face that can never name a dropped file would turn every browser drop into "unsupported".
     */
    const nativeDropsAvailable = detectTauriRuntime()
    const localFilesCapability = {
      getUrl: (path: string) => localBackendFileUrl(path),
      openPath: async (path: string) => {
        await (await getRuntime()).shell.openPath(path)
      },
      revealPath: async (path: string) => {
        await (await getRuntime()).shell.revealPath(path)
      },
      list: listLocalFiles,
      stageFiles: stageLocalFiles,
      pickFiles: async (options?: NodeFilePickerOptions) => await pickWithRuntime("files", false, options),
      pickDirectory: async () => (await pickWithRuntime("directory", false))[0],
      pickDirectories: async () => await pickWithRuntime("directory", true),
      ...(nativeDropsAvailable
        ? {
            subscribeDrops: async (targetId: string, handler: (paths: string[]) => void) => {
              const runtime = await getRuntime()
              return await runtime.fileDrops.subscribe((event) => {
                if (event.targetId === targetId && event.files.length > 0) handler(event.files)
              })
            },
          }
        : {}),
    }

    /** The picker request the contract's `NodeFilePickerOptions` translates into, kept in one place. */
    async function pickWithRuntime(kind: "files" | "directory", multiple: boolean, options?: NodeFilePickerOptions): Promise<string[]> {
      return await (await getRuntime()).shell.pickPaths({
        kind,
        multiple,
        ...(options?.title ? { title: options.title } : {}),
        ...(options?.filters?.length
          ? { extensions: options.filters.flatMap((filter) => filter.pattern.split(/[,;|\s]+/).map((part) => part.replace(/^\*?\.?/, "")).filter(Boolean)) }
          : {}),
      })
    }

    const configCapability = {
      get: async <T,>() => {
        if (!nodeId) throw new Error("Node ID is required for config.get")
        return getNodeConfigFromBackend<T>(nodeId)
      },
      save: async <T,>(config: T) => {
        if (!nodeId) throw new Error("Node ID is required for config.save")
        await saveNodeConfigToBackend<T>(nodeId, config)
      },
      getPresets: async <TValues extends Record<string, unknown> = Record<string, unknown>>() => {
        if (!nodeId) throw new Error("Node ID is required for config.getPresets")
        return getNodePresetsFromBackend<TValues>(nodeId)
      },
      createPreset: async <TValues extends Record<string, unknown> = Record<string, unknown>>(input: { name: string; values: TValues }) => {
        if (!nodeId) throw new Error("Node ID is required for config.createPreset")
        return createNodePresetOnBackend(nodeId, input)
      },
      updatePreset: async <TValues extends Record<string, unknown> = Record<string, unknown>>(presetId: string, input: { name?: string; values?: TValues }) => {
        if (!nodeId) throw new Error("Node ID is required for config.updatePreset")
        return updateNodePresetOnBackend(nodeId, presetId, input)
      },
      deletePreset: async (presetId: string) => {
        if (!nodeId) throw new Error("Node ID is required for config.deletePreset")
        return deleteNodePresetOnBackend(nodeId, presetId)
      },
      getVersions: async (options?: { limit?: number }) => {
        if (!nodeId) throw new Error("Node ID is required for config.getVersions")
        return getNodeConfigVersionsFromBackend(nodeId, options)
      },
      inspectVersion: async (revision: string) => {
        if (!nodeId) throw new Error("Node ID is required for config.inspectVersion")
        return inspectNodeConfigVersionFromBackend(nodeId, revision)
      },
      restoreVersion: async (revision: string) => {
        if (!nodeId) throw new Error("Node ID is required for config.restoreVersion")
        return restoreNodeConfigVersionOnBackend(nodeId, revision)
      },
      exportConfig: async (format?: "json" | "toml") => {
        if (!nodeId) throw new Error("Node ID is required for config.exportConfig")
        return exportNodeConfigFromBackend(nodeId, format)
      },
      importConfig: async (content: string, format?: "auto" | "json" | "toml") => {
        if (!nodeId) throw new Error("Node ID is required for config.importConfig")
        return importNodeConfigOnBackend(nodeId, content, format)
      },
      createBackup: async (label?: string) => {
        if (!nodeId) throw new Error("Node ID is required for config.createBackup")
        return createNodeConfigBackupOnBackend(nodeId, label)
      },
      getHistoryRepository: getConfigHistoryRepositoryFromBackend,
      setHistoryRemote: setConfigHistoryRemoteOnBackend,
      syncHistory: syncConfigHistoryOnBackend,
      getUi: async <T,>() => {
        if (!nodeId) throw new Error("Node ID is required for config.getUi")
        return getNodeUiConfigFromBackend<T>(nodeId)
      },
      saveUi: async <T,>(config: T) => {
        if (!nodeId) throw new Error("Node ID is required for config.saveUi")
        await saveNodeUiConfigToBackend<T>(nodeId, config)
      },
      openFile: async () => {
        await openConfigFileWithBackend()
      },
    }

    const envCapability = {
      theme: hostTheme,
      platform: "web" as const,
    }

    const contractCapability = {
      name: "xiranite.node-host" as const,
      version: NODE_HOST_CONTRACT_VERSION,
      supportedCapabilities: injectedCapabilities,
      hasCapability: (capability: NodeCapabilityId) => injectedCapabilities.includes(capability),
    }

    return {
      contract: contractCapability,
      state: stateCapability,
      workspace: workspaceCapability,
      runner: runnerCapability,
      clipboard: clipboardCapability,
      downloads: downloadsCapability,
      localFiles: localFilesCapability,
      config: configCapability,
      env: envCapability,

      // Deprecated compatibility aliases — map onto the capability domains so
      // unmigrated nodes keep working. Removed once every node uses host.state etc.
      getData: <T,>(_compId: string) => stateCapability.getData() as T | undefined,
      patchData: (_compId: string, patch: Record<string, unknown>) => stateCapability.patchData(patch),
      listComponents: () => workspaceCapability.listComponents(),
      updateComponent: (id: string, patch: Partial<HostComponentRef>) =>
        workspaceCapability.updateComponent(id, patch),
      actions: { run: runnerCapability.run, cancelCurrent: runnerCapability.cancelCurrent },
      downloadText: (filename: string, content: string) => downloadsCapability.text(filename, content),
      getNodeConfig: async <T,>() => configCapability.get<T>(),
      saveNodeConfig: async <T,>(config: T) => configCapability.save<T>(config),
      getNodeUiConfig: async <T,>() => configCapability.getUi<T>(),
      saveNodeUiConfig: async <T,>(config: T) => configCapability.saveUi<T>(config),
      openConfigFile: () => configCapability.openFile(),
    } satisfies NodeHostApi
  }, [hostTheme, workspaceActions, compId, nodeId, schemas])
}

function isComponentVisibilityMode(mode: string): mode is ComponentVisibilityMode {
  return viewModes.has(mode as ComponentVisibilityMode)
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error("读取剪贴板图片失败。"))
    reader.onload = () => resolve(String(reader.result ?? "").replace(/^data:[^,]*,/, ""))
    reader.readAsDataURL(blob)
  })
}

async function encodedImageToPng(blob: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  try {
    const canvas = document.createElement("canvas")
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext("2d")
    if (!context) throw new Error("无法创建剪贴板图片画布。")
    context.drawImage(bitmap, 0, 0)
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((png) => png ? resolve(png) : reject(new Error("无法生成剪贴板 PNG 图像。")), "image/png"))
  } finally { bitmap.close() }
}


export function supportsNativeFileClipboard(platform = navigator.platform, userAgent = navigator.userAgent): boolean {
  return /win/i.test(platform) || /windows/i.test(userAgent)
}

function toHostRef(component: ComponentInstance): HostComponentRef {
  return {
    id: component.id,
    moduleId: component.moduleId,
    state: component.state,
    tags: component.tags,
    hiddenIn: component.hiddenIn,
    data: component.data,
  }
}

/**
 * Parse persisted component data with an optional schema. On parse failure,
 * returns a safe fallback instead of throwing so a single bad persisted value
 * cannot crash the workspace render. Diagnostics surface via console warning.
 */
function parseWithSchema<T>(
  schema: NodeSchema<T> | undefined,
  value: unknown,
  fallback: T,
): T {
  if (!schema) return (value ?? fallback) as T
  const safeResult = schema.safeParse?.(value)
  if (safeResult) return safeResult.success ? safeResult.data : fallback
  try {
    return schema.parse(value)
  } catch {
    return fallback
  }
}

function warnOnSchemaMismatch<T>(
  schema: NodeSchema<T> | undefined,
  value: unknown,
  label: string,
): void {
  if (!schema) return
  const safeResult = schema.safeParse?.(value)
  if (safeResult && !safeResult.success && import.meta.env.DEV) {
    logger.warn("Node produced state that failed schema validation", { label, issues: safeResult.error.issues })
  }
}
