import { asTrimmedText, isRecord, issue, recordsFromPayload } from './adapter-shared'
import type {
  AdapterIssue,
  AdapterResult,
  CanonicalDuplicateEvidence,
  IngestEvent,
  IntakeSourceIdentity,
  IntakeSourceType,
  WorkScope,
  WorkScopeEvent
} from './domain'

const SOURCE_TYPES = new Set<IntakeSourceType>([
  'workspace',
  'feishu',
  'qq',
  'wechat',
  'hermes_session',
  'manual',
  'unknown'
])

const EVENT_TYPES = new Set<IngestEvent['type']>(['received', 'extracted', 'assigned', 'merged'])
const DUPLICATE_STATES = new Set<CanonicalDuplicateEvidence['state']>(['possible', 'merged', 'independent', 'unknown'])
const SCOPE_STATES = new Set<WorkScope['state']>(['enabled', 'disabled', 'approval_required'])

function integer(value: unknown, minimum: number): number | null {
  return Number.isInteger(value) && Number(value) >= minimum ? Number(value) : null
}

function nullableText(value: unknown): string | null {
  return value === null ? null : asTrimmedText(value)
}

export function adaptSourceIdentity(value: unknown): IntakeSourceIdentity | null {
  if (!isRecord(value) || !SOURCE_TYPES.has(value.source_type as IntakeSourceType)) {
    return null
  }

  return {
    sourceType: value.source_type as IntakeSourceType,
    sourceId: nullableText(value.source_id),
    channel: nullableText(value.channel),
    displayName: nullableText(value.display_name),
    originReference: nullableText(value.origin_reference),
    receivedAt: nullableText(value.received_at)
  }
}

function adaptEvents(payload: unknown, issues: AdapterIssue[]): IngestEvent[] {
  return recordsFromPayload(payload).flatMap(candidate => {
    if (!isRecord(candidate)) {
      issues.push(issue('control', 'invalid_record', 'Intake event is not an object.'))

      return []
    }

    const eventId = asTrimmedText(candidate.event_id)
    const workId = asTrimmedText(candidate.work_id)
    const occurredAt = asTrimmedText(candidate.occurred_at)
    const actor = asTrimmedText(candidate.actor)
    const revision = integer(candidate.revision, 1)

    if (
      !eventId ||
      !workId ||
      !occurredAt ||
      !actor ||
      !revision ||
      !EVENT_TYPES.has(candidate.type as IngestEvent['type'])
    ) {
      issues.push(issue('control', 'invalid_record', 'Intake event violates the canonical contract.', workId))

      return []
    }

    return [
      {
        eventId,
        workId,
        type: candidate.type as IngestEvent['type'],
        occurredAt,
        actor,
        sourceReference: nullableText(candidate.source_reference),
        revision,
        mergedWorkId: nullableText(candidate.merged_work_id),
        reason: nullableText(candidate.reason)
      }
    ]
  })
}

function adaptDuplicates(payload: unknown, issues: AdapterIssue[]): CanonicalDuplicateEvidence[] {
  return recordsFromPayload(payload).flatMap(candidate => {
    if (!isRecord(candidate)) {
      issues.push(issue('control', 'invalid_record', 'Duplicate evidence is not an object.'))

      return []
    }

    const workId = asTrimmedText(candidate.work_id)
    const revision = integer(candidate.revision, 0)

    if (
      !workId ||
      revision === null ||
      !DUPLICATE_STATES.has(candidate.state as CanonicalDuplicateEvidence['state']) ||
      !Array.isArray(candidate.related_work_ids) ||
      !Array.isArray(candidate.evidence)
    ) {
      issues.push(issue('control', 'invalid_record', 'Duplicate evidence violates the canonical contract.', workId))

      return []
    }

    const evidence = candidate.evidence.flatMap(item => {
      if (!isRecord(item) || !['manual_review', 'same_source_reference'].includes(String(item.kind))) {
        return []
      }

      return [
        {
          kind: item.kind as 'manual_review' | 'same_source_reference',
          reference: nullableText(item.reference),
          actor: nullableText(item.actor),
          occurredAt: nullableText(item.occurred_at)
        }
      ]
    })

    return [
      {
        workId,
        state: candidate.state as CanonicalDuplicateEvidence['state'],
        relatedWorkIds: candidate.related_work_ids.map(asTrimmedText).filter((item): item is string => Boolean(item)),
        evidence,
        revision
      }
    ]
  })
}

function adaptScopes(payload: unknown, issues: AdapterIssue[]): WorkScope[] {
  return recordsFromPayload(payload).flatMap(candidate => {
    if (!isRecord(candidate)) {
      issues.push(issue('control', 'invalid_record', 'Work scope is not an object.'))

      return []
    }

    const sourceType = candidate.source_type as IntakeSourceType
    const scopeId = asTrimmedText(candidate.scope_id)
    const label = asTrimmedText(candidate.label)
    const updatedAt = asTrimmedText(candidate.updated_at)
    const revision = integer(candidate.revision, 1)

    if (
      sourceType === 'unknown' ||
      !SOURCE_TYPES.has(sourceType) ||
      !scopeId ||
      !label ||
      !updatedAt ||
      !revision ||
      !SCOPE_STATES.has(candidate.state as WorkScope['state'])
    ) {
      issues.push(issue('control', 'invalid_record', 'Work scope violates the canonical contract.'))

      return []
    }

    return [{ sourceType, scopeId, label, updatedAt, revision, state: candidate.state as WorkScope['state'] }]
  })
}

function adaptScopeEvents(payload: unknown, issues: AdapterIssue[]): WorkScopeEvent[] {
  return recordsFromPayload(payload).flatMap(candidate => {
    if (!isRecord(candidate)) {
      issues.push(issue('control', 'invalid_record', 'Work scope event is not an object.'))

      return []
    }

    const sourceType = candidate.source_type as IntakeSourceType
    const eventId = asTrimmedText(candidate.event_id)
    const scopeId = asTrimmedText(candidate.scope_id)
    const occurredAt = asTrimmedText(candidate.occurred_at)
    const actor = asTrimmedText(candidate.actor)
    const revision = integer(candidate.revision, 1)

    if (
      sourceType === 'unknown' ||
      !SOURCE_TYPES.has(sourceType) ||
      !eventId ||
      !scopeId ||
      !occurredAt ||
      !actor ||
      !revision ||
      !SCOPE_STATES.has(candidate.state as WorkScope['state'])
    ) {
      issues.push(issue('control', 'invalid_record', 'Work scope event violates the canonical contract.'))

      return []
    }

    return [{ eventId, sourceType, scopeId, occurredAt, actor, revision, state: candidate.state as WorkScope['state'] }]
  })
}

export function adaptIntakeSnapshot(input: {
  readonly ingestEvents: unknown
  readonly duplicateEvidence: unknown
  readonly workScope: unknown
  readonly workScopeEvents: unknown
}): AdapterResult<{
  readonly ingestEvents: readonly IngestEvent[]
  readonly duplicateEvidence: readonly CanonicalDuplicateEvidence[]
  readonly workScope: readonly WorkScope[]
  readonly workScopeEvents: readonly WorkScopeEvent[]
}> {
  const issues: AdapterIssue[] = []

  return {
    data: {
      ingestEvents: adaptEvents(input.ingestEvents, issues),
      duplicateEvidence: adaptDuplicates(input.duplicateEvidence, issues),
      workScope: adaptScopes(input.workScope, issues),
      workScopeEvents: adaptScopeEvents(input.workScopeEvents, issues)
    },
    issues
  }
}
