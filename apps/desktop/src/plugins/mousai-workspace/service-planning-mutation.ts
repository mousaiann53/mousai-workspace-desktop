import type { PlanningProposal, ScheduleBlock } from './domain'

export interface PlanningMutationResult {
  readonly proposal: PlanningProposal
  readonly scheduleBlock: ScheduleBlock | null
  readonly idempotent: boolean
}

export interface PlanningRegisterRequest {
  readonly clientRequestId: string
  readonly workId: string
  readonly startsAt: string
  readonly endsAt: string
  readonly executor: string | null
  readonly estimatedDurationMinutes: number
  readonly actor: string
}

export interface PlanningCommandMeta {
  readonly clientRequestId: string
  readonly expectedRevision: number
  readonly actor: string
}

export class WorkspacePlanningMutationError extends Error {
  constructor(
    message: string,
    readonly statusCode: number | null,
    readonly code: string
  ) {
    super(message)
    this.name = 'WorkspacePlanningMutationError'
  }
}

export interface WorkspacePlanningMutationTransport {
  registerPlanningProposal(request: PlanningRegisterRequest): Promise<PlanningMutationResult>
  acceptPlanningProposal(proposalId: string, request: PlanningCommandMeta): Promise<PlanningMutationResult>
  adjustPlanningProposal(
    proposalId: string,
    request: PlanningCommandMeta & { readonly startsAt: string; readonly endsAt: string; readonly reason: string }
  ): Promise<PlanningMutationResult>
  ignorePlanningProposal(
    proposalId: string,
    request: PlanningCommandMeta & { readonly reason: string }
  ): Promise<PlanningMutationResult>
}

export function planningClientRequestId(action: string, ...parts: readonly (number | string)[]): string {
  const raw = [action, ...parts].join(':').toLowerCase()
  let hash = 2166136261

  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  const suffix = (hash >>> 0).toString(16).padStart(8, '0')

  return `desktop:planning:${action}:${suffix}`
}
