export interface TaskMutationMeta {
  readonly clientRequestId: string
  readonly expectedRevision: string
}

export interface TaskEditChanges {
  readonly deadline?: null | string
  readonly nextAction?: null | string
  readonly priority?: null | string
  readonly projectRef?: null | string
  readonly title?: string
  readonly type?: null | string
}

export interface TaskMutationResult {
  readonly action: 'complete' | 'defer' | 'edit'
  readonly changed: Readonly<Record<string, unknown>>
  readonly idempotent: boolean
  readonly newRevision: string
  readonly success: true
  readonly workId: string
}

export interface WorkspaceTaskMutationTransport {
  readonly scope: string
  completeTask(workId: string, meta: TaskMutationMeta): Promise<TaskMutationResult>
  deferTask(workId: string, request: TaskMutationMeta & { readonly deadline: string }): Promise<TaskMutationResult>
  editTask(workId: string, request: TaskMutationMeta & { readonly changes: TaskEditChanges }): Promise<TaskMutationResult>
}

export class WorkspaceTaskMutationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
    readonly code: string
  ) {
    super(message)
    this.name = 'WorkspaceTaskMutationError'
  }
}

export function isRevisionConflict(error: unknown): boolean {
  return error instanceof WorkspaceTaskMutationError && error.statusCode === 409 && error.code === 'revision_conflict'
}
