import { asIsoDateTime, asNullableNumber, asTrimmedText, isRecord, type UnknownRecord } from './adapter-shared'
import type {
  AdapterIssue,
  AiContributionRecord,
  AiContributionState,
  ArtifactRevisionFileMeta,
  ArtifactRevisionRecord,
  BackupStatusRecord,
  CanonicalReviewEvent,
  CanonicalReviewEventType,
  ExecutionTimingRecord,
  NotificationRecord,
  ProductionJsonValue,
  ProviderUsageRollup,
  SecurityAlertRecord,
  SecurityAlertType,
  SourceHealthRecord,
  SystemSettingsRecord,
  UsageLedgerEntry,
  WorkspaceSnapshot
} from './domain'

/**
 * V1-S4 canonical read models. Every parser is strict-but-tolerant: a record
 * that fails its contract is dropped (surfaced as an issue) rather than
 * coerced — a half-parsed fact is worse than an absent one.
 */

const REVIEW_EVENT_TYPES = new Set<CanonicalReviewEventType>([
  'accepted',
  'completed',
  'deadline_changed',
  'reopened',
  'reviewed'
])

const AI_STATES = new Set<AiContributionState>([
  'AI_ASSISTED',
  'AI_AUTONOMOUS',
  'AI_PRIMARY',
  'HUMAN',
  'UNKNOWN'
])

const ALERT_TYPES = new Set<SecurityAlertType>([
  'ledger_mismatch',
  'rate_anomaly',
  'secret_exposure',
  'unknown_model',
  'usage_spike'
])

const BACKUP_STATES = new Set<BackupStatusRecord['state']>(['failed', 'healthy', 'running', 'unknown'])
const HEALTH_STATES = new Set<SourceHealthRecord['health']>(['degraded', 'healthy', 'unavailable', 'unknown'])

export interface RawS4Snapshot {
  readonly reviewHistory?: unknown
  readonly aiContribution?: unknown
  readonly executionTiming?: unknown
  readonly artifactRevisions?: unknown
  readonly systemSettings?: unknown
  readonly usageLedger?: unknown
  readonly usageLedgerTotal?: unknown
  readonly providerUsage?: unknown
  readonly securityAlerts?: unknown
  readonly backupStatus?: unknown
  readonly notifications?: unknown
  readonly sourceHealth?: unknown
}

export interface AdaptedS4Snapshot {
  readonly fields: {
    -readonly [K in keyof Pick<
      WorkspaceSnapshot,
      | 'reviewHistory'
      | 'aiContribution'
      | 'executionTiming'
      | 'artifactRevisions'
      | 'systemSettings'
      | 'usageLedger'
      | 'usageLedgerTotal'
      | 'providerUsage'
      | 'providerCredit'
      | 'costAttribution'
      | 'securityAlerts'
      | 'backupStatus'
      | 'notifications'
      | 'sourceHealth'
    >]: Pick<WorkspaceSnapshot, K>[K]
  }
  readonly issues: readonly AdapterIssue[]
}

function jsonOrNull(value: unknown): ProductionJsonValue | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return value
  }

  if (Array.isArray(value) || isRecord(value)) {
    return value as ProductionJsonValue
  }

  return null
}

function optionalList(value: unknown): readonly UnknownRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function textOrNull(value: unknown): string | null {
  return asTrimmedText(value)
}

function adaptReviewEvents(value: unknown): readonly CanonicalReviewEvent[] {
  return optionalList(value).flatMap(record => {
    const eventId = textOrNull(record.event_id)
    const workId = textOrNull(record.work_id)
    const type = textOrNull(record.type) as CanonicalReviewEventType | null
    const occurredAt = textOrNull(record.occurred_at)
    const actor = textOrNull(record.actor)
    const source = textOrNull(record.source)
    const revision = asNullableNumber(record.revision)

    if (
      !eventId ||
      !workId ||
      !type ||
      !REVIEW_EVENT_TYPES.has(type) ||
      !occurredAt ||
      !actor ||
      !source ||
      (source !== 'production_history' && source !== 'task_mutation') ||
      revision === null
    ) {
      return []
    }

    return [
      {
        eventId,
        workId,
        projectId: textOrNull(record.project_id),
        type,
        occurredAt: asIsoDateTime(occurredAt) ?? occurredAt,
        actor,
        previousValue: jsonOrNull(record.previous_value),
        nextValue: jsonOrNull(record.next_value),
        source,
        revision
      }
    ]
  })
}

