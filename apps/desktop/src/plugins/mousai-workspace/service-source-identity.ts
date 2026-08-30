import type { CanonicalDuplicateEvidence, DomainSource, IngestEvent, Task } from './domain'

export type SourceType = 'feishu' | 'hermes_session' | 'manual' | 'qq' | 'unknown' | 'wechat' | 'workspace'
export type DuplicateState = 'independent' | 'merged' | 'possible' | 'unknown'

export interface SourceIdentity {
  readonly sourceType: SourceType
  readonly sourceId: string | null
  readonly channel: string | null
  readonly displayName: string | null
  readonly originReference: string | null
  readonly receivedAt: string | null
}

export interface DuplicateEvidence {
  readonly state: DuplicateState
  readonly relatedWorkIds: readonly string[]
  readonly reason: string | null
}

export interface IngestAuditModel {
  readonly workId: string
  readonly identity: SourceIdentity
  readonly automaticExtraction: boolean | null
  readonly extractionState: string | null
  readonly manuallyCreated: boolean | null
  readonly assignedToProject: boolean
  readonly sourceMerged: boolean | null
  readonly duplicate: DuplicateEvidence
  readonly historyAvailable: boolean
  readonly events: readonly IngestEvent[]
}

export const SOURCE_LABELS: Readonly<Record<SourceType, string>> = {
  feishu: 'Feishu',
  hermes_session: 'Hermes Session',
  manual: 'Manual',
  qq: 'QQ',
  unknown: '未设置',
  wechat: 'WeChat',
  workspace: 'Workspace'
}

function exactOriginType(origin: string | null): SourceType | null {
  const normalized = origin?.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  if (/^(feishu|飞书)(\b|\s|\/|:|：)/i.test(normalized) || normalized === 'feishu' || normalized === '飞书') {
    return 'feishu'
  }

  if (/^qq(\b|\s|\/|:|：)/i.test(normalized) || normalized === 'qq') {
    return 'qq'
  }

  if (/^(wechat|微信)(\b|\s|\/|:|：)/i.test(normalized) || normalized === 'wechat' || normalized === '微信') {
    return 'wechat'
  }

  if (/^hermes([\s/_-]*session)?(\b|\s|\/|:|：)/i.test(normalized) || normalized === 'hermes') {
    return 'hermes_session'
  }

  if (/^(manual|人工|手工)(\b|\s|\/|:|：)/i.test(normalized) || ['manual', '人工', '手工'].includes(normalized)) {
    return 'manual'
  }

  if (/^(workspace|workdata|workbridge|control)(\b|\s|\/|:|：)/i.test(normalized)) {
    return 'workspace'
  }

  return null
}

function fallbackType(system: DomainSource): SourceType {
  return ['control', 'workbridge', 'workdata'].includes(system) ? 'workspace' : 'unknown'
}

export function buildSourceIdentity(task: Task): SourceIdentity {
  if (task.sourceIdentity) {
    return task.sourceIdentity
  }

  const sourceType = exactOriginType(task.origin) ?? fallbackType(task.source.system)

  return {
    sourceType,
    sourceId: task.source.recordId,
    channel: sourceType === 'unknown' ? null : SOURCE_LABELS[sourceType],
    displayName: task.origin ?? SOURCE_LABELS[sourceType],
    originReference: task.source.recordId ? `${task.source.system}:${task.source.recordId}` : null,
    receivedAt: task.createdAt
  }
}

export function duplicateStateFromCanonical(value: unknown): DuplicateState {
  if (value === 'independent' || value === 'merged' || value === 'possible') {
    return value
  }

  return 'unknown'
}

export function duplicateEvidenceForTask(
  task: Task,
  evidence: readonly CanonicalDuplicateEvidence[]
): DuplicateEvidence {
  const canonical = evidence.find(item => item.workId === task.id)

  if (!canonical) {
    return { state: 'unknown', relatedWorkIds: [], reason: null }
  }

  return {
    state: canonical.state,
    relatedWorkIds: canonical.relatedWorkIds,
    reason:
      canonical.evidence
        .map(item => item.reference)
        .filter(Boolean)
        .join('；') || null
  }
}

export function buildIngestAudit(
  task: Task,
  ingestEvents: readonly IngestEvent[],
  duplicateEvidence: readonly CanonicalDuplicateEvidence[]
): IngestAuditModel {
  const identity = buildSourceIdentity(task)
  const duplicate = duplicateEvidenceForTask(task, duplicateEvidence)
  const events = ingestEvents.filter(event => event.workId === task.id)

  return {
    workId: task.id,
    identity,
    automaticExtraction: events.some(event => event.type === 'extracted') ? true : null,
    extractionState: events.some(event => event.type === 'extracted') ? '已提取' : null,
    manuallyCreated: identity.sourceType === 'manual' ? true : null,
    assignedToProject: Boolean(task.projectRef),
    sourceMerged: events.some(event => event.type === 'merged') || duplicate.state === 'merged' ? true : null,
    duplicate,
    historyAvailable: events.length > 0,
    events
  }
}
