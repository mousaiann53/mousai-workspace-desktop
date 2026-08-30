import type { DomainSource, Task } from './domain'

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
  readonly historyAvailable: false
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

export function compareDuplicateEvidence(left: Task, right: Task): DuplicateEvidence {
  if (left.id === right.id) {
    return { state: 'merged', relatedWorkIds: [left.id], reason: '同一 canonical WORK-ID' }
  }

  if (
    left.source.recordId &&
    right.source.recordId &&
    left.source.system === right.source.system &&
    left.source.recordId === right.source.recordId
  ) {
    return {
      state: 'possible',
      relatedWorkIds: [right.id],
      reason: '两个 WORK-ID 指向同一 canonical source reference'
    }
  }

  return { state: 'unknown', relatedWorkIds: [], reason: null }
}

export function duplicateEvidenceForTask(task: Task, tasks: readonly Task[]): DuplicateEvidence {
  const matches = tasks
    .filter(candidate => candidate.id !== task.id)
    .map(candidate => compareDuplicateEvidence(task, candidate))
    .filter(evidence => evidence.state !== 'unknown')

  if (!matches.length) {
    return { state: 'unknown', relatedWorkIds: [], reason: null }
  }

  return {
    state: 'possible',
    relatedWorkIds: [...new Set(matches.flatMap(match => match.relatedWorkIds))],
    reason: '存在相同 canonical source reference；未执行标题相似度判断'
  }
}

export function buildIngestAudit(task: Task, tasks: readonly Task[]): IngestAuditModel {
  const identity = buildSourceIdentity(task)
  const duplicate = duplicateEvidenceForTask(task, tasks)

  return {
    workId: task.id,
    identity,
    automaticExtraction: null,
    extractionState: null,
    manuallyCreated: identity.sourceType === 'manual' ? true : null,
    assignedToProject: Boolean(task.projectRef),
    sourceMerged: duplicate.state === 'merged' ? true : null,
    duplicate,
    historyAvailable: false
  }
}
