import type { PluginRestOptions } from '@hermes/plugin-sdk'

import { adaptPlanningSnapshot } from './adapter-planning'
import { adaptProductionReviews } from './adapter-production-review'
import type { ProductionApprovedScope, ProductionBundleMeta } from './domain'
import {
  type DuplicateReviewRequest,
  type IntakeMergeRequest,
  type WorkScopeMutationRequest,
  WorkspaceIntakeMutationError,
  type WorkspaceIntakeMutationTransport
} from './service-intake-mutation'
import {
  type PlanningCommandMeta,
  type PlanningMutationResult,
  type PlanningRegisterRequest,
  WorkspacePlanningMutationError,
  type WorkspacePlanningMutationTransport
} from './service-planning-mutation'
import {
  type ProductionAction,
  ProductionActionError,
  type ProductionActionResult,
  type WorkspaceProductionActionTransport
} from './service-production-actions'
import {
  type TaskCreateInput,
  type TaskEditChanges,
  type TaskMutationMeta,
  type TaskMutationResult,
  WorkspaceTaskMutationError,
  type WorkspaceTaskMutationTransport
} from './service-task-mutation'
import type { RawWorkspaceReadSnapshot, WorkspaceReadTransport } from './service-workspace-read'

export const WORKSPACE_SNAPSHOT_SCHEMA_VERSION = 'mousai.workspace.snapshot.v1'
export const WORKSPACE_SNAPSHOT_TIMEOUT_MS = 15_000

type PluginRest = <T>(path: string, options?: PluginRestOptions) => Promise<T>

interface WorkspaceSnapshotEnvelope {
  readonly schemaVersion: typeof WORKSPACE_SNAPSHOT_SCHEMA_VERSION
  readonly generatedAt: string
  readonly projects: readonly unknown[]
  readonly tasks: readonly unknown[]
  readonly events: readonly unknown[]
  readonly deliverables: readonly unknown[]
  readonly productionReviews: readonly unknown[]
  readonly scheduleBlocks: readonly unknown[]
  readonly fixedEvents: readonly unknown[]
  readonly planningProposals: readonly unknown[]
  readonly planningEvents: readonly unknown[]
  readonly ingestEvents: readonly unknown[]
  readonly duplicateEvidence: readonly unknown[]
  readonly workScope: readonly unknown[]
  readonly workScopeEvents: readonly unknown[]
}