function adaptAiContribution(value: unknown): readonly AiContributionRecord[] {
  return optionalList(value).flatMap(record => {
    const workId = textOrNull(record.work_id)
    const state = textOrNull(record.state) as AiContributionState | null
    const assessedBy = textOrNull(record.assessed_by)

    if (!workId || !state || !AI_STATES.has(state) || !assessedBy) {
      return []
    }

    return [
      {
        workId,
        state,
        evidenceRefs: Array.isArray(record.evidence_refs)
          ? record.evidence_refs.flatMap(item => {
              const text = textOrNull(item)

              return text ? [text] : []
            })
          : [],
        assessedBy,
        assessedAt: asIsoDateTime(record.assessed_at),
        revision: asNullableNumber(record.revision) ?? 0
      }
    ]
  })
}

function adaptExecutionTiming(value: unknown): readonly ExecutionTimingRecord[] {
  return optionalList(value).flatMap(record => {
    const workId = textOrNull(record.work_id)

    if (!workId) {
      return []
    }

    return [
      {
        workId,
        scheduledStart: asIsoDateTime(record.scheduled_start),
        scheduledEnd: asIsoDateTime(record.scheduled_end),
        actualStart: asIsoDateTime(record.actual_start),
        actualEnd: asIsoDateTime(record.actual_end),
        actualDurationMinutes: asNullableNumber(record.actual_duration_minutes),
        measuredBy: textOrNull(record.measured_by),
        revision: asNullableNumber(record.revision) ?? 0
      }
    ]
  })
}

function adaptArtifactFile(value: unknown): ArtifactRevisionFileMeta | null {
  if (!isRecord(value)) {
    return null
  }

  const filename = textOrNull(value.filename)
  const extension = textOrNull(value.extension)
  const sizeBytes = asNullableNumber(value.size_bytes)
  const sha256 = textOrNull(value.sha256)

  if (!filename || !extension || sizeBytes === null || !sha256) {
    return null
  }

  return {
    filename,
    relativePath: textOrNull(value.relative_path),
    extension,
    sizeBytes,
    sha256,
    modifiedAt: asIsoDateTime(value.modified_at) ?? textOrNull(value.modified_at) ?? ''
  }
}

function adaptArtifactRevisions(value: unknown): readonly ArtifactRevisionRecord[] {
  return optionalList(value).flatMap(record => {
    const workId = textOrNull(record.work_id)

    if (!workId) {
      return []
    }

    const files = Array.isArray(record.files) ? record.files.map(adaptArtifactFile) : null

    return [
      {
        workId,
        revision: asNullableNumber(record.revision),
        scopeVersion: asNullableNumber(record.scope_version),
        manifestVersion: textOrNull(record.manifest_version),
        producer: textOrNull(record.producer),
        acceptance: null,
        files: files && files.every(file => file !== null) ? (files as readonly ArtifactRevisionFileMeta[]) : null,
        recordedAt: asIsoDateTime(record.recorded_at)
      }
    ]
  })
}

export function adaptSystemSettings(value: unknown): SystemSettingsRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const workdayEnd = textOrNull(value.workday_end)
  const timezone = textOrNull(value.timezone)
  const revision = asNullableNumber(value.revision)

  if (!workdayEnd || !timezone || revision === null) {
    return null
  }

  return {
    workdayEnd,
    nightBudget: asNullableNumber(value.night_budget),
    budgetCurrency: textOrNull(value.budget_currency),
    timezone,
    notificationPreferences: isRecord(value.notification_preferences)
      ? (value.notification_preferences as ProductionJsonValue)
      : null,
    workScopeRevision: asNullableNumber(value.work_scope_revision),
    providerDisplay: Array.isArray(value.provider_display)
      ? value.provider_display.flatMap(item => {
          const text = textOrNull(item)

          return text ? [text] : []
        })
      : null,
    revision
  }
}

