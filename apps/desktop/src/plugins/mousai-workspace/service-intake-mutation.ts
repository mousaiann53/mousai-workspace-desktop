import type { IntakeSourceType, WorkScope } from './domain'

export interface DuplicateReviewRequest {
  readonly workId: string
  readonly relatedWorkId: string
  readonly state: 'independent' | 'possible'
  readonly expectedRevisions: Readonly<Record<string, string>>
  readonly clientRequestId: string
  readonly reason: string
  readonly actor: string
}

export interface IntakeMergeRequest {
  readonly survivorWorkId: string
  readonly mergedWorkId: string
  readonly expectedRevisions: Readonly<Record<string, string>>
  readonly clientRequestId: string
  readonly reason: string
  readonly actor: string
}

export interface WorkScopeMutationRequest {
  readonly sourceType: Exclude<IntakeSourceType, 'unknown'>
  readonly scopeId: string
  readonly state: WorkScope['state']
  readonly label: string
  readonly expectedRevision: number
  readonly clientRequestId: string
  readonly actor: string
}

export interface IntakeMutationResult {
  readonly idempotent: boolean
}

export interface WorkspaceIntakeMutationTransport {
  readonly scope: string
  reviewDuplicate(request: DuplicateReviewRequest): Promise<IntakeMutationResult>
  mergeIntakeTasks(request: IntakeMergeRequest): Promise<IntakeMutationResult & { readonly survivorWorkId: string }>
  setWorkScope(request: WorkScopeMutationRequest): Promise<IntakeMutationResult>
  archiveTask(
    workId: string,
    request: { readonly clientRequestId: string; readonly expectedRevision: string }
  ): Promise<IntakeMutationResult>
  flagTask(
    workId: string,
    request: {
      readonly clientRequestId: string
      readonly expectedRevision: string
      readonly flag: 'decision_required' | 'material_missing'
      readonly note: string
    }
  ): Promise<IntakeMutationResult>
}

export class WorkspaceIntakeMutationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
    readonly code: string
  ) {
    super(message)
    this.name = 'WorkspaceIntakeMutationError'
  }
}
