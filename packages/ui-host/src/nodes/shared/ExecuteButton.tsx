import type { ComponentProps, ReactNode, Ref } from "react"
import { Play, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { FuseButton } from "@/components/ui/fuse-button"
import { useWorkspaceStore } from "@/store/workspaceStore"

/**
 * 危险执行的唯一确认闸门。
 *
 * 取代此前 20 处各写一遍的内联 AlertDialog。判定只有一行：危险 **且** Hazard
 * 未上膛时才需要确认。Hazard 的完整语义由此成为「真执行 + 不追问」——它此前
 * 只强制关 dry-run，而关掉 dry-run 反而会把 `!(data.dryRun ?? true)` 这类确认条
 * 件点亮，所以旧行为是「上膛后确认框变多」。
 *
 * 确认形态从「弹窗 + 第二次点击」换成就地引信：点一下进入armed，引信烧完
 * （fuseEnd）才真正提交，期间点撤销或 Esc 即中止。窗口停在中途，误触不会被
 * 迫做完第二次动作。
 */
export interface ExecuteButtonProps {
  /** 本次执行是否真会改动文件 / 触发不可逆动作 —— 节点的领域判断 */
  dangerous: boolean
  /** 真正发起执行的调用，确认通过（或无需确认 / Hazard 上膛）后才会被调到 */
  onExecute: () => void
  /** 动作名，同时用作图标态下的无障碍名 */
  label: ReactNode
  idleIcon?: ReactNode
  running?: boolean
  disabled?: boolean
  compact?: boolean
  size?: ComponentProps<typeof Button>["size"]
  /** 引信窗口；不可撤销的动作应当更长，给用户留出中止时间 */
  undoWindow?: number
  /**
   * 非危险态的按钮变体。默认危险→destructive、否则→default；节点自己按动作切换
   * 配色时（如 classq 的 plan 走 secondary）在这里传，不得回退成内联对话框。
   */
  variant?: ComponentProps<typeof Button>["variant"]
  /** 运行态的无障碍名与文案，节点各自的历史值不同，保留可覆写 */
  runningAriaLabel?: string
  runningLabel?: ReactNode
  /** TooltipTrigger asChild 等包装需要锚点，转发到根元素 */
  ref?: Ref<HTMLElement>
  className?: string
}

/** 引信烧完即提交，因此窗口长度就是「可反悔时长」。 */
export const DANGER_FUSE_MS = 4000

/**
 * 三根分支分别落在 <button>（直接执行）、<button>（运行态）与 <span>（引信），
 * 而 React 的 Ref<T> 对 RefObject 是不变的，所以对外统一收 HTMLElement，在两个
 * 落点各做一次窄化。调用方要的是一个可锚定的 DOM 节点，不是具体标签。
 */
type ExecuteRef = Ref<HTMLElement> | undefined
const asButtonRef = (ref: ExecuteRef) => ref as Ref<HTMLButtonElement>
const asSpanRef = (ref: ExecuteRef) => ref as Ref<HTMLSpanElement>

export function ExecuteButton({
  dangerous,
  onExecute,
  label,
  idleIcon = <Play />,
  running = false,
  disabled = false,
  compact = false,
  size,
  undoWindow = DANGER_FUSE_MS,
  variant,
  runningAriaLabel = "running",
  runningLabel = "运行中",
  ref,
  className,
}: ExecuteButtonProps) {
  const hazardMode = useWorkspaceStore((state) => state.hazardMode)

  if (running) {
    return (
      <Button ref={asButtonRef(ref)} aria-label={runningAriaLabel} disabled size={size ?? (compact ? "icon-sm" : "sm")} variant="secondary" className={className}>
        <Square />
        {!compact && runningLabel}
      </Button>
    )
  }

  const buttonSize = size ?? (compact ? "icon-sm" : "sm")

  // 非危险动作（预览/扫描）与 Hazard 上膛后走同一条路：一次点击直接执行。
  if (!dangerous || hazardMode) {
    return (
      <Button
        ref={asButtonRef(ref)}
        aria-label={typeof label === "string" ? label : undefined}
        size={buttonSize}
        variant={variant ?? (dangerous ? "destructive" : "default")}
        disabled={disabled}
        className={className}
        onClick={onExecute}
      >
        {idleIcon}
        {!compact && label}
      </Button>
    )
  }

  const text = typeof label === "string" ? label : undefined

  return (
    <FuseButton
      ref={asSpanRef(ref)}
      className={className}
      size={compact ? "sm" : "md"}
      icon={idleIcon}
      label={compact ? null : label}
      undoLabel={compact ? null : "撤销"}
      doneLabel={compact ? null : "已发起"}
      idleAriaLabel={text}
      undoAriaLabel="取消本次危险执行"
      commitOn="fuseEnd"
      pauseOnHover
      undoWindow={undoWindow}
      disabled={disabled}
      onCommit={onExecute}
    />
  )
}
