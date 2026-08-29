import { asIsoDateTime, asNullableNumber, asTrimmedText, isRecord, issue, recordsFromPayload } from './adapter-shared'
import type {
  AdapterIssue,
  AdapterResult,
  ProductionAcceptance,
  ProductionApprovedScope,
  ProductionBundleMeta,
  ProductionEvent,
  ProductionGateState,
  ProductionReview
} from './domain'

const GATE_STATES = new Set<ProductionGateState>([
  'INPUT_REQUIRED',
  'MATERIAL_MISSING',
  'DECISION_REQUIRED',
  'WAITING_HUMAN_APPROVAL',
  'APPROVED_SCOPE',
  'READY_FOR_PRODUCTION',
  'REVISION_REQUIRED',
  'DELIVERED',
  'WAITING_ACCEPTANCE',
  'ACCEPTED'
])

const SCOPE_REQUIRED_STATES = new Set<ProductionGateState>([
  'APPROVED_SCOPE',
  'READY_FOR_PRODUCTION',
  'REVISION_REQUIRED',
  'DELIVERED',
  'WAITING_ACCEPTANCE',
  'ACCEPTED'
])

function textList(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null
  }

  return value.flatMap(item => {
    const text = asTrimmedText(item)

    return text ? [text] : []
  })
}

function integer(value: unknown, minimum = 1): number | null {
  const result = asNullableNumber(value)

  return result !== null && Number.isInteger(result) && result >= minimum ? result : null
}

function gateState(value: unknown): ProductionGateState | null {
  return typeof value === 'string' && GATE_STATES.has(value as ProductionGateState)
    ? (value as ProductionGateState)
    : null
}

function approvedScope(value: unknown): ProductionApprovedScope | null {
  if (!isRecord(value)) {
    return null
  }

  const scopeId = asTrimmedText(value.scope_id)
  const version = integer(value.version)
  const items = textList(value.items)
  const approvedBy = asTrimmedText(value.approved_by)
  const approvedAt = asIsoDateTime(value.approved_at)
  const scopeHash = asTrimmedText(value.scope_hash)?.toLowerCase() ?? null

  if (
    !scopeId ||
    version === null ||
    !items?.length ||
    !approvedBy ||
    !approvedAt ||
    !scopeHash ||
    !/^[0-9a-f]{64}$/.test(scopeHash)
  ) {
    return null
  }

  return { scopeId, version, items, approvedBy, approvedAt, scopeHash }
}

function acceptance(value: unknown): ProductionAcceptance | null {
  if (!isRecord(value)) {
    return null
  }

  const verdict = asTrimmedText(value.verdict)

  return verdict ? { verdict, reviewerComment: asTrimmedText(value.reviewer_comment) } : null
}

function bundleMeta(value: unknown): ProductionBundleMeta | null {
  if (!isRecord(value)) {
    return null
  }

  return {
    missingInformation: textList(value.missing_information),
    decisionRequired: typeof value.decision_required === 'boolean' ? value.decision_required : null,
    decisionNote: asTrimmedText(value.decision_note),
    dueDate: asTrimmedText(value.due_date),
    revision: integer(value.revision),
    revisionReason: asTrimmedText(value.revision_reason)
  }
}

function event(value: unknown): ProductionEvent | null {
  if (!isRecord(value)) {
    return null
  }

  const state = value.state === undefined || value.state === null ? null : gateState(value.state)

  if (value.state !== undefined && value.state !== null && state === null) {
    return null
  }

  return {
    state,
    at: asIsoDateTime(value.at),
    actor: asTrimmedText(value.actor),
    note: asTrimmedText(value.note),
    revision: integer(value.revision),
    revisionReason: asTrimmedText(value.revision_reason),
    reviewerComment: asTrimmedText(value.reviewer_comment),
    manifestVersion: asTrimmedText(value.manifest_version)
  }
}

/**
 * Adapts the canonical WorkBridge OpenAPI 1.6 ProductionReadModel projection.
 * `authority` is a transport fact, not a field the backend must repeat.
 */