export class WorkspaceSnapshotContractError extends Error {
  readonly code = 'workspace_snapshot_contract_invalid'

  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceSnapshotContractError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEnvelope(value: unknown): WorkspaceSnapshotEnvelope {
  if (!isRecord(value)) {
    throw new WorkspaceSnapshotContractError('Workspace snapshot response is not an object.')
  }

  if (value.schemaVersion !== WORKSPACE_SNAPSHOT_SCHEMA_VERSION) {
    throw new WorkspaceSnapshotContractError('Workspace snapshot schema version is unsupported.')
  }

  if (typeof value.generatedAt !== 'string' || Number.isNaN(new Date(value.generatedAt).getTime())) {
    throw new WorkspaceSnapshotContractError('Workspace snapshot generatedAt is invalid.')
  }

  const arrays = [
    'projects',
    'tasks',
    'events',
    'deliverables',
    'scheduleBlocks',
    'fixedEvents',
    'planningProposals',
    'planningEvents',
    'ingestEvents',
    'duplicateEvidence',
    'workScope',
    'workScopeEvents'
  ] as const

  for (const field of arrays) {
    if (!Array.isArray(value[field])) {
      throw new WorkspaceSnapshotContractError(`Workspace snapshot ${field} is not an array.`)
    }
  }

  if (value.productionReviews !== undefined && !Array.isArray(value.productionReviews)) {
    throw new WorkspaceSnapshotContractError('Workspace snapshot productionReviews is not an array.')
  }

  return {
    schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    generatedAt: new Date(value.generatedAt).toISOString(),
    projects: value.projects as readonly unknown[],
    tasks: value.tasks as readonly unknown[],
    events: value.events as readonly unknown[],
    deliverables: value.deliverables as readonly unknown[],
    productionReviews: Array.isArray(value.productionReviews) ? value.productionReviews : [],
    scheduleBlocks: value.scheduleBlocks as readonly unknown[],
    fixedEvents: value.fixedEvents as readonly unknown[],
    planningProposals: value.planningProposals as readonly unknown[],
    planningEvents: value.planningEvents as readonly unknown[],
    ingestEvents: value.ingestEvents as readonly unknown[],
    duplicateEvidence: value.duplicateEvidence as readonly unknown[],
    workScope: value.workScope as readonly unknown[],
    workScopeEvents: value.workScopeEvents as readonly unknown[]
  }
}

function abortError(): Error {
  return new DOMException('Workspace snapshot request was aborted.', 'AbortError')
}

function parseMutationResult(value: unknown): TaskMutationResult {
  if (!isRecord(value)) {
    throw new WorkspaceTaskMutationError('Task mutation response is invalid.', null, 'invalid_response')
  }

  const action = value.action
  const changed = value.changed

  if (
    value.success !== true ||
    typeof value.workId !== 'string' ||
    !['complete', 'create', 'defer', 'edit'].includes(String(action)) ||
    typeof value.idempotent !== 'boolean' ||
    typeof value.newRevision !== 'string' ||
    !/^[0-9a-f]{64}$/.test(value.newRevision) ||
    !isRecord(changed)
  ) {
    throw new WorkspaceTaskMutationError('Task mutation response is invalid.', null, 'invalid_response')
  }

  return {
    workId: value.workId,
    action: action as TaskMutationResult['action'],
    success: true,
    idempotent: value.idempotent,
    newRevision: value.newRevision,
    changed
  }
}

function mutationFailure(error: unknown): WorkspaceTaskMutationError {
  if (error instanceof WorkspaceTaskMutationError) {
    return error
  }

  const statusCode =
    typeof error === 'object' && error !== null && typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : null

  const message = error instanceof Error ? error.message : 'Task mutation failed.'
  const codeMatch = message.match(/"code"\s*:\s*"([a-z0-9_]+)"/i)
  const code = codeMatch?.[1] ?? (statusCode === 409 ? 'conflict' : 'mutation_failed')

  return new WorkspaceTaskMutationError(message, statusCode, code)
}

function productionFailure(error: unknown): ProductionActionError {
  if (error instanceof ProductionActionError) {
    return error
  }

  const statusCode =
    typeof error === 'object' && error !== null && typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : null

  const message = error instanceof Error ? error.message : 'Production action failed.'
  const codeMatch = message.match(/"code"\s*:\s*"([a-z0-9_]+)"/i)

  return new ProductionActionError(message, statusCode, codeMatch?.[1] ?? 'production_action_failed')
}

function planningFailure(error: unknown): WorkspacePlanningMutationError {
  if (error instanceof WorkspacePlanningMutationError) {
    return error
  }

  const statusCode =
    typeof error === 'object' && error !== null && typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : null

  const message = error instanceof Error ? error.message : 'Planning mutation failed.'
  const codeMatch = message.match(/"code"\s*:\s*"([a-z0-9_]+)"/i)

  return new WorkspacePlanningMutationError(message, statusCode, codeMatch?.[1] ?? 'planning_mutation_failed')
}

function intakeFailure(error: unknown): WorkspaceIntakeMutationError {
  if (error instanceof WorkspaceIntakeMutationError) {
    return error
  }

  const statusCode =
    typeof error === 'object' && error !== null && typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : null

  const message = error instanceof Error ? error.message : 'Intake mutation failed.'
  const codeMatch = message.match(/"code"\s*:\s*"([a-z0-9_]+)"/i)

  return new WorkspaceIntakeMutationError(message, statusCode, codeMatch?.[1] ?? 'intake_mutation_failed')
}

function parseIntakeResult(value: unknown): Record<string, unknown> {
  if (!isRecord(value) || !isRecord(value.intake) || typeof value.intake.idempotent !== 'boolean') {
    throw new WorkspaceIntakeMutationError('Intake response is invalid.', null, 'invalid_response')
  }

  return value.intake
}

function parseTriageResult(value: unknown): { readonly idempotent: boolean } {
  if (!isRecord(value) || !isRecord(value.task) || typeof value.idempotent !== 'boolean') {
    throw new WorkspaceIntakeMutationError('Triage response is invalid.', null, 'invalid_response')
  }

  return { idempotent: value.idempotent }
}

function parsePlanningMutationResult(value: unknown): PlanningMutationResult {
  if (!isRecord(value) || !isRecord(value.planning) || !isRecord(value.planning.proposal)) {
    throw new WorkspacePlanningMutationError('Planning response is invalid.', null, 'invalid_response')
  }

  const adapted = adaptPlanningSnapshot({
    scheduleBlocks: value.planning.schedule_block ? [value.planning.schedule_block] : [],
    fixedEvents: [],
    planningProposals: [value.planning.proposal],
    planningEvents: []
  })

  if (adapted.data.planningProposals.length !== 1 || adapted.issues.length) {
    throw new WorkspacePlanningMutationError(
      'Planning response violates the canonical contract.',
      null,
      'invalid_response'
    )
  }

  return {
    proposal: adapted.data.planningProposals[0],
    scheduleBlock: adapted.data.scheduleBlocks[0] ?? null,
    idempotent: value.planning.idempotent === true
  }
}

function bundleMetaBody(meta: ProductionBundleMeta) {
  return {
    missing_information: meta.missingInformation,
    decision_required: meta.decisionRequired,
    input_sources: meta.inputSources,
    output_requirements: meta.outputRequirements,
    acceptance: meta.acceptanceCriteria,
    ...(meta.deliverables ? { deliverables: meta.deliverables } : {}),
    ...(meta.decisionNote ? { decision_note: meta.decisionNote } : {}),
    ...(meta.dueDate ? { due_date: meta.dueDate } : {}),
    revision: meta.revision,
    ...(meta.revisionReason ? { revision_reason: meta.revisionReason } : {})
  }
}

function approvedScopeBody(scope: ProductionApprovedScope) {
  return {
    scope_id: scope.scopeId,
    version: scope.version,
    items: scope.items,
    approved_by: scope.approvedBy,
    approved_at: scope.approvedAt,
    scope_hash: scope.scopeHash
  }
}

function parseProductionActionResult(value: unknown, action: ProductionAction): ProductionActionResult {
  if (!isRecord(value) || !isRecord(value.production)) {
    throw new ProductionActionError('Production action response is invalid.', null, 'invalid_response')
  }

  const adapted = adaptProductionReviews([value.production])

  if (adapted.data.length !== 1 || adapted.issues.length !== 0) {
    throw new ProductionActionError(
      'Production action response violates ProductionReadModel.',
      null,
      'invalid_response'
    )
  }

  return { action, production: adapted.data[0] }
}

/**
 * The production Workspace read door. `rest` is the official PluginContext
 * namespace: the renderer supplies neither an endpoint nor a credential, and
 * the Desktop host applies the active Remote Gateway authentication/profile.
 */
export function createPluginWorkspaceReadTransport(
  rest: PluginRest,
  options: { readonly timeoutMs?: number } = {}
): WorkspaceReadTransport &
  WorkspaceTaskMutationTransport &
  WorkspaceProductionActionTransport &
  WorkspacePlanningMutationTransport &
  WorkspaceIntakeMutationTransport {
  const timeoutMs = options.timeoutMs ?? WORKSPACE_SNAPSHOT_TIMEOUT_MS

  async function mutate(path: string, method: 'PATCH' | 'POST', body: unknown): Promise<TaskMutationResult> {
    try {
      return parseMutationResult(await rest<unknown>(path, { method, body, timeoutMs }))
    } catch (error) {
      throw mutationFailure(error)
    }
  }

  async function productionAction(
    workId: string,
    action: ProductionAction,
    body: unknown
  ): Promise<ProductionActionResult> {
    try {
      const value = await rest<unknown>(`/tasks/${encodeURIComponent(workId)}/production/${action}`, {
        method: 'POST',
        body,
        timeoutMs
      })

      return parseProductionActionResult(value, action)
    } catch (error) {
      throw productionFailure(error)
    }
  }

  async function planningAction(path: string, body: unknown): Promise<PlanningMutationResult> {
    try {
      return parsePlanningMutationResult(await rest<unknown>(path, { method: 'POST', body, timeoutMs }))
    } catch (error) {
      throw planningFailure(error)
    }
  }

  async function intakeAction(path: string, body: unknown): Promise<Record<string, unknown>> {
    try {
      return parseIntakeResult(await rest<unknown>(path, { method: 'POST', body, timeoutMs }))
    } catch (error) {
      throw intakeFailure(error)
    }
  }

  async function triageAction(path: string, body: unknown): Promise<{ readonly idempotent: boolean }> {
    try {
      return parseTriageResult(await rest<unknown>(path, { method: 'POST', body, timeoutMs }))
    } catch (error) {
      throw intakeFailure(error)
    }
  }

  return Object.freeze({
    scope: `gateway:plugin:mousai-workspace:${WORKSPACE_SNAPSHOT_SCHEMA_VERSION}`,
    async readSnapshot(readOptions?: { readonly signal?: AbortSignal }): Promise<RawWorkspaceReadSnapshot> {
      if (readOptions?.signal?.aborted) {
        throw abortError()
      }

      const envelope = parseEnvelope(
        await rest<unknown>('/snapshot', {
          method: 'GET',
          timeoutMs
        })
      )

      if (readOptions?.signal?.aborted) {
        throw abortError()
      }

      return {
        workdata: {
          projectRecords: envelope.projects,
          taskRecords: envelope.tasks
        },
        manifests: envelope.deliverables,
        productionReviews: envelope.productionReviews,
        scheduleBlocks: envelope.scheduleBlocks,
        fixedEvents: envelope.fixedEvents,
        planningProposals: envelope.planningProposals,
        planningEvents: envelope.planningEvents,
        ingestEvents: envelope.ingestEvents,
        duplicateEvidence: envelope.duplicateEvidence,
        workScope: envelope.workScope,
        workScopeEvents: envelope.workScopeEvents,
        loadedAt: envelope.generatedAt
      }
    },
    editTask(workId: string, request: TaskMutationMeta & { readonly changes: TaskEditChanges }) {
      return mutate(`/tasks/${encodeURIComponent(workId)}`, 'PATCH', request)
    },
    createTask(request: { readonly clientRequestId: string; readonly task: TaskCreateInput }) {
      return mutate('/tasks', 'POST', request)
    },
    deferTask(workId: string, request: TaskMutationMeta & { readonly deadline: string }) {
      return mutate(`/tasks/${encodeURIComponent(workId)}/defer`, 'POST', request)
    },
    completeTask(workId: string, request: TaskMutationMeta) {
      return mutate(`/tasks/${encodeURIComponent(workId)}/complete`, 'POST', request)
    },
    registerPlanningProposal(request: PlanningRegisterRequest) {
      return planningAction('/planning/proposals', {
        client_request_id: request.clientRequestId,
        work_id: request.workId,
        starts_at: request.startsAt,
        ends_at: request.endsAt,
        executor: request.executor,
        kind: 'task',
        estimated_duration_minutes: request.estimatedDurationMinutes,
        actor: request.actor
      })
    },
    acceptPlanningProposal(proposalId: string, request: PlanningCommandMeta) {
      return planningAction(`/planning/proposals/${encodeURIComponent(proposalId)}/accept`, {
        client_request_id: request.clientRequestId,
        expected_revision: request.expectedRevision,
        actor: request.actor
      })
    },
    adjustPlanningProposal(
      proposalId: string,
      request: PlanningCommandMeta & {
        readonly startsAt: string
        readonly endsAt: string
        readonly reason: string
      }
    ) {
      return planningAction(`/planning/proposals/${encodeURIComponent(proposalId)}/adjust`, {
        client_request_id: request.clientRequestId,
        expected_revision: request.expectedRevision,
        actor: request.actor,
        starts_at: request.startsAt,
        ends_at: request.endsAt,
        reason: request.reason
      })
    },
    ignorePlanningProposal(proposalId: string, request: PlanningCommandMeta & { readonly reason: string }) {
      return planningAction(`/planning/proposals/${encodeURIComponent(proposalId)}/ignore`, {
        client_request_id: request.clientRequestId,
        expected_revision: request.expectedRevision,
        actor: request.actor,
        reason: request.reason
      })
    },
    async reviewDuplicate(request: DuplicateReviewRequest) {
      const result = await intakeAction('/intake/duplicates/review', {
        work_id: request.workId,
        related_work_id: request.relatedWorkId,
        state: request.state,
        expected_revisions: request.expectedRevisions,
        client_request_id: request.clientRequestId,
        reason: request.reason,
        actor: request.actor
      })

      return { idempotent: result.idempotent as boolean }
    },
    async mergeIntakeTasks(request: IntakeMergeRequest) {
      const result = await intakeAction('/intake/merge', {
        survivor_work_id: request.survivorWorkId,
        merged_work_id: request.mergedWorkId,
        expected_revisions: request.expectedRevisions,
        client_request_id: request.clientRequestId,
        reason: request.reason,
        actor: request.actor
      })

      if (result.survivor_work_id !== request.survivorWorkId) {
        throw new WorkspaceIntakeMutationError('Merge survivor is invalid.', null, 'invalid_response')
      }

      return { idempotent: result.idempotent as boolean, survivorWorkId: request.survivorWorkId }
    },
    async setWorkScope(request: WorkScopeMutationRequest) {
      const result = await intakeAction('/intake/scopes', {
        source_type: request.sourceType,
        scope_id: request.scopeId,
        state: request.state,
        label: request.label,
        expected_revision: request.expectedRevision,
        client_request_id: request.clientRequestId,
        actor: request.actor
      })

      return { idempotent: result.idempotent as boolean }
    },
    archiveTask(workId: string, request: { readonly clientRequestId: string; readonly expectedRevision: string }) {
      return triageAction(`/tasks/${encodeURIComponent(workId)}/archive`, request)
    },
    flagTask(
      workId: string,
      request: {
        readonly clientRequestId: string
        readonly expectedRevision: string
        readonly flag: 'decision_required' | 'material_missing'
        readonly note: string
      }
    ) {
      return triageAction(`/tasks/${encodeURIComponent(workId)}/flag`, request)
    },
    prepareProduction(workId: string, request: Parameters<WorkspaceProductionActionTransport['prepareProduction']>[1]) {
      return productionAction(workId, 'prepare', {
        actor: request.actor,
        bundle_meta: bundleMetaBody(request.bundleMeta)
      })
    },
    approveProductionScope(
      workId: string,
      request: Parameters<WorkspaceProductionActionTransport['approveProductionScope']>[1]
    ) {
      return productionAction(workId, 'scope', {
        actor: request.actor,
        approved_scope: approvedScopeBody(request.approvedScope),
        bundle_meta: bundleMetaBody(request.bundleMeta)
      })
    },
    startProduction(workId: string, request: Parameters<WorkspaceProductionActionTransport['startProduction']>[1]) {
      return productionAction(workId, 'start', { actor: request.actor })
    },
    requestProductionRevision(
      workId: string,
      request: Parameters<WorkspaceProductionActionTransport['requestProductionRevision']>[1]
    ) {
      return productionAction(workId, 'revision', {
        actor: request.actor,
        revision: request.revision,
        reason: request.reason,
        reviewer_comment: request.reviewerComment
      })
    },
    acceptProduction(workId: string, request: Parameters<WorkspaceProductionActionTransport['acceptProduction']>[1]) {
      return productionAction(workId, 'accept', {
        actor: request.actor,
        acceptance: {
          verdict: request.verdict,
          ...(request.comment ? { comment: request.comment } : {})
        }
      })
    }
  })
}
