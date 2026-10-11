import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react"
import { useReducedMotion } from "motion/react"
import { ExternalLink } from "lucide-react"
import { useTranslation } from "react-i18next"
import { MODULE_REGISTRY } from "@/components/modules/registry"
import { allModules } from "@/plugins/contributions"
import { useContributedModules } from "@/plugins/useContributedModules"
import { resolveModuleIcon } from "@/components/modules/moduleIconRegistry"
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useWindowControls } from "@/hooks/useWindowControls"
import { useWorkspaceActions, useWorkspaceShallowSelector } from "@/store/workspaceStore"
import { BuoyantNodeRail } from "./BuoyantNodeRail"
import type { ComponentInstance, ModuleDef } from "@/types/workspace"

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

const DEFAULT_INITIAL_INDEX = ALPHABET.indexOf("A")

/** 26 个全集的**下标**。步进函数的默认停靠集合就是它，等于「不要过滤」那一路的旧行为。 */
const ALL_ALPHABET_INDEXES: number[] = ALPHABET.map((_, index) => index)

const RAIL_STYLE_CLASSES = {
  glass: "border-border/70 bg-card/90 shadow-md shadow-black/10 backdrop-blur-md",
  solid: "border-border bg-card shadow-sm",
  minimal: "border-transparent bg-background/65 shadow-none backdrop-blur-sm",
} as const

function ModuleIcon({ icon }: { icon: string }) {
  const Icon = resolveModuleIcon(icon)
  return <Icon aria-hidden="true" />
}

export function getModulesForInitial(initial: string, modules: readonly ModuleDef[] = MODULE_REGISTRY): ModuleDef[] {
  const normalized = initial.trim().slice(0, 1).toLocaleUpperCase()
  if (!normalized) return []
  return modules.filter((module) => module.name.toLocaleUpperCase().startsWith(normalized))
}

/**
 * 索引条上真正列出来的首字母。
 *
 * `hideEmpty` 关着时就是全长 26 格（位置固定，字母不随插件增删而挪位）；开着时只留
 * **至少有一个节点**的首字母。判据复用悬停那栏的同一个 `getModulesForInitial`——
 * 两处各写一份"哪个字母有节点"就会漂移（"内部字母不算首字母"是这条规则的一部分，
 * `getModulesForInitial` 的既有用例已经钉住了它）。
 */
export function getVisibleInitials(modules: readonly ModuleDef[], hideEmpty: boolean): string[] {
  if (!hideEmpty) return ALPHABET
  return ALPHABET.filter((letter) => getModulesForInitial(letter, modules).length > 0)
}

/**
 * 在**允许停靠的**字母之间滚动一格。
 *
 * `allowed` 是下标的列表（升序），默认全集 ⇒ 行为与加这个参数之前逐字一致。
 * 传进过滤后的集合时，滚轮/方向键自然跳过被收起来的字母，不会停在看不见的格子上。
 */
export function getNextAlphabetIndex(
  index: number,
  direction: number,
  allowed: readonly number[] = ALL_ALPHABET_INDEXES,
): number {
  const first = allowed[0]
  if (first === undefined) return index
  // 当前停的地方不在集合里（刚打开隐藏空字母、或插件增删改了首字母集合）：落到最前那一个，
  // 由调用方下一次滚动带着方向继续走。这里返回 `index` 之外的任何值都比"停在看不见的格子"诚实。
  const position = allowed.indexOf(index)
  if (position === -1) return first
  const step = direction < 0 ? -1 : 1
  return allowed[(position + step + allowed.length) % allowed.length] ?? index
}

