import { createLogger } from "@/lib/logger"
import { useMemo } from "react"
import type {
  HostComponentRef,
  NodeHostApi,
  NodeSchema,
  NodeSchemas,
} from "@xiranite/contract"

import {
  BRIDGE_CONTRACT_VERSION,
  BRIDGE_SCHEMA,
  BridgeError,
  NODE_CAPABILITY_IDS,
  negotiateBridge,
  type BridgeHello,
  type DocumentBridge,
  type NodeCapabilityId,
} from "@hibernalglow/xaihi-sdk/bridge"
import { createDocumentHost } from "@/client/document-host"
import { toNodeHostApi, type XaihiNodeHostApi } from "@/client/node-host-bridge"
import { resolveHazardComponentData } from "@/lib/hazardMode"
import { useDocumentBridge } from "@/document/bridge-context"
import { useTheme } from "@/components/use-theme"
import { getWorkspaceState, useWorkspaceActions, useWorkspaceComponentData } from "@/store/workspaceStore"
import type { ComponentInstance, ComponentState, ViewMode } from "@/types/workspace"

const logger = createLogger("node.host")

type ComponentVisibilityMode = Exclude<ViewMode, "dashboard">

const componentStates = new Set<ComponentState>(["docked", "floating", "focused", "fullscreen", "compact"])
const viewModes = new Set<ComponentVisibilityMode>(["cards", "dockview", "flow", "lane", "bento"])

/**
 * 这份文档不在宿主里时那句统一的原因。
 *
 * 它是一条**结论**而不是异常：`startRealm()` 没拿到 `window.__XAIHI_UI__`（例如这份
 * `main.js` 被当普通页面打开）时，界面照常挂载，而每个"要问宿主"的能力都读到这一句。
 * 编一份空壳替它作答会把"没有宿主"报成"宿主答了空"（ADR-0011 决定 4）。
 */
const NO_HOST_REASON = "这份文档不在宿主里（没拿到 window.__XAIHI_UI__），所以没有可问的对面"

/**
 * 没有宿主时用的占位桥：一条**已经协商完、什么都没给**的桥，每条调用都抛 `no-provider`。
 *
 * 两个细节是刻意的：
 * - 协商结果用 `negotiateBridge(hello, [], reasons)` 现算，不手搓 ready 的字面量 ——
 *   手搓一份就会在**别人改 ready 形状时静默漂移**，而这里的每一条只会在"没宿主"
 *   这条路上被读到，漂移了也看不见。
 * - `ready()` 返回的是**空授权**而不是 `null`。返回 null 会让所有调用停在
 *   `not-ready`（"还没拿到宿主握手应答"）上——那是一句误导：没有宿主的文档
 *   等多久都不会有握手，而使用者该读到的是"这份文档不在宿主里"。
 *   代价是 `config.get` 那一支会先撞上"没带设置命名空间"这条（它是同一条路上的
 *   第一道闸，`no-provider` 也对）；`runner` / `localFiles` / `env` 这几组走的是
 *   组级拒，带的就是下面那句 `NO_HOST_REASON`。
 */
function detachedBridge(): DocumentBridge {
  const hello: BridgeHello = {
    schema: BRIDGE_SCHEMA,
    kind: "hello",
    contractVersion: BRIDGE_CONTRACT_VERSION,
    node: "",
    requested: [...NODE_CAPABILITY_IDS],
  }
  const reasons: Partial<Record<NodeCapabilityId, string>> = {}
  for (const capability of NODE_CAPABILITY_IDS) reasons[capability] = NO_HOST_REASON
  const ready = negotiateBridge(hello, [], reasons)
  const reject = (): Promise<never> => Promise.reject(new BridgeError("no-provider", NO_HOST_REASON))
  return {
    ready: () => ready,
    hello: () => {},
    receive: () => false,
    call: reject,
    abortAll: () => {},
  }
}

