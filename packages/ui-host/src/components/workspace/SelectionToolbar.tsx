import { useState } from "react"
import { useTranslation } from "react-i18next"
import { AnimatePresence, motion } from "motion/react"
import { Copy, Trash2, ChevronsUpDown, Share2, ArrowRight, X } from "lucide-react"
import { useWorkspaceShallowSelector, useWorkspaceActions } from "@/store/workspaceStore"
import { COMPONENT_VIEW_MODES, type ComponentViewMode } from "@/store/workspace/constants"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Magnet } from "@/components/ui/magnet"
import { cn } from "@/lib/utils"

/**
 * 多选浮动操作栏。当 selectedComponentIds 非空时在画布底部居中浮现。
 * 提供：移动到视图、折叠/展开、复制、删除、取消选择。
 */
export function SelectionToolbar() {
  const { t } = useTranslation()
  const actions = useWorkspaceActions()
  const selectedIds = useWorkspaceShallowSelector((s) => s.selectedComponentIds)
  const viewMode = useWorkspaceShallowSelector((s) => s.viewMode)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const count = selectedIds.length
  // Flow canvas selection uses tldraw's own selection affordances; keep this
  // disabled there for now until the bulk action bar is useful in that context.
  const visible = count > 0 && viewMode !== "dashboard" && viewMode !== "cards" && viewMode !== "flow"

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.92 }}
          transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.6 }}
          className="xiranite-ui-copy pointer-events-auto absolute bottom-4 left-1/2 z-50 -translate-x-1/2"
        >
          <div className="xiranite-node-chrome-pill flex items-center gap-0.5 rounded-lg border border-border/40 bg-background/80 p-1 shadow-lg backdrop-blur-xl ring-1 ring-border/20">
            {/* 选中计数 */}
            <span className="px-2.5 text-xs font-mono font-semibold tabular-nums text-muted-foreground">
              {count}
            </span>

            <div className="mx-0.5 h-5 w-px bg-border/50" />

            {/* 移动到视图 */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <ToolbarButton
                  icon={<Share2 className="h-3.5 w-3.5" />}
                  label={t("common:moveToView")}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" collisionPadding={8} className="min-w-[10rem]">
                {COMPONENT_VIEW_MODES
                  .filter((mode) => mode !== viewMode)
                  .map((mode) => (
                    <DropdownMenuItem
                      key={mode}
                      onSelect={() => {
                        actions.setComponentsVisibility(selectedIds, viewMode as ComponentViewMode, false)
                        actions.setComponentsVisibility(selectedIds, mode, true)
                        actions.setViewMode(mode)
                      }}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      <span>{t(`topbar:viewMode.${mode}`)}</span>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* 折叠/展开 */}
            <ToolbarButton
              icon={<ChevronsUpDown className="h-3.5 w-3.5" />}
              label={t("common:toggleCollapse")}
              onClick={() => actions.toggleCollapseComponents(selectedIds)}
            />

            {/* 复制 */}
            <ToolbarButton
              icon={<Copy className="h-3.5 w-3.5" />}
              label={t("common:duplicate")}
              onClick={() => actions.duplicateComponents(selectedIds)}
            />

            <div className="mx-0.5 h-5 w-px bg-border/50" />

            {/* 删除 */}
            <ToolbarButton
              icon={<Trash2 className="h-3.5 w-3.5" />}
              label={t("common:delete")}
              danger
              onClick={() => {
                if (confirmDelete) {
                  actions.removeComponents(selectedIds)
                  setConfirmDelete(false)
                } else {
                  setConfirmDelete(true)
                  // 3 秒后自动取消确认状态
                  setTimeout(() => setConfirmDelete(false), 3000)
                }
              }}
              highlight={confirmDelete}
            />

            {/* 取消选择 */}
            <ToolbarButton
              icon={<X className="h-3.5 w-3.5" />}
              label={t("common:cancel")}
              onClick={() => actions.clearSelection()}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function ToolbarButton({
  icon,
  label,
  onClick,
  danger,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  danger?: boolean
  highlight?: boolean
}) {
  return (
    <Magnet magnetStrength={6} padding={24} wrapperClassName="inline-flex">
      <button
        type="button"
        title={label}
        aria-label={label}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onClick}
        className={cn(
          "grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/70",
          danger
            ? "hover:bg-destructive/10 hover:text-destructive"
            : "hover:bg-muted/55 hover:text-primary",
          highlight && "bg-destructive/15 text-destructive",
        )}
      >
        {icon}
      </button>
    </Magnet>
  )
}