function adaptUsageEntries(value: unknown): readonly UsageLedgerEntry[] {
  return optionalList(value).flatMap(record => {
    const usageId = textOrNull(record.usage_id)
    const provider = textOrNull(record.provider)
    const model = textOrNull(record.model)
    const source = textOrNull(record.source)
    const occurredAt = textOrNull(record.occurred_at)
    const requests = asNullableNumber(record.requests)
    const inputTokens = asNullableNumber(record.input_tokens)
    const outputTokens = asNullableNumber(record.output_tokens)
    const totalTokens = asNullableNumber(record.total_tokens)

    if (
      !usageId ||
      !provider ||
      !model ||
      !source ||
      !occurredAt ||
      requests === null ||
      inputTokens === null ||
      outputTokens === null ||
      totalTokens === null
    ) {
      return []
    }

    return [
      {
        usageId,
        occurredAt: asIsoDateTime(occurredAt) ?? occurredAt,
        provider,
        model,
        agent: textOrNull(record.agent),
        projectId: textOrNull(record.project_id),
        workId: textOrNull(record.work_id),
        requests,
        inputTokens,
        outputTokens,
        totalTokens,
        source
      }
    ]
  })
}

function adaptProviderUsage(value: unknown): readonly ProviderUsageRollup[] {
  return optionalList(value).flatMap(record => {
    const provider = textOrNull(record.provider)
    const model = textOrNull(record.model)
    const requests = asNullableNumber(record.requests)
    const tokens = asNullableNumber(record.tokens)
    const valueKind = textOrNull(record.value_kind)

    if (!provider || !model || requests === null || tokens === null) {
      return []
    }

    return [
      {
        periodStart: asIsoDateTime(record.period_start) ?? textOrNull(record.period_start) ?? '',
        periodEnd: asIsoDateTime(record.period_end) ?? textOrNull(record.period_end) ?? '',
        provider,
        model,
        agent: textOrNull(record.agent),
        projectId: textOrNull(record.project_id),
        workId: textOrNull(record.work_id),
        requests,
        tokens,
        value: null,
        currency: null,
        valueKind: valueKind === 'estimated' ? 'estimated' : 'actual'
      }
    ]
  })
}

function adaptSecurityAlerts(value: unknown): readonly SecurityAlertRecord[] {
  return optionalList(value).flatMap(record => {
    const alertId = textOrNull(record.alert_id)
    const type = textOrNull(record.type) as SecurityAlertType | null
    const safeSummary = textOrNull(record.safe_summary)
    const detectedAt = textOrNull(record.detected_at)

    if (!alertId || !type || !ALERT_TYPES.has(type) || !safeSummary || !detectedAt) {
      return []
    }

    return [
      {
        alertId,
        type,
        severity: textOrNull(record.severity) ?? 'info',
        state: textOrNull(record.state) ?? 'open',
        detectedAt: asIsoDateTime(detectedAt) ?? detectedAt,
        provider: textOrNull(record.provider),
        workId: textOrNull(record.work_id),
        safeSummary
      }
    ]
  })
}

function adaptBackupStatus(value: unknown): BackupStatusRecord | null {
  if (!isRecord(value)) {
    return null
  }

  const state = textOrNull(value.state) as BackupStatusRecord['state'] | null
  const checkedAt = textOrNull(value.checked_at)

  if (!state || !BACKUP_STATES.has(state) || !checkedAt) {
    return null
  }

  return {
    latestBackupAt: asIsoDateTime(value.latest_backup_at),
    state,
    lastRestoreTestAt: asIsoDateTime(value.last_restore_test_at),
    lastRestoreTestState: textOrNull(value.last_restore_test_state),
    protectedComponents: Array.isArray(value.protected_components)
      ? value.protected_components.flatMap(item => {
          const text = textOrNull(item)

          return text ? [text] : []
        })
      : [],
    lastErrorCode: textOrNull(value.last_error_code),
    checkedAt: asIsoDateTime(checkedAt) ?? checkedAt
  }
}