export function useNodeHostApi(
  compId: string,
  nodeId?: string,
  schemas?: NodeSchemas,
): NodeHostApi {
  useWorkspaceComponentData(compId)
  const workspaceActions = useWorkspaceActions()
  const bridge = useDocumentBridge()
  const { theme } = useTheme()
  const hostTheme: "light" | "dark" = theme === "dark"
    ? "dark"
    : theme === "light"
      ? "light"
      : document.documentElement.classList.contains("dark")
        ? "dark"
        : "light"

  return useMemo(() => {
    /**
     * 这两片是**文档自己的**，不过桥：
     *
     * - `state`：上游的 `getData()` 是同步返回、`patchData()` 立即生效的，而工作台里
     *   每个组件的数据本来就住在工作区快照里（`component.data`）。过桥会把同一份状态
     *   放两个 realm，且同步形状会变成异步（`document-host.ts` 头三条立场里写明了这一点）。
     * - `workspace`：组件清单与布局同理，它归文档自己（`DOCUMENT_OWNED_GROUPS`）。
     *
     * 但它们**是**桥那份分组面的入参：`createDocumentHost({ state, workspace })` 把它们
     * 折回同一个 `NodeHostApi`，所以节点组件读到的仍是同一份扁表面。
     */
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

    /**
     * 剪贴板那几片留在文档自己这一侧（`navigator.clipboard`）：DSH 外壳没有剪贴板面
     * （桥那半边这组在 `refused` 里），而浏览器里这个 API 本来就在手上 ——
     * 过桥只会把一条本地动作变成一次注定失败的往返。
     *
     * 两条**不再**给出去（2026-10-07 使用者口径"一切都走 DSH 插件标准"）：
     * 操作系统级文件剪贴板与 `subscribeDrops`/`stageFiles` 过去走
     * `@/backend/localFilesClient` 与 Tauri runtime（也就是 REST/桌面后端那条路），
     * 那份通路不再有任何调用点。代价是浏览器拖放退回 DOM 的 `File.path` 退化，
     * 这一点在 `useLocalFileDrop` 里是按"有没有 subscribeDrops"判的，不是静默失效。
     */
    const clipboardCapability: NodeHostApi["clipboard"] = {
      readText: () => navigator.clipboard.readText(),
      writeText: (text: string) => navigator.clipboard.writeText(text),
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

    /** 下载是 DOM + Blob 的事，桥那半边也这么判（`DOCUMENT_FULFILLED_GROUPS`）。 */
    const downloadsCapability: NodeHostApi["downloads"] = {
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
     * 桥那一半：`contract` / `env` / `config` / `runner` / `localFiles` 由它提供。
     *
     * 这几条一律**照实报**，不补一份实现：DSH 那一侧今天只有设置面有对应物，所以
     * - `config.*` 落到 loader 行 id 指的那个命名空间（ADR-0013；`settingsNs` 由握手带来），
     * - `env` 取宿主随握手带来的暗/亮与平台快照，
     * - `localFiles.*`（挑文件/开路径是宿主的动作）会抛出对面那句点名原因。
     *   `runner.*` 曾经也在这条名单上（"要跑在一个 Agent 上，提案 P1"），ADR-0020 之后
     *   它是**主通道**：对面接的是 `createLocalRunner(nodeRegistry)`，这里一行都不用改。
     *   过程事件（`onEvent`）也一并通了，但走的是旁路不是桥 —— 接线在 `document-host.ts`
     *   的 `runner.run` 里（账本 `/xaihi/operations/stream`，见 `@/lib/nodeRunProgress`）。
     * 界面要显示的退化（ADR-0011 决定 4）靠的就是这些读得回 `reason` 的抛出。
     */
    const bridged = createDocumentHost({
      bridge: bridge ?? detachedBridge(),
      state: stateCapability,
      workspace: workspaceCapability,
    })
    const flat = toNodeHostApi(bridged)

    // 分组那几片**按 getter 转**，不展开：`env` 是"没握手就抛"的取值器，
    // 一旦写成 `{ ...flat }`，装配那一刻就会把退化引爆（症状是整块界面不出现，
    // 而不是某一句读不到 —— 2026-10-07 在真浏览器里就是这么红的）。
    const { getData, patchData, listComponents, updateComponent, actions, downloadText, getNodeConfig, saveNodeConfig, getNodeUiConfig, saveNodeUiConfig, openConfigFile } = flat

    const api = {
      get contract() { return flat.contract },
      get state() { return flat.state },
      get workspace() { return flat.workspace },
      get env() { return flat.env },
      get runner() { return flat.runner },
      clipboard: clipboardCapability,
      downloads: downloadsCapability,
      get localFiles() { return flat.localFiles },
      get config() { return flat.config },

      // Deprecated compatibility aliases —— 折到同一份分组面上，形状照上游那份不另发明键。
      getData,
      patchData,
      listComponents,
      updateComponent,
      actions,
      downloadText,
      getNodeConfig,
      saveNodeConfig,
      getNodeUiConfig,
      saveNodeUiConfig,
      openConfigFile,
    } satisfies XaihiNodeHostApi

    /*
     * 装配点的**一次显式决定**，不是把差异抹平：
     *
     * 桥给得出的形状是 `XaihiNodeHostApi` —— 比上游少了三处，逐条理由写在
     * `node-host-bridge.ts:35-55`（`contract.name` 那份字面量按 ADR-0010 换成本仓自称；
     * `config` 与两个扁名少一个 `path`，因为 DSH 的标准面没有"配置文件路径"这一说，
     * ADR-0013 正是把它拿掉的那条）。而搬来的节点组件读的是上游那份 `NodeHostApi`，
     * 运行期它要的字段一个不少 —— 少的那三处分别是"名字不同"与"没人读的 path"。
     * 所以在交进 `NodeComponentProps.host` 的这道口上把它当成 `NodeHostApi`。
     * 注意 `satisfies` 留在上面：结构检查照做，这里只是补上那三处**声明上的**差异。
     */
    return api as unknown as NodeHostApi
  }, [bridge, hostTheme, workspaceActions, compId, nodeId, schemas])
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
    // `NodeSchema` 刻意不依赖 Zod（`packages/contract/src/index.ts:451-454`），所以
    // `error` 是 `unknown`：这里只把它当成"里面可能有个 issues 数组"来念，不假设它的形状。
    const issues = (safeResult.error as { issues?: unknown } | null)?.issues
    logger.warn("Node produced state that failed schema validation", { label, issues })
  }
}
