import { useState, type KeyboardEvent } from "react"
import { useTranslation } from "react-i18next"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Trash2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"

interface Task { id: string; text: string; done: boolean }

let taskId = 0

export default function TasksModule() {
  const { t } = useTranslation()
  const [tasks, setTasks] = useState<Task[]>([
    { id: `tk-${++taskId}`, text: t("module:tasks.defaults.task1"), done: true },
    { id: `tk-${++taskId}`, text: t("module:tasks.defaults.task2"), done: false },
    { id: `tk-${++taskId}`, text: t("module:tasks.defaults.task3"), done: false },
  ])
  const [draft, setDraft] = useState("")

  function add() {
    const text = draft.trim()
    if (!text) return
    setTasks(ts => [...ts, { id: `tk-${++taskId}`, text, done: false }])
    setDraft("")
  }

  function toggle(id: string) {
    setTasks(ts => ts.map(t => t.id === id ? { ...t, done: !t.done } : t))
  }

  function remove(id: string) {
    setTasks(ts => ts.filter(t => t.id !== id))
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter") add()
  }

  const done = tasks.filter(t => t.done).length

  return (
    <div className="flex flex-col gap-2 p-1 h-full">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-mono text-muted-foreground">{t("module:tasks.complete", { done, total: tasks.length })}</span>
        <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: tasks.length ? `${(done / tasks.length) * 100}%` : "0%" }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1">
        {tasks.map(task => (
          <div
            key={task.id}
            className="flex items-start gap-2 group px-1 py-1.5 rounded hover:bg-muted/40 transition-colors"
          >
            <Checkbox
              id={task.id}
              checked={task.done}
              onCheckedChange={() => toggle(task.id)}
              className="mt-0.5 flex-shrink-0"
            />
            <label
              htmlFor={task.id}
              className={cn(
                "flex-1 text-xs font-mono leading-tight cursor-pointer",
                task.done && "line-through text-muted-foreground"
              )}
            >
              {task.text}
            </label>
            <button
              onClick={() => remove(task.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-center text-xs font-mono text-muted-foreground py-4">{t("module:tasks.empty")}</p>
        )}
      </div>

      <div className="flex gap-1">
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={onKey}
          placeholder={t("module:tasks.placeholder")}
          className="text-xs font-mono h-7 bg-muted/40 border-border/60"
        />
        <Button size="icon" className="h-7 w-7 flex-shrink-0" onClick={add}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
