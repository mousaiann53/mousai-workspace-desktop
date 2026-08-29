import type { PluginRestOptions } from '@hermes/plugin-sdk'

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

/**
 * The production Workspace read door. `rest` is the official PluginContext
 * namespace: the renderer supplies neither an endpoint nor a credential, and
 * the Desktop host applies the active Remote Gateway authentication/profile.
 */
export function createPluginWorkspaceReadTransport(
  rest: PluginRest,
  options: { readonly timeoutMs?: number } = {}
): WorkspaceReadTransport {
  const timeoutMs = options.timeoutMs ?? WORKSPACE_SNAPSHOT_TIMEOUT_MS

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
    }
  })
}
