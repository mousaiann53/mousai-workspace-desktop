import type { PluginRestOptions } from '@hermes/plugin-sdk'

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

  const arrays = ['projects', 'tasks', 'events', 'deliverables'] as const

  for (const field of arrays) {
    if (!Array.isArray(value[field])) {
      throw new WorkspaceSnapshotContractError(`Workspace snapshot ${field} is not an array.`)
    }
  }

  return {
    schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    generatedAt: new Date(value.generatedAt).toISOString(),
    projects: value.projects as readonly unknown[],
    tasks: value.tasks as readonly unknown[],
    events: value.events as readonly unknown[],
    deliverables: value.deliverables as readonly unknown[]
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

/**
 * The production Workspace read door. `rest` is the official PluginContext
 * namespace: the renderer supplies neither an endpoint nor a credential, and
 * the Desktop host applies the active Remote Gateway authentication/profile.
 */
export function createPluginWorkspaceReadTransport(
  rest: PluginRest,
  options: { readonly timeoutMs?: number } = {}
): WorkspaceReadTransport & WorkspaceTaskMutationTransport {
  const timeoutMs = options.timeoutMs ?? WORKSPACE_SNAPSHOT_TIMEOUT_MS

  async function mutate(path: string, method: 'PATCH' | 'POST', body: unknown): Promise<TaskMutationResult> {
    try {
      return parseMutationResult(await rest<unknown>(path, { method, body, timeoutMs }))
    } catch (error) {
      throw mutationFailure(error)
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
    }
  })
}
