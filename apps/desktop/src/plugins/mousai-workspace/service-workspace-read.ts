import { adaptIntakeSnapshot } from './adapter-intake'
import { adaptManifest } from './adapter-manifest'
import { adaptPlanningSnapshot } from './adapter-planning'
import { adaptProductionReviews } from './adapter-production-review'
import { adaptS4Snapshot, type RawS4Snapshot } from './adapter-s4'
import { adaptWorkBridgeJobs } from './adapter-workbridge'
import { adaptWorkDataSnapshot } from './adapter-workdata'
import type { AdapterIssue, Task, WorkspaceSnapshot } from './domain'

export const SAFE_READ_TRANSPORT_BLOCKER =
  '当前 Hermes Gateway 未提供 WorkData 项目只读方法；WorkBridge 仅提供带 Token 的任务接口。'

export interface RawWorkspaceReadSnapshot extends RawS4Snapshot {
  readonly workdata: {
    readonly projectRecords: unknown
    readonly taskRecords: unknown
  }
  readonly workbridgeJobs?: unknown
  readonly manifests?: readonly unknown[]
  readonly productionReviews?: unknown
  readonly scheduleBlocks?: unknown
  readonly fixedEvents?: unknown
  readonly planningProposals?: unknown
  readonly planningEvents?: unknown
  readonly ingestEvents?: unknown
  readonly duplicateEvidence?: unknown
  readonly workScope?: unknown
  readonly workScopeEvents?: unknown
  readonly loadedAt?: string
}

export interface WorkspaceReadTransport {
  /** Stable cache scope. It must not contain endpoint credentials or tokens. */
  readonly scope: string
  readSnapshot(options?: { readonly signal?: AbortSignal }): Promise<RawWorkspaceReadSnapshot>
}

export class WorkspaceTransportUnavailableError extends Error {
  readonly code = 'safe_read_transport_unavailable'

  constructor(message = SAFE_READ_TRANSPORT_BLOCKER) {
    super(message)
    this.name = 'WorkspaceTransportUnavailableError'
  }
}

export interface WorkspaceReadResult {
  readonly snapshot: WorkspaceSnapshot
  readonly issues: readonly AdapterIssue[]
}

/**
 * Production-safe default for M3-A. It deliberately has no URL, token, env,
 * fetch, or MCP-tool door. A future backend may implement WorkspaceReadTransport
 * through the existing authenticated Gateway/plugin route without changing the
 * domain or Gallery UI.
 */
export function createUnavailableWorkspaceReadTransport(): WorkspaceReadTransport {
  return Object.freeze({
    scope: 'gateway:workspace-read:unavailable',
    async readSnapshot() {
      throw new WorkspaceTransportUnavailableError()
    }
  })
}

function mergeTasks(workdataTasks: readonly Task[], workbridgeTasks: readonly Task[]): readonly Task[] {
  const byId = new Map(workdataTasks.map(task => [task.id, task]))

  for (const task of workbridgeTasks) {
    if (!byId.has(task.id)) {
      byId.set(task.id, task)
    }
  }

  return [...byId.values()]
}

export async function readWorkspaceSnapshot(
  transport: WorkspaceReadTransport,
  options?: { readonly signal?: AbortSignal }
): Promise<WorkspaceReadResult> {
  const raw = await transport.readSnapshot(options)
  const workdata = adaptWorkDataSnapshot(raw.workdata)
  const workbridge = adaptWorkBridgeJobs(raw.workbridgeJobs ?? [])
  const manifestResults = (raw.manifests ?? []).map(adaptManifest)
  const productionReviews = adaptProductionReviews(raw.productionReviews ?? [])

  const planning = adaptPlanningSnapshot({
    scheduleBlocks: raw.scheduleBlocks ?? [],
    fixedEvents: raw.fixedEvents ?? [],
    planningProposals: raw.planningProposals ?? [],
    planningEvents: raw.planningEvents ?? []
  })

  const intake = adaptIntakeSnapshot({
    ingestEvents: raw.ingestEvents ?? [],
    duplicateEvidence: raw.duplicateEvidence ?? [],
    workScope: raw.workScope ?? [],
    workScopeEvents: raw.workScopeEvents ?? []
  })

  const loadedAtCandidate = raw.loadedAt ? new Date(raw.loadedAt) : new Date()

  const loadedAt = Number.isNaN(loadedAtCandidate.getTime())
    ? new Date().toISOString()
    : loadedAtCandidate.toISOString()

  const s4 = adaptS4Snapshot(raw)

  return {
    snapshot: {
      projects: workdata.data.projects,
      tasks: mergeTasks(workdata.data.tasks, workbridge.data),
      events: [],
      deliverables: manifestResults.flatMap(result => result.data),
      productionReviews: productionReviews.data,
      activities: [],
      ...planning.data,
      ...intake.data,
      ...s4.fields,
      loadedAt
    },
    issues: [
      ...workdata.issues,
      ...workbridge.issues,
      ...manifestResults.flatMap(result => result.issues),
      ...productionReviews.issues,
      ...planning.issues,
      ...intake.issues,
      ...s4.issues
    ]
  }
}
