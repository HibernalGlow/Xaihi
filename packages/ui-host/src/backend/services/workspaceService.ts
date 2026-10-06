import type { Service, ServiceContext } from "."
import type { ComponentDTO, LaneDTO, WorkspaceDTO } from "../shared/types"
import type { RuntimeInterface } from "../runtime/runtime"

const KEY_WORKSPACES = "xiranite:workspaces"
const KEY_LANES = "xiranite:lanes"
const KEY_COMPONENTS = "xiranite:components"

export interface WorkspaceServiceAPI {
  listWorkspaces(): Promise<WorkspaceDTO[]>
  saveWorkspace(workspace: WorkspaceDTO): Promise<void>
  deleteWorkspace(id: string): Promise<void>
  listLanes(): Promise<LaneDTO[]>
  listLanesByWorkspace(workspaceId: string): Promise<LaneDTO[]>
  saveLane(lane: LaneDTO): Promise<void>
  deleteLane(id: string): Promise<void>
  listComponents(): Promise<ComponentDTO[]>
  listComponentsByWorkspace(workspaceId: string): Promise<ComponentDTO[]>
  saveComponent(component: ComponentDTO): Promise<void>
  deleteComponent(id: string): Promise<void>
}

export class WorkspaceService implements Service<"workspace">, WorkspaceServiceAPI {
  readonly name = "workspace"

  private readonly ctx: ServiceContext
  private cache: {
    workspaces?: WorkspaceDTO[]
    lanes?: LaneDTO[]
    components?: ComponentDTO[]
  } = {}

  constructor(ctx: ServiceContext) {
    this.ctx = ctx
  }

  private get runtime(): RuntimeInterface {
    return this.ctx.runtime
  }

  async listWorkspaces(): Promise<WorkspaceDTO[]> {
    if (!this.cache.workspaces) {
      this.cache.workspaces = await this.readList<WorkspaceDTO>(KEY_WORKSPACES)
    }
    return this.cache.workspaces
  }

  async saveWorkspace(workspace: WorkspaceDTO): Promise<void> {
    const next = upsertById(await this.listWorkspaces(), workspace)
    await this.persistWorkspaces(next)
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.persistWorkspaces((await this.listWorkspaces()).filter((workspace) => workspace.id !== id))
    await this.persistLanes((await this.listLanes()).filter((lane) => lane.workspaceId !== id))
    await this.persistComponents((await this.listComponents()).filter((component) => component.workspaceId !== id))
  }

  async listLanes(): Promise<LaneDTO[]> {
    if (!this.cache.lanes) {
      this.cache.lanes = await this.readList<LaneDTO>(KEY_LANES)
    }
    return this.cache.lanes
  }

  async listLanesByWorkspace(workspaceId: string): Promise<LaneDTO[]> {
    return (await this.listLanes()).filter((lane) => lane.workspaceId === workspaceId)
  }

  async saveLane(lane: LaneDTO): Promise<void> {
    const next = upsertById(await this.listLanes(), lane)
    await this.persistLanes(next)
  }

  async deleteLane(id: string): Promise<void> {
    await this.persistLanes((await this.listLanes()).filter((lane) => lane.id !== id))
  }

  async listComponents(): Promise<ComponentDTO[]> {
    if (!this.cache.components) {
      this.cache.components = await this.readList<ComponentDTO>(KEY_COMPONENTS)
    }
    return this.cache.components
  }

  async listComponentsByWorkspace(workspaceId: string): Promise<ComponentDTO[]> {
    return (await this.listComponents()).filter((component) => component.workspaceId === workspaceId)
  }

  async saveComponent(component: ComponentDTO): Promise<void> {
    const next = upsertById(await this.listComponents(), component)
    await this.persistComponents(next)
  }

  async deleteComponent(id: string): Promise<void> {
    await this.persistComponents((await this.listComponents()).filter((component) => component.id !== id))
  }

  private async readList<T>(key: string): Promise<T[]> {
    const raw = await this.runtime.storage.get(key)
    return raw ? JSON.parse(raw) as T[] : []
  }

  private async persistWorkspaces(workspaces: WorkspaceDTO[]): Promise<void> {
    this.cache.workspaces = workspaces
    await this.runtime.storage.set(KEY_WORKSPACES, JSON.stringify(workspaces))
  }

  private async persistLanes(lanes: LaneDTO[]): Promise<void> {
    this.cache.lanes = lanes
    await this.runtime.storage.set(KEY_LANES, JSON.stringify(lanes))
  }

  private async persistComponents(components: ComponentDTO[]): Promise<void> {
    this.cache.components = components
    await this.runtime.storage.set(KEY_COMPONENTS, JSON.stringify(components))
  }
}

function upsertById<T extends { id: string }>(items: T[], item: T): T[] {
  const index = items.findIndex((current) => current.id === item.id)
  if (index < 0) return [...items, item]

  const next = [...items]
  next[index] = item
  return next
}
