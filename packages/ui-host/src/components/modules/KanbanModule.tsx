import DatabaseDataView from "./DatabaseDataView"
import type { ModuleProps } from "./ModuleRenderer"

/** Shared editable BoardView, rather than a second local-only Kanban store. */
export default function KanbanModule({ compId }: ModuleProps) {
  return <DatabaseDataView compId={compId} initialViewMode="board" />
}
