import {
  asIsoDateTime,
  asNullableBoolean,
  asTrimmedText,
  isRecord,
  issue,
  recordsFromPayload,
  type UnknownRecord
} from './adapter-shared'
import type { AdapterIssue, AdapterResult, ProductionAuthority, ProductionGateState, ProductionReview } from './domain'

const GATE_STATES: Readonly<Record<string, ProductionGateState>> = {
  blocked: 'blocked',
  in_production: 'in_production',
  pending_review: 'pending_review',
  ready_for_production: 'ready_for_production',
  阻塞: 'blocked',
  生产中: 'in_production',
  待人工验收: 'pending_review',
  可进入生产: 'ready_for_production'
}

const READY_PRODUCTION_STATUSES = new Set(['ready', 'ready_for_production', '可进入生产', '已批准生产'])

function textList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  return value.flatMap(item => {
    const text = asTrimmedText(item)

    return text ? [text] : []
  })
}

function authority(value: unknown): ProductionAuthority | null {
  return value === 'control' || value === 'workbridge' ? value : null
}

function referenceKey(input: {
  readonly workId: string
  readonly deliverableId: string | null
  readonly relativePath: string | null
  readonly sha256: string | null
}): string {
  if (input.deliverableId) {
    return `deliverable:${input.deliverableId}`
  }

  if (input.relativePath && input.sha256) {
    return `file:${input.workId}:${input.relativePath}:${input.sha256}`
  }

  return `work:${input.workId}`
}

function recordId(record: UnknownRecord): string | null {
  return asTrimmedText(record.review_id) ?? asTrimmedText(record.record_id) ?? asTrimmedText(record.recordId)
}

export function adaptProductionReviews(payload: unknown): AdapterResult<readonly ProductionReview[]> {
  const issues: AdapterIssue[] = []
  const reviews = new Map<string, ProductionReview>()
  const ambiguous = new Set<string>()

  for (const candidate of recordsFromPayload(payload)) {
    if (!isRecord(candidate)) {
      issues.push(issue('control', 'invalid_record', 'Production review record is not an object.'))

      continue
    }

    const id = recordId(candidate)
    const workId = asTrimmedText(candidate.work_id)
    const sourceAuthority = authority(candidate.authority)

    if (!id || !workId || !sourceAuthority) {
      issues.push(issue('control', 'invalid_record', 'Production review identity or authority is missing.', id))

      continue
    }

    const deliverableId = asTrimmedText(candidate.deliverable_id)
    const relativePath = asTrimmedText(candidate.relative_path)
    const sha256 = asTrimmedText(candidate.sha256)?.toLocaleLowerCase() ?? null
    const gateStatusRaw = asTrimmedText(candidate.gate_status)
    const scopeApproved = asNullableBoolean(candidate.scope_approved)
    const approvedScopeVersion = asTrimmedText(candidate.approved_scope_version)
    let productionStatus = asTrimmedText(candidate.production_status)
    let gateState = gateStatusRaw ? (GATE_STATES[gateStatusRaw] ?? 'unknown') : 'unknown'

    if (gateStatusRaw && gateState === 'unknown') {
      issues.push(issue(sourceAuthority, 'invalid_field', `Unknown production gate status: ${gateStatusRaw}`, id))
    }

    if (gateState === 'ready_for_production' && (scopeApproved !== true || !approvedScopeVersion)) {
      gateState = 'blocked'
      issues.push(issue(sourceAuthority, 'invalid_field', 'Ready gate has no approved scope version.', id))
    }

    if (
      productionStatus &&
      READY_PRODUCTION_STATUSES.has(productionStatus) &&
      (scopeApproved !== true || !approvedScopeVersion)
    ) {
      productionStatus = null
      issues.push(issue(sourceAuthority, 'invalid_field', 'Ready production status has no approved scope version.', id))
    }

    const key = referenceKey({ workId, deliverableId, relativePath, sha256 })

    if (reviews.has(key) || ambiguous.has(key)) {
      reviews.delete(key)
      ambiguous.add(key)
      issues.push(issue(sourceAuthority, 'duplicate_id', `Ambiguous production review reference: ${key}`, id))

      continue
    }

    reviews.set(key, {
      id,
      workId,
      deliverableId,
      relativePath,
      sha256,
      authority: sourceAuthority,
      gateState,
      gateStatusRaw,
      productionStatus,
      currentExecutor: asTrimmedText(candidate.current_executor),
      scopeApproved,
      approvedScopeVersion,
      missingInformation: textList(candidate.missing_information),
      decisionsRequired: textList(candidate.decisions_required),
      mousaiReviewComment: asTrimmedText(candidate.mousai_review_comment),
      revision: asTrimmedText(candidate.revision),
      finalVersion: asTrimmedText(candidate.final_version),
      skillCandidateStatus: asTrimmedText(candidate.skill_candidate_status),
      updatedAt: asIsoDateTime(candidate.updated_at),
      source: { system: sourceAuthority, recordId: id }
    })
  }

  return { data: [...reviews.values()], issues }
}
