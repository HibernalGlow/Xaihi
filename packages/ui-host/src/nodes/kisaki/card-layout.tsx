import type { DragEvent, ReactNode } from "react"
import type { KisakiCardConfig, KisakiCardId, KisakiCardLayout, KisakiCardPanelId } from "@hibernalglow/xaihi-kisaki/card-layout"
import { cardsForPanel, createDefaultKisakiCardLayout, KISAKI_CARD_REGISTRY, moveKisakiCard, moveKisakiCardBy, updateKisakiCard } from "@hibernalglow/xaihi-kisaki/card-layout"
import { ArrowDown, ArrowUp, BarChart3, ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Image, LayoutPanelTop, ListChecks, ScrollText, Settings2, Wrench, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useNodeI18n } from "@/nodes/shared/useNodeI18n"

type Translate = (key: string, fallback: string, vars?: Record<string, unknown>) => string

const DRAG_TYPE = "application/x-czkawka-card"

export function KisakiCardStack({ layout, panel, onChange, renderCard }: { layout: KisakiCardLayout; panel: KisakiCardPanelId; onChange: (layout: KisakiCardLayout) => void; renderCard: (id: KisakiCardId) => ReactNode }) {
  const { t } = useNodeI18n("kisaki")
  const cards = cardsForPanel(layout, panel)
  function dropAtEnd(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const id = event.dataTransfer.getData(DRAG_TYPE) as KisakiCardId
    if (id) onChange(moveKisakiCard(layout, id, panel, cards.length))
  }
  return (
    <div data-testid={`czkawka-card-stack-${panel}`} className="grid content-start gap-2" onDragOver={(event) => event.preventDefault()} onDrop={dropAtEnd}>
      {cards.map((card, index) => (
        <KisakiLayoutCard key={card.id} card={card} first={index === 0} last={index === cards.length - 1} onChange={onChange} layout={layout} t={t}>
          {renderCard(card.id)}
        </KisakiLayoutCard>
      ))}
      {cards.length ? null : <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">{t("cards.empty", "该面板没有可见卡片")}</div>}
    </div>
  )
}

export function KisakiCardTabs({ activeId, layout, panel, onActiveChange, renderCard }: { activeId?: KisakiCardId; layout: KisakiCardLayout; panel: KisakiCardPanelId; onActiveChange: (id: KisakiCardId) => void; renderCard: (id: KisakiCardId) => ReactNode }) {
  const { t } = useNodeI18n("kisaki")
  const cards = cardsForPanel(layout, panel)
  const active = cards.some((card) => card.id === activeId) ? activeId! : cards[0]?.id
  if (!active) return <div className="grid min-h-32 place-items-center text-xs text-muted-foreground">{t("cards.empty", "该面板没有可见卡片")}</div>
  if (cards.length === 1) return <div className="min-h-0 flex-1" data-testid={`czkawka-card-tabs-${panel}`}><ScrollArea className="h-full"><div className="p-2">{renderCard(active)}</div></ScrollArea></div>
  return <Tabs value={active} className="@container/czkawka-side-tabs flex min-h-0 min-w-0 flex-1 flex-col" data-testid={`czkawka-card-tabs-${panel}`} onValueChange={(value) => onActiveChange(value as KisakiCardId)}>
    <TabsList layout="fill" variant="line" className="mx-2 mt-1 min-w-0 shrink-0 overflow-hidden bg-transparent">{cards.map((card) => { const definition = KISAKI_CARD_REGISTRY.find((item) => item.id === card.id)!, title = cardTitle(card.id, definition.title, t), Icon = cardTabIcon(card.id); return <TabsTrigger aria-label={title} key={card.id} value={card.id} title={title} className="min-w-0 px-1.5"><Icon className="size-3.5 shrink-0" /><span className="hidden truncate @xl/czkawka-side-tabs:inline">{cardTabLabel(card.id, t)}</span></TabsTrigger> })}</TabsList>
    {cards.map((card) => <TabsContent key={card.id} value={card.id} className="min-h-0 flex-1 overflow-hidden pt-1"><ScrollArea className="h-full"><div className="p-2 pt-0">{renderCard(card.id)}</div></ScrollArea></TabsContent>)}
  </Tabs>
}

function cardTabIcon(id: KisakiCardId) { if (id === "source-settings") return Settings2; if (id === "preview") return Image; if (id === "analysis") return BarChart3; if (id === "logs") return ScrollText; if (id === "selection") return ListChecks; return Wrench }
function cardTabLabel(id: KisakiCardId, t: Translate) { if (id === "source-settings") return t("cards.tabs.scan", "扫描"); if (id === "preview") return t("cards.tabs.preview", "预览"); if (id === "analysis") return t("cards.tabs.analysis", "统计"); if (id === "logs") return t("cards.tabs.logs", "日志"); if (id === "selection") return t("cards.tabs.selection", "选择"); return t("cards.tabs.operations", "操作") }

function KisakiLayoutCard({ card, first, last, layout, onChange, children, t }: { card: KisakiCardConfig; first: boolean; last: boolean; layout: KisakiCardLayout; onChange: (layout: KisakiCardLayout) => void; children: ReactNode; t: Translate }) {
  const definition = KISAKI_CARD_REGISTRY.find((item) => item.id === card.id)!
  const title = cardTitle(definition.id, definition.title, t)
  function startDrag(event: DragEvent<HTMLElement>) {
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData(DRAG_TYPE, card.id)
  }
  function dropBefore(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    event.stopPropagation()
    const id = event.dataTransfer.getData(DRAG_TYPE) as KisakiCardId
    if (id) onChange(moveKisakiCard(layout, id, card.panel, card.order))
  }
  return (
    <article data-card-id={card.id} draggable onDragStart={startDrag} onDragOver={(event) => event.preventDefault()} onDrop={dropBefore} className="flex min-h-0 flex-col overflow-hidden rounded-md border bg-card" style={card.collapsed ? undefined : { height: card.height }}>
      <header className="flex shrink-0 items-center gap-1 border-b bg-muted/20 px-1 py-1">
        <GripVertical className="size-3 cursor-grab text-muted-foreground" />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left text-xs font-semibold"
          onClick={() =>
            onChange(
              updateKisakiCard(layout, card.id, {
                collapsed: !card.collapsed
              })
            )
          }
        >
          {card.collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
          <span className="truncate">{title}</span>
        </button>
        <Button aria-label={t("cards.moveUp", "上移{{title}}", { title })} disabled={first} size="icon-xs" variant="ghost" onClick={() => onChange(moveKisakiCardBy(layout, card.id, -1))}>
          <ArrowUp />
        </Button>
        <Button aria-label={t("cards.moveDown", "下移{{title}}", { title })} disabled={last} size="icon-xs" variant="ghost" onClick={() => onChange(moveKisakiCardBy(layout, card.id, 1))}>
          <ArrowDown />
        </Button>
      </header>
      {card.collapsed ? null : (
        <>
          <div className="min-h-0 flex-1 overflow-auto p-2">{children}</div>
          <input
            aria-label={t("cards.resize", "调整{{title}}高度", { title })}
            title={t("cards.resizeHint", "拖动调整高度，双击恢复默认")}
            className="h-1 w-full cursor-row-resize accent-primary"
            type="range"
            min={definition.minHeight}
            max={definition.maxHeight}
            step={8}
            value={card.height}
            onDoubleClick={() =>
              onChange(
                updateKisakiCard(layout, card.id, {
                  height: definition.defaultHeight
                })
              )
            }
            onChange={(event) =>
              onChange(
                updateKisakiCard(layout, card.id, {
                  height: Number(event.currentTarget.value)
                })
              )
            }
          />
        </>
      )}
    </article>
  )
}

export function KisakiCardManager({ layout, onChange }: { layout: KisakiCardLayout; onChange: (layout: KisakiCardLayout) => void }) {
  const { t } = useNodeI18n("kisaki")
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button aria-label={t("cards.manage", "管理卡片")} size="icon-sm" variant="ghost">
          <LayoutPanelTop />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("cards.managerTitle", "卡片管理")}</DialogTitle>
          <DialogDescription>{t("cards.managerDescription", "配置卡片可见性、面板归属和顺序。拖动卡片也可跨面板移动。")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1">
          {KISAKI_CARD_REGISTRY.map((definition) => {
            const card = layout.cards.find((item) => item.id === definition.id)!
            const title = cardTitle(definition.id, definition.title, t)
            return (
              <div key={definition.id} className="grid grid-cols-[minmax(0,1fr)_130px_auto] items-center gap-2 rounded-md border p-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{title}</div>
                  <div className="text-[10px] text-muted-foreground">{card.collapsed ? t("cards.collapsed", "已折叠") : `${card.height}px`}</div>
                </div>
                <Select value={card.panel} onValueChange={(panel) => onChange(moveKisakiCard(layout, card.id, panel as KisakiCardPanelId, layout.cards.filter((item) => item.panel === panel).length))}>
                  <SelectTrigger aria-label={t("cards.panel", "{{title}}面板", { title })}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="source">{t("sections.conditions", "扫描条件")}</SelectItem>
                    <SelectItem value="analysis">{t("cards.analysisOperations", "分析操作")}</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  aria-label={card.visible ? t("cards.hide", "隐藏{{title}}", { title }) : t("cards.show", "显示{{title}}", { title })}
                  size="icon-sm"
                  variant={card.visible ? "secondary" : "ghost"}
                  onClick={() =>
                    onChange(
                      updateKisakiCard(layout, card.id, {
                        visible: !card.visible
                      })
                    )
                  }
                >
                  {card.visible ? <Eye /> : <EyeOff />}
                </Button>
              </div>
            )
          })}
        </div>
        <Button variant="outline" onClick={() => onChange(createDefaultKisakiCardLayout())}>
          <RotateCcw />
          {t("cards.restore", "恢复默认布局")}
        </Button>
      </DialogContent>
    </Dialog>
  )
}

function cardTitle(id: KisakiCardId, fallback: string, t: Translate): string {
  return t(`cards.titles.${id}`, fallback)
}
