import type { RuntimeInterface } from "../runtime/runtime"
import { NodeRunnerService } from "./nodeRunnerService"
import { WindowService } from "./windowService"
import { WorkspaceService } from "./workspaceService"

export interface ServiceContext {
  runtime: RuntimeInterface
}

export interface Service<TName extends string = string> {
  readonly name: TName
}

export type { NodeRunnerService, WindowService, WorkspaceService }

export interface Backend {
  workspace: WorkspaceService
  nodes: NodeRunnerService
  windows: WindowService
}

export function createBackend(ctx: ServiceContext): Backend {
  return {
    workspace: new WorkspaceService(ctx),
    nodes: new NodeRunnerService(ctx),
    windows: new WindowService(ctx),
  }
}