export function AlphabetNodeRail() {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const workspaceActions = useWorkspaceActions()
  const { openComponent } = useWindowControls()
  const appearance = useWorkspaceShallowSelector((state) => ({
    activeWorkspaceId: state.activeWorkspaceId,
    viewMode: state.viewMode,
    visible: state.alphabetIndexVisible,
    opacity: state.alphabetIndexOpacity,
    style: state.alphabetIndexStyle,
    waveIntensity: state.alphabetIndexWaveIntensity,
    hideEmpty: state.alphabetIndexHideEmpty,
    zCounter: state.zCounter,
  }))
  const [activeIndex, setActiveIndex] = useState(DEFAULT_INITIAL_INDEX)
  const [open, setOpen] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [announce, setAnnounce] = useState("")
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const keyboardInteractionRef = useRef(false)
  const restoreTriggerFocusRef = useRef(false)
  const suppressDeployForModuleRef = useRef<string | null>(null)
  const contributed = useContributedModules()
  const visibleInitials = useMemo(
    // `allModules()` owns the merge so no listing restates it; `contributed` is still the dependency
    // because it is what makes this component re-render when a plugin contributes or un-contributes.
    () => getVisibleInitials(allModules(), appearance.hideEmpty),
    [appearance.hideEmpty, contributed],
  )
  const visibleIndexes = useMemo(
    () => visibleInitials.map((letter) => ALPHABET.indexOf(letter)),
    [visibleInitials],
  )
  // 被收起来的那个字母不许当停靠点：先落到最前一个可见字母（state 随后由下面的 effect 跟上），
  // 否则 `activeInitial` 会让 `PopoverAnchor` 整条缺席——弹出层会脱锚落在屏幕角落。
  const settledIndex = visibleIndexes.includes(activeIndex)
    ? activeIndex
    : visibleIndexes[0] ?? activeIndex
  const activeInitial = ALPHABET[settledIndex] ?? "A"
  const matchingModules = useMemo(
    () => getModulesForInitial(activeInitial, allModules()),
    [activeInitial, contributed],
  )
  const popoverAlign = settledIndex <= 8 ? "start" : settledIndex >= 17 ? "end" : "center"
  // 每格宽度固定：字母少了就把整条按比例收短（居中），不去把剩下的字母摊开成一排空旷的格子。
  const railWidthRatio = visibleInitials.length / ALPHABET.length

  useEffect(() => {
    if (visibleIndexes.includes(activeIndex)) return
    const fallback = visibleIndexes[0]
    if (fallback === undefined) return
    setActiveIndex(fallback)
  }, [visibleIndexes, activeIndex])

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
  }, [])

  const collapse = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
    setOpen(false)
    setExpanded(false)
  }, [])

  useEffect(() => {
    if (expanded || !restoreTriggerFocusRef.current) return
    // Restoring focus must not immediately wake the capsule again.
    const trigger = document.querySelector<HTMLButtonElement>('[data-testid="alphabet-node-capsule"]')
    trigger?.focus({ preventScroll: true })
    restoreTriggerFocusRef.current = false
  }, [expanded])

  const keepOpen = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setExpanded(true)
  }, [])

  const scheduleClose = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      const focused = document.activeElement
      if (keyboardInteractionRef.current && focused?.closest('[data-testid="alphabet-node-rail"], [data-testid="alphabet-node-results"]')) return
      collapse()
    }, 360)
  }, [collapse])

  const handleFocus = useCallback((event: FocusEvent<HTMLElement>) => {
    if (restoreTriggerFocusRef.current) return
    if (event.target.matches(":focus-visible")) keyboardInteractionRef.current = true
    keepOpen()
  }, [keepOpen])

  const handleBlur = useCallback((event: FocusEvent<HTMLElement>) => {
    const next = event.relatedTarget as Element | null
    if (next?.closest('[data-testid="alphabet-node-rail"], [data-testid="alphabet-node-results"]')) return
    scheduleClose()
  }, [scheduleClose])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    keyboardInteractionRef.current = true
    if (event.key === "Escape") {
      event.preventDefault()
      event.stopPropagation()
      restoreTriggerFocusRef.current = true
      collapse()
      return
    }
    if (event.key === "ArrowDown" && !(event.target as Element).closest('[data-testid="alphabet-node-results"]')) {
      event.preventDefault()
      document.querySelector<HTMLElement>('[data-testid="alphabet-node-results"] [cmdk-item]')?.focus()
      return
    }
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return
    event.preventDefault()
    const next = event.key === "Home" ? visibleIndexes[0]
      : event.key === "End" ? visibleIndexes[visibleIndexes.length - 1]
      : getNextAlphabetIndex(settledIndex, event.key === "ArrowLeft" ? -1 : 1, visibleIndexes)
    if (next === undefined) return
    const letter = ALPHABET[next]
    document.getElementById(`alphabet-node-letter-${letter}`)?.focus()
  }, [collapse, settledIndex, visibleIndexes])

  const handleWheel = useCallback((event: WheelEvent<HTMLElement>) => {
    if (event.deltaY === 0) return
    event.preventDefault()
    event.stopPropagation()
    keepOpen()
    setOpen(true)
    setActiveIndex((current) => getNextAlphabetIndex(current, event.deltaY < 0 ? 1 : -1, visibleIndexes))
  }, [keepOpen, visibleIndexes])

  const selectInitial = useCallback((index: number) => {
    keepOpen()
    setActiveIndex(index)
    setOpen(true)
  }, [keepOpen])

  const deployModule = useCallback((module: ModuleDef) => {
    workspaceActions.deployComponent(module.id, appearance.viewMode)
    setAnnounce(t("common:alphabetLauncher.added", { name: module.name }))
    if (keyboardInteractionRef.current) restoreTriggerFocusRef.current = true
    collapse()
  }, [appearance.viewMode, collapse, t, workspaceActions])

  const selectModule = useCallback((module: ModuleDef) => {
    if (suppressDeployForModuleRef.current === module.id) {
      suppressDeployForModuleRef.current = null
      return
    }
    deployModule(module)
  }, [deployModule])

  const suppressModuleDeploy = useCallback((moduleId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    suppressDeployForModuleRef.current = moduleId
    event.stopPropagation()
  }, [])

  const openModuleInWindow = useCallback((module: ModuleDef, event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    window.setTimeout(() => {
      if (suppressDeployForModuleRef.current === module.id) suppressDeployForModuleRef.current = null
    }, 0)

    const now = Date.now()
    const componentId = `alphabet-window-${module.id}-${now}`
    const floatingComponent: ComponentInstance = {
      id: componentId,
      moduleId: module.id,
      state: "floating",
      placement: "window",
      position: { x: 20, y: 20 },
      size: { w: 460, h: 380 },
      z: appearance.zCounter + 1,
      collapsed: false,
      workspaceId: appearance.activeWorkspaceId,
      flowPosition: { x: 100, y: 100 },
      flowSize: { width: 384, height: 320 },
      createdAt: now,
      updatedAt: now,
    }

    workspaceActions.ensureComponent(floatingComponent)
    void openComponent({
      componentId,
      moduleId: module.id,
      title: module.name,
      width: floatingComponent.size?.w,
      height: floatingComponent.size?.h,
    }).then((result) => {
      if (result.success) {
        setAnnounce(t("common:openedInNewWindow", { name: module.name }))
        return
      }
      workspaceActions.removeComponent(componentId)
      setAnnounce(result.message)
    }).catch(() => {
      workspaceActions.removeComponent(componentId)
      setAnnounce(t("common:unableToOpenInNewWindow", { name: module.name }))
    })
    if (keyboardInteractionRef.current) restoreTriggerFocusRef.current = true
    collapse()
  }, [appearance.activeWorkspaceId, appearance.zCounter, collapse, openComponent, t, workspaceActions])

  if (!appearance.visible) return null
  // 一个可见字母都没有（只可能发生在"隐藏空字母"开着、且没有任何节点时）：留着一条空壳既点不出东西
  // 也没有锚点，直接不渲染。等有节点进来时 `contributed` 变化会把这一条带回来。
  if (visibleInitials.length === 0) return null

  return (
    <BuoyantNodeRail
      expanded={expanded}
      announcement={announce}
      widthRatio={railWidthRatio}
      surfaceClassName={RAIL_STYLE_CLASSES[appearance.style]}
      onExpand={() => {
        if (document.activeElement?.getAttribute("data-testid") === "alphabet-node-capsule" && !expanded && restoreTriggerFocusRef.current) return
        keepOpen()
      }}
      aria-label={t("common:alphabetLauncher.label")}
      data-testid="alphabet-node-rail"
      onPointerEnter={(event) => { if (event.pointerType !== "touch") keepOpen() }}
      onPointerDownCapture={() => { keyboardInteractionRef.current = false }}
      onKeyDownCapture={handleKeyDown}
      onPointerLeave={scheduleClose}
      onFocusCapture={handleFocus}
      onBlurCapture={handleBlur}
      onWheel={handleWheel}
      style={{
        opacity: appearance.opacity / 100,
      }}
    >
      <Popover open={open} onOpenChange={(next) => {
        if (next) { keepOpen(); setOpen(true) }
        else collapse()
      }}>
        <div className="flex h-7 w-full items-center px-1">
          <div
            className="relative grid w-full items-center"
            style={{ gridTemplateColumns: `repeat(${visibleInitials.length}, minmax(0, 1fr))` }}
            aria-label={t("common:alphabetLauncher.letters")}
            role="listbox"
            aria-activedescendant={`alphabet-node-letter-${activeInitial}`}
          >
            <PopoverAnchor asChild>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 h-6 -translate-y-1/2"
                style={{ left: `${visibleInitials.indexOf(activeInitial) / visibleInitials.length * 100}%`, width: `${100 / visibleInitials.length}%` }}
              />
            </PopoverAnchor>
            {visibleInitials.map((letter) => {
              const index = ALPHABET.indexOf(letter)
              const active = index === settledIndex
              const distance = Math.abs(index - settledIndex)
              const nearScale = distance === 1
                ? 1 + appearance.waveIntensity / 2500
                : distance === 2
                  ? 1 + appearance.waveIntensity / 5000
                  : 1
              const letterButton = (
                <Button
                  key={letter}
                  id={`alphabet-node-letter-${letter}`}
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className={cn(
                    "h-6 w-full min-w-0 rounded-full p-0 font-mono text-[10px] font-semibold transition-[color,background-color,box-shadow,transform] duration-200 ease-out",
                    active
                      ? "bg-primary/15 text-primary shadow-[inset_0_-1px_0_var(--primary)] hover:bg-primary/20"
                      : distance <= 2
                        ? "text-foreground/80 hover:bg-muted hover:text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                  style={{ transform: `scale(${reduceMotion ? 1 : active ? 1 + appearance.waveIntensity / 1000 : nearScale})` }}
                  tabIndex={expanded && active ? 0 : -1}
                  aria-selected={active}
                  aria-label={t("common:alphabetLauncher.matches", { letter, count: getModulesForInitial(letter, allModules()).length })}
                  title={t("common:alphabetLauncher.matches", { letter, count: getModulesForInitial(letter, allModules()).length })}
                  onPointerEnter={(event) => { if (event.pointerType !== "touch") selectInitial(index) }}
                  onFocus={() => selectInitial(index)}
                  onClick={() => selectInitial(index)}
                  data-letter-index={index}
                  data-testid={`alphabet-node-letter-${letter}`}
                  role="option"
                >
                  {letter}
                </Button>
              )
              return letterButton
            })}
          </div>
        </div>
        <PopoverContent
          side="top"
          align={popoverAlign}
          sideOffset={6}
          collisionPadding={8}
          className={cn("w-[min(92vw,360px)] p-0", RAIL_STYLE_CLASSES[appearance.style])}
          style={{ opacity: appearance.opacity / 100 }}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            // The letters are a sibling of the portalled list, and belong to the same launcher.
            if ((event.target as Element).closest('[data-testid="alphabet-node-rail"]')) event.preventDefault()
          }}
          onPointerEnter={keepOpen}
          onPointerLeave={scheduleClose}
          onFocusCapture={handleFocus}
          onBlurCapture={handleBlur}
          onPointerDownCapture={() => { keyboardInteractionRef.current = false }}
          onWheel={(event) => event.preventDefault()}
          data-testid="alphabet-node-results"
        >
          <Command key={activeInitial} loop>
            <CommandList className="!max-h-none !overflow-visible">
              <CommandEmpty>{t("common:alphabetLauncher.empty", { letter: activeInitial })}</CommandEmpty>
              <CommandGroup heading={t("common:alphabetLauncher.matches", { letter: activeInitial, count: matchingModules.length })}>
                {matchingModules.map((module) => (
                  <CommandItem
                    key={module.id}
                    value={`${module.name} ${module.id}`}
                    tabIndex={0}
                    className="group/result h-8 min-h-8 items-center py-1 text-xs"
                    onSelect={() => selectModule(module)}
                    data-testid={`alphabet-node-result-${module.id}`}
                  >
                    <ModuleIcon icon={module.icon} />
                    <span className="flex min-w-0 flex-1 items-center gap-1">
                      <span className="shrink-0 text-xs font-medium">{module.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="size-6 shrink-0 opacity-0 transition-opacity group-hover/result:opacity-100 group-focus-within/result:opacity-100 focus-visible:opacity-100"
                        aria-label={t("common:openFloatingWindow", { name: module.name })}
                        title={t("common:openFloatingWindow")}
                        onPointerDown={(event) => suppressModuleDeploy(module.id, event)}
                        onClick={(event) => openModuleInWindow(module, event)}
                        data-testid={`alphabet-node-open-window-${module.id}`}
                      >
                        <ExternalLink data-icon="inline-start" />
                      </Button>
                      <span className="min-w-0 truncate text-[10px] font-normal text-muted-foreground">{module.description}</span>
                    </span>
                    <CommandShortcut className="max-w-16 shrink-0 truncate text-[9px]">{module.id}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </BuoyantNodeRail>
  )
}
