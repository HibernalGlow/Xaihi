/**
 * Action 注册表本体（ADR-0081）。
 *
 * 底层是 `@lumino/commands@2.3.4` 的 `CommandRegistry`。两处 Lumino 的现实约束决定了这层包装
 * 必须存在：
 * 1. `ICommandOptions` 没有 `keybinding` 字段，键位是独立的 `addKeyBinding`，所以一次
 *    `registerAction` 内部发两笔，对外仍是一个动作、一个事实源；
 * 2. 它的事件是 `@lumino/signaling` 而不是 React state，所以这里另维护一个 revision，
 *    由 `useActions.ts` 订阅（见 ADR-0081 的 useSyncExternalStore 条款）。
 *
 * 2.3.4 的 `CommandRegistry` 没有 `removeCommand`——注销靠 `addCommand` 返回的 `IDisposable`。
 */
import { CommandRegistry } from "@lumino/commands"
import type { IDisposable } from "@lumino/disposable"

import type { ActionContext, ActionId, ActionView, XiraniteActionDescriptor } from "./types"

const commands = new CommandRegistry()

const descriptors = new Map<ActionId, XiraniteActionDescriptor>()
const registrations = new Map<ActionId, IDisposable[]>()

const EMPTY_CONTEXT: ActionContext = {
  viewMode: "cards",
  activeOperationCount: 0,
  devRuntimeActive: false,
}

let context: ActionContext = EMPTY_CONTEXT
let revision = 0
let viewsCache: ActionView[] | null = null
const listeners = new Set<() => void>()

function notify(): void {
  revision += 1
  viewsCache = null
  for (const listener of listeners) listener()
}

function buildViews(): ActionView[] {
  return [...descriptors.values()]
    .filter((descriptor) => (descriptor.isVisible ? descriptor.isVisible(context) : true))
    .map<ActionView>((descriptor) => ({
      id: descriptor.id,
      category: descriptor.category,
      labelKey: descriptor.labelKey,
      presentation: descriptor.presentation,
      order: descriptor.order,
      enabled: descriptor.isEnabled ? descriptor.isEnabled(context) : true,
      toggled: descriptor.isToggled ? descriptor.isToggled(context) : false,
      badge: descriptor.badge ? descriptor.badge(context) : 0,
      indicator: descriptor.indicator ?? "none",
    }))
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

export function registerAction(descriptor: XiraniteActionDescriptor): void {
  if (descriptors.has(descriptor.id)) {
    throw new Error(`Action id 重复注册: ${descriptor.id}`)
  }
  if (descriptor.presentation === "command" && !descriptor.run) {
    throw new Error(`command 类动作缺少 run: ${descriptor.id}`)
  }
  descriptors.set(descriptor.id, descriptor)

  const disposables: IDisposable[] = [
    commands.addCommand(descriptor.id, {
      label: descriptor.id,
      execute: () => {
        descriptor.run?.(context)
      },
      isEnabled: () => (descriptor.isEnabled ? descriptor.isEnabled(context) : true),
      isToggled: () => (descriptor.isToggled ? descriptor.isToggled(context) : false),
      isVisible: () => (descriptor.isVisible ? descriptor.isVisible(context) : true),
    }),
  ]

  if (descriptor.keys && descriptor.keys.length > 0) {
    disposables.push(
      commands.addKeyBinding({
        command: descriptor.id,
        keys: descriptor.keys,
        selector: descriptor.selector ?? "*",
      }),
    )
  }

  registrations.set(descriptor.id, disposables)
  notify()
}

export function unregisterAction(id: ActionId): boolean {
  const disposables = registrations.get(id)
  if (!disposables) return false
  for (const disposable of disposables) disposable.dispose()
  registrations.delete(id)
  descriptors.delete(id)
  notify()
  return true
}

/** 渲染器把当前上下文推进来；上下文变了必须 notify，否则 enabled 与角标会停在旧值。 */
export function syncActionContext(next: ActionContext): void {
  const changed =
    next.viewMode !== context.viewMode
    || next.activeOperationCount !== context.activeOperationCount
    || next.devRuntimeActive !== context.devRuntimeActive
  context = next
  if (changed) {
    commands.notifyCommandChanged()
    notify()
  }
}

export function getActionContext(): ActionContext {
  return context
}

export function getActionDescriptor(id: ActionId): XiraniteActionDescriptor | undefined {
  return descriptors.get(id)
}

/**
 * 返回是否真的执行了。popover 类动作不在这里执行——它由渲染器开自己的锚定弹层，
 * 因为那个弹层里有 Select 与 ToggleGroup，轮盘只能「打开它」不能替它操作。
 */
export function executeAction(id: ActionId): boolean {
  const descriptor = descriptors.get(id)
  if (!descriptor || descriptor.presentation === "popover") return false
  if (!commands.isEnabled(id)) return false
  void commands.execute(id)
  return true
}

/** 供非 React 代码（测试、将来的审计尺）读当前可见视图。 */
export function getActionViews(): ActionView[] {
  if (!viewsCache) viewsCache = buildViews()
  return viewsCache
}

export function getRegisteredActionIds(): ActionId[] {
  return commands.listCommands()
}

export function getActionRevision(): number {
  return revision
}

export function subscribeActions(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * 全局只挂这一条 keydown，转给 Lumino 的匹配器。
 * 今天散着的 11 处手写 keydown 按能力逐条收编，不得新增第 12 处（ADR-0081）。
 */
export function installGlobalActionKeys(): () => void {
  const handler = (event: KeyboardEvent) => {
    commands.processKeydownEvent(event)
  }
  document.addEventListener("keydown", handler)
  return () => {
    document.removeEventListener("keydown", handler)
  }
}