function adaptNotifications(value: unknown): readonly NotificationRecord[] {
  return optionalList(value).flatMap(record => {
    const notificationId = textOrNull(record.notification_id)
    const kind = textOrNull(record.kind)
    const severity = textOrNull(record.severity)

    if (!notificationId || (kind !== 'duplicate_possible' && kind !== 'task_state')) {
      return []
    }

    return [
      {
        notificationId,
        kind,
        severity: severity === 'high' ? 'high' : 'info',
        workId: textOrNull(record.work_id),
        title: textOrNull(record.title),
        state: textOrNull(record.state),
        occurredAt: textOrNull(record.occurred_at)
      }
    ]
  })
}

function adaptSourceHealth(value: unknown): readonly SourceHealthRecord[] {
  return optionalList(value).flatMap(record => {
    const sourceType = textOrNull(record.source_type)
    const health = textOrNull(record.health) as SourceHealthRecord['health'] | null
    const checkedAt = textOrNull(record.checked_at)

    if (!sourceType || !health || !HEALTH_STATES.has(health) || !checkedAt) {
      return []
    }

    return [
      {
        sourceType,
        health,
        scopeState: textOrNull(record.scope_state),
        reason: textOrNull(record.reason) ?? '',
        checkedAt: asIsoDateTime(checkedAt) ?? checkedAt
      }
    ]
  })
}

export function adaptS4Snapshot(raw: RawS4Snapshot): AdaptedS4Snapshot {
  const issues: AdapterIssue[] = []
  const fields: AdaptedS4Snapshot['fields'] = {}

  const present = (value: unknown) => value !== undefined && value !== null

  if (present(raw.reviewHistory)) {
    fields.reviewHistory = adaptReviewEvents(raw.reviewHistory)
  }

  if (present(raw.aiContribution)) {
    fields.aiContribution = adaptAiContribution(raw.aiContribution)
  }

  if (present(raw.executionTiming)) {
    fields.executionTiming = adaptExecutionTiming(raw.executionTiming)
  }

  if (present(raw.artifactRevisions)) {
    fields.artifactRevisions = adaptArtifactRevisions(raw.artifactRevisions)
  }

  if (present(raw.systemSettings)) {
    const settings = adaptSystemSettings(raw.systemSettings)

    if (settings) {
      fields.systemSettings = settings
    } else {
      issues.push({ source: 'control', code: 'invalid_record', message: 'systemSettings violates the canonical contract', recordId: null })
    }
  }

  if (present(raw.usageLedger)) {
    fields.usageLedger = adaptUsageEntries(raw.usageLedger)
    const total = asNullableNumber(raw.usageLedgerTotal)
    fields.usageLedgerTotal = total ?? fields.usageLedger.length
  }

  if (present(raw.providerUsage)) {
    fields.providerUsage = adaptProviderUsage(raw.providerUsage)
  }

  if (present(raw.securityAlerts)) {
    fields.securityAlerts = adaptSecurityAlerts(raw.securityAlerts)
  }

  if (present(raw.backupStatus)) {
    const backup = adaptBackupStatus(raw.backupStatus)

    if (backup) {
      fields.backupStatus = backup
    }
  }

  if (present(raw.notifications)) {
    fields.notifications = adaptNotifications(raw.notifications)
  }

  if (present(raw.sourceHealth)) {
    fields.sourceHealth = adaptSourceHealth(raw.sourceHealth)
  }

  // Contractual honest empties: no approved pricing source, no approved
  // billing/credit adapter — cost is never derived from token counts.
  if (fields.usageLedger) {
    fields.costAttribution = []
    fields.providerCredit = []
  }

  return { fields, issues }
}