export function adaptProductionReviews(payload: unknown): AdapterResult<readonly ProductionReview[]> {
  const issues: AdapterIssue[] = []
  const reviews = new Map<string, ProductionReview>()
  const ambiguous = new Set<string>()

  for (const candidate of recordsFromPayload(payload)) {
    if (!isRecord(candidate)) {
      issues.push(issue('workbridge', 'invalid_record', 'ProductionReadModel is not an object.'))

      continue
    }

    const workId = asTrimmedText(candidate.work_id)
    const state = gateState(candidate.gate_state)
    const missingInformation = textList(candidate.missing_information)
    const rawScopeHistory = candidate.scope_history
    const rawEvents = candidate.events

    if (
      !workId ||
      !state ||
      missingInformation === null ||
      !Array.isArray(rawScopeHistory) ||
      !Array.isArray(rawEvents)
    ) {
      issues.push(issue('workbridge', 'invalid_record', 'ProductionReadModel required fields are invalid.', workId))

      continue
    }

    const currentScope =
      candidate.approved_scope === null || candidate.approved_scope === undefined
        ? null
        : approvedScope(candidate.approved_scope)

    const scopeHistory = rawScopeHistory.map(approvedScope)
    const events = rawEvents.map(event)

    if (
      (candidate.approved_scope !== null && candidate.approved_scope !== undefined && currentScope === null) ||
      scopeHistory.some(item => item === null) ||
      events.some(item => item === null)
    ) {
      issues.push(issue('workbridge', 'invalid_field', 'ProductionReadModel nested contract is invalid.', workId))

      continue
    }

    if (SCOPE_REQUIRED_STATES.has(state) && currentScope === null) {
      issues.push(issue('workbridge', 'invalid_field', `${state} has no canonical approved_scope.`, workId))

      continue
    }

    const parsedAcceptance =
      candidate.acceptance === null || candidate.acceptance === undefined ? null : acceptance(candidate.acceptance)

    const parsedBundleMeta =
      candidate.bundle_meta === null || candidate.bundle_meta === undefined ? null : bundleMeta(candidate.bundle_meta)

    const decisionRequired =
      candidate.decision_required === null || candidate.decision_required === undefined
        ? null
        : typeof candidate.decision_required === 'boolean'
          ? candidate.decision_required
          : undefined

    const manifestVersion =
      candidate.manifest_version === null || candidate.manifest_version === undefined
        ? null
        : typeof candidate.manifest_version === 'string'
          ? asTrimmedText(candidate.manifest_version)
          : undefined

    if (candidate.acceptance !== null && candidate.acceptance !== undefined && parsedAcceptance === null) {
      issues.push(issue('workbridge', 'invalid_field', 'ProductionReadModel acceptance is invalid.', workId))

      continue
    }

    if (state === 'ACCEPTED' && parsedAcceptance === null) {
      issues.push(issue('workbridge', 'invalid_field', 'ACCEPTED has no canonical acceptance verdict.', workId))

      continue
    }

    if (parsedBundleMeta === null && candidate.bundle_meta !== null && candidate.bundle_meta !== undefined) {
      issues.push(issue('workbridge', 'invalid_field', 'ProductionReadModel bundle_meta is invalid.', workId))

      continue
    }

    if (decisionRequired === undefined || manifestVersion === undefined) {
      issues.push(issue('workbridge', 'invalid_field', 'ProductionReadModel scalar field type is invalid.', workId))

      continue
    }

    const typedScopeHistory = scopeHistory as readonly ProductionApprovedScope[]

    const scopeVersionsAreMonotonic = typedScopeHistory.every(
      (scope, index) => index === 0 || scope.version > typedScopeHistory[index - 1].version
    )

    const latestScope = typedScopeHistory.at(-1) ?? null

    if (
      !scopeVersionsAreMonotonic ||
      (currentScope === null && latestScope !== null) ||
      (currentScope !== null &&
        (latestScope === null ||
          latestScope.version !== currentScope.version ||
          latestScope.scopeHash !== currentScope.scopeHash))
    ) {
      issues.push(issue('workbridge', 'invalid_field', 'ProductionReadModel scope history is inconsistent.', workId))

      continue
    }

    if (reviews.has(workId) || ambiguous.has(workId)) {
      reviews.delete(workId)
      ambiguous.add(workId)
      issues.push(issue('workbridge', 'duplicate_id', `Ambiguous ProductionReadModel for ${workId}.`, workId))

      continue
    }

    const revision =
      candidate.revision === null || candidate.revision === undefined ? null : integer(candidate.revision)

    if (candidate.revision !== null && candidate.revision !== undefined && revision === null) {
      issues.push(issue('workbridge', 'invalid_field', 'ProductionReadModel revision is invalid.', workId))

      continue
    }

    reviews.set(workId, {
      workId,
      authority: 'workbridge',
      gateState: state,
      missingInformation,
      decisionRequired,
      approvedScope: currentScope,
      scopeHistory: typedScopeHistory,
      revision,
      manifestVersion,
      acceptance: parsedAcceptance,
      bundleMeta: parsedBundleMeta,
      events: events as readonly ProductionEvent[],
      source: { system: 'workbridge', recordId: workId }
    })
  }

  return { data: [...reviews.values()], issues }
}
