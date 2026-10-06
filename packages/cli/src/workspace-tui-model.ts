import type { ComponentDTO, WorkspaceSnapshotDTO } from "@xiranite/shared"

export const BENTO_COLUMNS = 12

export function deployNode(snapshot: WorkspaceSnapshotDTO, workspaceId: string, moduleId: string, now = Date.now()): { snapshot: WorkspaceSnapshotDTO; componentId: string } {
  const existing = snapshot.components.filter((item) => item.workspaceId === workspaceId)
  const componentId = `comp-tui-${now}-${existing.length + 1}`
  const component: ComponentDTO = {
    id: componentId,
    moduleId,
    workspaceId,
    bentoLayout: nextLayout(existing),
    createdAt: now,
    updatedAt: now,
  }
  return { snapshot: { ...snapshot, components: [...snapshot.components, component] }, componentId }
}

export function removeNode(snapshot: WorkspaceSnapshotDTO, componentId: string): WorkspaceSnapshotDTO {
  return {
    ...snapshot,
    components: snapshot.components.filter((item) => item.id !== componentId),
    lanes: snapshot.lanes.map((lane) => ({ ...lane, cardOrder: lane.cardOrder?.filter((id) => id !== componentId) })),
  }
}

export function patchNodeLayout(snapshot: WorkspaceSnapshotDTO, componentId: string, patch: Partial<NonNullable<ComponentDTO["bentoLayout"]>>, now = Date.now()): WorkspaceSnapshotDTO {
  return {
    ...snapshot,
    components: snapshot.components.map((component) => {
      if (component.id !== componentId) return component
      const current = component.bentoLayout ?? { x: 0, y: 0, w: 4, h: 4 }
      const w = clamp(Math.round(patch.w ?? current.w), 2, BENTO_COLUMNS)
      const h = Math.max(2, Math.round(patch.h ?? current.h))
      const x = clamp(Math.round(patch.x ?? current.x), 0, BENTO_COLUMNS - w)
      const y = Math.max(0, Math.round(patch.y ?? current.y))
      return { ...component, bentoLayout: { x, y, w, h }, updatedAt: now }
    }),
  }
}

export function projectTerminalLayout(components: readonly ComponentDTO[], availableColumns: number): Array<ComponentDTO & { terminalWidth: number; terminalHeight: number }> {
  const unit = Math.max(2, Math.floor(Math.max(24, availableColumns) / BENTO_COLUMNS))
  return [...components]
    .sort((left, right) => (left.bentoLayout?.y ?? 0) - (right.bentoLayout?.y ?? 0) || (left.bentoLayout?.x ?? 0) - (right.bentoLayout?.x ?? 0))
    .map((component) => ({
      ...component,
      terminalWidth: Math.max(14, Math.min(availableColumns, (component.bentoLayout?.w ?? 4) * unit)),
      terminalHeight: Math.max(4, Math.min(12, component.bentoLayout?.h ?? 4)),
    }))
}

function nextLayout(existing: readonly ComponentDTO[]) {
  const index = existing.length
  return { x: (index * 4) % BENTO_COLUMNS, y: Math.floor(index / 3) * 4, w: 4, h: 4 }
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }
