export type FindzWorkerMethod =
  | "api.info"
  | "library.open"
  | "library.close"
  | "scan.start"
  | "scan.reconcile"
  | "watcher.apply_changes"
  | "analysis.start"
  | "task.get"
  | "task.pause"
  | "task.resume"
  | "task.cancel"
  | "query.archives"
  | "query.members"
  | "export.rows"
  | "projection.treemap"
  | "shutdown"

export interface FindzWorkerRequest {
  id: number
  method: FindzWorkerMethod
  params: unknown
}

export type FindzWorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: { message: string } }

export interface FindzWorkerGateway {
  call<T>(method: FindzWorkerMethod, params: unknown): Promise<T>
}
