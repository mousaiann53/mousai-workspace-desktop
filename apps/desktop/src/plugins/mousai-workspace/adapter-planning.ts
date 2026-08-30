import { asIsoDateTime, asNullableNumber, asTrimmedText, isRecord, issue, recordsFromPayload } from './adapter-shared'
import type {
  AdapterIssue,
  AdapterResult,
  PlanningEvent,
  PlanningProposal,
  PlanningProposalStatus,
  ProductionJsonValue,
  ScheduleBlock
} from './domain'

export interface PlanningSnapshot {
  readonly scheduleBlocks: readonly ScheduleBlock[]
  readonly fixedEvents: readonly ScheduleBlock[]
  readonly planningProposals: readonly PlanningProposal[]
  readonly planningEvents: readonly PlanningEvent[]
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number | null {
  const parsed = asNullableNumber(value)

  return parsed !== null && Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null
}

function jsonValue(value: unknown): ProductionJsonValue | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }

  if (Array.isArray(value)) {
    const values: ProductionJsonValue[] = []

    for (const candidate of value) {
      const parsed = jsonValue(candidate)

      if (parsed === null && candidate !== null) {return null}
      values.push(parsed)
    }

    return values
  }

  if (isRecord(value)) {
    const result: Record<string, ProductionJsonValue> = {}

    for (const [key, candidate] of Object.entries(value)) {
      const parsed = jsonValue(candidate)

      if (parsed === null && candidate !== null) {return null}
      result[key] = parsed
    }

    return result
  }

  return null
}

function adaptBlocks(payload: unknown, sourceName: string, issues: AdapterIssue[]): ScheduleBlock[] {
  const result: ScheduleBlock[] = []

  for (const candidate of recordsFromPayload(payload)) {
    if (!isRecord(candidate)) {
      issues.push(issue('control', 'invalid_record', `${sourceName} record is invalid.`))

      continue
    }

    const blockId = asTrimmedText(candidate.block_id) ?? asTrimmedText(candidate.event_id)
    const startsAt = asIsoDateTime(candidate.starts_at)
    const endsAt = asIsoDateTime(candidate.ends_at)
    const revision = integer(candidate.revision, 1) ?? (sourceName === 'fixedEvents' ? 1 : null)
    const kind = asTrimmedText(candidate.kind) ?? (sourceName === 'fixedEvents' ? 'fixed_event' : null)

    if (!blockId || !startsAt || !endsAt || !revision || !['task', 'fixed_event', 'hold'].includes(kind ?? '')) {
      issues.push(issue('control', 'invalid_field', `${sourceName} record violates the planning contract.`, blockId))

      continue
    }

    result.push({
      blockId,
      workId: asTrimmedText(candidate.work_id),
      startsAt,
      endsAt,
      executor: asTrimmedText(candidate.executor),
      kind: kind as ScheduleBlock['kind'],
      revision
    })
  }

  return result
}

function adaptProposals(payload: unknown, issues: AdapterIssue[]): PlanningProposal[] {
  const result: PlanningProposal[] = []

  for (const candidate of recordsFromPayload(payload)) {
    if (!isRecord(candidate)) {
      issues.push(issue('control', 'invalid_record', 'Planning proposal is invalid.'))

      continue
    }

    const proposalId = asTrimmedText(candidate.proposal_id)
    const workId = asTrimmedText(candidate.work_id)
    const startsAt = asIsoDateTime(candidate.starts_at)
    const endsAt = asIsoDateTime(candidate.ends_at)
    const createdAt = asIsoDateTime(candidate.created_at)
    const createdBy = asTrimmedText(candidate.created_by)
    const proposalRevision = integer(candidate.proposal_revision, 1)
    const estimatedDurationMinutes = integer(candidate.estimated_duration_minutes, 1, 720)
    const status = asTrimmedText(candidate.status)

    if (
      !proposalId ||
      !workId ||
      !startsAt ||
      !endsAt ||
      !createdAt ||
      !createdBy ||
      !proposalRevision ||
      !estimatedDurationMinutes ||
      !['accepted', 'ignored', 'pending'].includes(status ?? '') ||
      candidate.kind !== 'task'
    ) {
      issues.push(issue('control', 'invalid_field', 'Planning proposal violates the canonical contract.', proposalId))

      continue
    }

    result.push({
      proposalId,
      proposalRevision,
      status: status as PlanningProposalStatus,
      workId,
      startsAt,
      endsAt,
      executor: asTrimmedText(candidate.executor),
      kind: 'task',
      estimatedDurationMinutes,
      createdAt,
      createdBy
    })
  }

  return result
}

function adaptEvents(payload: unknown, issues: AdapterIssue[]): PlanningEvent[] {
  const result: PlanningEvent[] = []

  for (const candidate of recordsFromPayload(payload)) {
    if (!isRecord(candidate)) {continue}
    const eventId = asTrimmedText(candidate.event_id)
    const workId = asTrimmedText(candidate.work_id)
    const proposalId = asTrimmedText(candidate.proposal_id)
    const type = asTrimmedText(candidate.type)
    const occurredAt = asIsoDateTime(candidate.occurred_at)
    const actor = asTrimmedText(candidate.actor)
    const proposalRevision = integer(candidate.proposal_revision, 1)

    if (!eventId || !workId || !proposalId || !type || !occurredAt || !actor || !proposalRevision) {
      issues.push(issue('control', 'invalid_field', 'Planning event violates the canonical contract.', eventId))

      continue
    }

    result.push({
      eventId,
      workId,
      proposalId,
      type,
      occurredAt,
      actor,
      proposalRevision,
      previousValue: jsonValue(candidate.previous_value),
      nextValue: jsonValue(candidate.next_value),
      reason: asTrimmedText(candidate.reason)
    })
  }

  return result
}

export function adaptPlanningSnapshot(input: {
  readonly scheduleBlocks: unknown
  readonly fixedEvents: unknown
  readonly planningProposals: unknown
  readonly planningEvents: unknown
}): AdapterResult<PlanningSnapshot> {
  const issues: AdapterIssue[] = []

  return {
    data: {
      scheduleBlocks: adaptBlocks(input.scheduleBlocks, 'scheduleBlocks', issues),
      fixedEvents: adaptBlocks(input.fixedEvents, 'fixedEvents', issues),
      planningProposals: adaptProposals(input.planningProposals, issues),
      planningEvents: adaptEvents(input.planningEvents, issues)
    },
    issues
  }
}
