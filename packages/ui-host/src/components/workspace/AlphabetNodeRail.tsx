import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent } from "react"
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
import type { ComponentInstance, ModuleDef } from "@/types/workspace"

export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

const DEFAULT_INITIAL_INDEX = ALPHABET.indexOf("A")

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

export function getNextAlphabetIndex(index: number, direction: number): number {
  const step = direction < 0 ? -1 : 1
  return (index + step + ALPHABET.length) % ALPHABET.length
}

export function AlphabetNodeRail() {
  const { t } = useTranslation()
  const workspaceActions = useWorkspaceActions()
  const { openComponent } = useWindowControls()
  const appearance = useWorkspaceShallowSelector((state) => ({
    activeWorkspaceId: state.activeWorkspaceId,
    viewMode: state.viewMode,
    visible: state.alphabetIndexVisible,
    opacity: state.alphabetIndexOpacity,
    style: state.alphabetIndexStyle,
    waveIntensity: state.alphabetIndexWaveIntensity,
    zCounter: state.zCounter,
  }))
  const [activeIndex, setActiveIndex] = useState(DEFAULT_INITIAL_INDEX)
  const [open, setOpen] = useState(false)
  const [announce, setAnnounce] = useState("")
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const suppressDeployForModuleRef = useRef<string | null>(null)
  const activeInitial = ALPHABET[activeIndex] ?? "A"
  const contributed = useContributedModules()
  const matchingModules = useMemo(
    // `allModules()` owns the merge so no listing restates it; `contributed` is still the dependency
    // because it is what makes this component re-render when a plugin contributes or un-contributes.
    () => getModulesForInitial(activeInitial, allModules()),
    [activeInitial, contributed],
  )
  const popoverAlign = activeIndex <= 8 ? "start" : activeIndex >= 17 ? "end" : "center"

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
  }, [])

  const keepOpen = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const scheduleClose = useCallback(() => {
    closeTimerRef.current = setTimeout(() => {
      setOpen(false)
      closeTimerRef.current = null
    }, 140)
  }, [])

  const handleWheel = useCallback((event: WheelEvent<HTMLElement>) => {
    if (event.deltaY === 0) return
    event.preventDefault()
    event.stopPropagation()
    setOpen(true)
    setActiveIndex((current) => getNextAlphabetIndex(current, event.deltaY < 0 ? 1 : -1))
  }, [])

  const selectInitial = useCallback((index: number) => {
    setActiveIndex(index)
    setOpen(true)
  }, [])

  const deployModule = useCallback((module: ModuleDef) => {
    workspaceActions.deployComponent(module.id, appearance.viewMode)
    setAnnounce(`${module.name} was added to the current view.`)
    setOpen(false)
  }, [appearance.viewMode, workspaceActions])

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
      dockPanel: "default",
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
  }, [appearance.activeWorkspaceId, appearance.zCounter, openComponent, t, workspaceActions])

  if (!appearance.visible) return null

  return (
    <section
      className="xiranite-ui-copy pointer-events-auto absolute inset-x-2 bottom-1 z-20 mx-auto"
      aria-label="Alphabetical node launcher"
      data-testid="alphabet-node-rail"
      onPointerEnter={() => {
        keepOpen()
        setOpen(true)
      }}
      onPointerLeave={scheduleClose}
      onFocusCapture={keepOpen}
      onBlurCapture={scheduleClose}
      onWheel={handleWheel}
      style={{
        opacity: appearance.opacity / 100,
        width: "min(760px, calc(100vw - 1rem))",
      }}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <div className={cn("flex h-7 w-full items-center rounded-full border px-1", RAIL_STYLE_CLASSES[appearance.style])}>
          <div
            className="grid w-full items-center"
            style={{ gridTemplateColumns: "repeat(26, minmax(0, 1fr))" }}
            aria-label="Alphabet selector"
            role="listbox"
            aria-activedescendant={`alphabet-node-letter-${activeInitial}`}
          >
            {ALPHABET.map((letter, index) => {
              const active = index === activeIndex
              const distance = Math.abs(index - activeIndex)
              const nearScale = distance === 1
                ? 1 + appearance.waveIntensity / 2500
                : distance === 2
                  ? 1 + appearance.waveIntensity / 5000
                  : 1
              const letterButton = (
                <Button
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
                  style={{ transform: `scale(${active ? 1 + appearance.waveIntensity / 1000 : nearScale})` }}
                  aria-selected={active}
                  aria-label={`${letter}, ${getModulesForInitial(letter).length} matching nodes`}
                  title={`${letter}: ${getModulesForInitial(letter).length} nodes`}
                  onPointerEnter={() => selectInitial(index)}
                  onFocus={() => selectInitial(index)}
                  data-letter-index={index}
                  data-testid={`alphabet-node-letter-${letter}`}
                  role="option"
                >
                  {letter}
                </Button>
              )
              return active ? <PopoverAnchor key={letter} asChild>{letterButton}</PopoverAnchor> : <span key={letter}>{letterButton}</span>
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
          onPointerEnter={keepOpen}
          onPointerLeave={scheduleClose}
          onWheel={(event) => event.preventDefault()}
          data-testid="alphabet-node-results"
        >
          <Command key={activeInitial} loop>
            <CommandList className="!max-h-none !overflow-visible">
              <CommandEmpty>No nodes beginning with {activeInitial}</CommandEmpty>
              <CommandGroup heading={`${activeInitial} · ${matchingModules.length} nodes`}>
                {matchingModules.map((module) => (
                  <CommandItem
                    key={module.id}
                    value={`${module.name} ${module.id}`}
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
      <span className="sr-only" aria-live="polite">{announce}</span>
    </section>
  )
}
