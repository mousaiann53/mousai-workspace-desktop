export type DomainSource = 'control' | 'manifest' | 'workbridge' | 'workdata'

export interface SourceReference {
  readonly system: DomainSource
  readonly recordId: string | null
}

export type ProjectType = 'administrative' | 'creative' | 'other' | 'research' | 'teaching'
export type WorkHorizon = 'long' | 'medium' | 'short' | 'unset'
export type Ownership = 'personal' | 'team' | 'unset'

export type IntakeSourceType = 'feishu' | 'hermes_session' | 'manual' | 'qq' | 'unknown' | 'wechat' | 'workspace'

export interface IntakeSourceIdentity {
  readonly sourceType: IntakeSourceType
  readonly sourceId: string | null
  readonly channel: string | null
  readonly displayName: string | null
  readonly originReference: string | null
  readonly receivedAt: string | null
}

export interface IngestEvent {
  readonly eventId: string
  readonly workId: string
  readonly type: 'assigned' | 'extracted' | 'merged' | 'received'
  readonly occurredAt: string
  readonly actor: string
  readonly sourceReference: string | null
  readonly revision: number
  readonly mergedWorkId: string | null
  readonly reason: string | null
}

export interface CanonicalDuplicateEvidence {
  readonly workId: string
  readonly state: 'independent' | 'merged' | 'possible' | 'unknown'
  readonly relatedWorkIds: readonly string[]
  readonly evidence: readonly {
    readonly kind: 'manual_review' | 'same_source_reference'
    readonly reference: string | null
    readonly actor: string | null
    readonly occurredAt: string | null
  }[]
  readonly revision: number
}

export interface WorkScope {
  readonly sourceType: Exclude<IntakeSourceType, 'unknown'>
  readonly scopeId: string
  readonly state: 'approval_required' | 'disabled' | 'enabled'
  readonly label: string
  readonly updatedAt: string
  readonly revision: number
}

export interface WorkScopeEvent {
  readonly eventId: string
  readonly sourceType: Exclude<IntakeSourceType, 'unknown'>
  readonly scopeId: string
  readonly state: WorkScope['state']
  readonly occurredAt: string
  readonly actor: string
  readonly revision: number
}

export interface CourseProfile {
  readonly audience: string | null
  readonly assessmentMethod: string | null
  readonly assessmentRatio: string | null
  readonly courseMaterialRootUrl: string | null
  readonly grade: string | null
  readonly lessonPlanTemplateUrl: string | null
  readonly localCases: string | null
  readonly preferredCases: string | null
  readonly professionalBackground: string | null
  readonly referenceBooks: string | null
  readonly requiredTextbook: string | null
  readonly slideTemplateUrl: string | null
  readonly teachingWeeks: number | null
  readonly totalHours: number | null
  readonly weeklyHours: number | null
  readonly practiceBaseOrFinalSite: string | null
}

export interface Project {
  readonly id: string
  readonly name: string
  readonly type: ProjectType
  readonly typeLabel: string
  readonly status: string | null
  readonly stage: string | null
  readonly nextAction: string | null
  readonly officialSourceUrl: string | null
  readonly lastReview: string | null
  readonly updatedAt: string | null
  readonly horizon: WorkHorizon
  readonly ownership: Ownership
  readonly progress: number | null
  readonly nextDeadline: string | null
  readonly risk: string | null
  readonly tags: readonly string[]
  readonly courseProfile: CourseProfile
  readonly source: SourceReference
}

// V1 keeps the approved “搁置” semantics on `archived` / 已归档. A separate
// shelved enum is a post-V1 candidate and must not silently expand WorkData.
export type TaskStatus =
  | 'archived'
  | 'classified'
  | 'claimed'
  | 'cloud_processing'
  | 'completed'
  | 'decision_required'
  | 'execution_failed'
  | 'inbox'
  | 'local_processing'
  | 'material_missing'
  | 'model_failed'
  | 'review'
  | 'waiting_local'
  | 'unknown'

export type TaskPriority = 'high' | 'low' | 'normal' | 'urgent' | 'unset'
export type WorkBridgeState =
  'archived' | 'claimed' | 'completed' | 'failed' | 'not_applicable' | 'processing' | 'review' | 'unknown' | 'waiting'

export interface Task {
  readonly id: string
  readonly revision: string | null
  readonly intakeRevision?: string | null
  readonly sourceIdentity?: IntakeSourceIdentity | null
  readonly title: string
  readonly typeLabel: string | null
  readonly projectRef: string | null
  readonly status: TaskStatus
  readonly statusLabel: string | null
  readonly priority: TaskPriority
  readonly priorityLabel: string | null
  readonly deadline: string | null
  readonly estimate: string | null
  /** Canonical Planning Core estimate projected by WorkBridge. */
  readonly estimatedMinutes?: number | null
  readonly executor: string | null
  readonly nextAction: string | null
  readonly origin: string | null
  readonly artifactUrl: string | null
  readonly requiresHumanApproval: boolean | null
  readonly createdAt: string | null
  readonly updatedAt: string | null
  readonly workBridgeState: WorkBridgeState
  readonly source: SourceReference
}

export interface Event {
  readonly id: string
  readonly projectRef: string | null
  readonly title: string
  readonly startsAt: string | null
  readonly endsAt: string | null
  readonly source: SourceReference
}

export type PlanningProposalStatus = 'accepted' | 'ignored' | 'pending'

export interface ScheduleBlock {
  readonly blockId: string
  readonly workId: string | null
  readonly startsAt: string
  readonly endsAt: string
  readonly executor: string | null
  readonly kind: 'fixed_event' | 'hold' | 'task'
  readonly revision: number
}

export interface PlanningProposal {
  readonly proposalId: string
  readonly proposalRevision: number
  readonly status: PlanningProposalStatus
  readonly workId: string
  readonly startsAt: string
  readonly endsAt: string
  readonly executor: string | null
  readonly kind: 'task'
  readonly estimatedDurationMinutes: number
  readonly createdAt: string
  readonly createdBy: string
}

export interface PlanningEvent {
  readonly eventId: string
  readonly workId: string
  readonly proposalId: string
  readonly type: string
  readonly occurredAt: string
  readonly actor: string
  readonly proposalRevision: number
  readonly previousValue: ProductionJsonValue | null
  readonly nextValue: ProductionJsonValue | null
  readonly reason: string | null
}

export interface Deliverable {
  readonly id: string
  readonly workId: string
  readonly taskId: string
  readonly projectId: string | null
  readonly name: string
  readonly filename: string
  readonly format: string
  readonly relativePath: string
  readonly extension: string
  readonly sizeBytes: number
  readonly sha256: string
  readonly modifiedAt: string
  readonly updatedAt: string
  readonly submissionState: 'submitted'
  readonly deliveryState: 'delivered' | 'pending'
  readonly reviewState: 'approved' | 'changes_requested' | 'pending' | 'rejected' | 'unknown'
  readonly localOutputRoot: string | null
  readonly source: SourceReference
}

export type ProductionGateState =
  | 'ACCEPTED'
  | 'APPROVED_SCOPE'
  | 'DECISION_REQUIRED'
  | 'DELIVERED'
  | 'INPUT_REQUIRED'
  | 'MATERIAL_MISSING'
  | 'READY_FOR_PRODUCTION'
  | 'REVISION_REQUIRED'
  | 'WAITING_ACCEPTANCE'
  | 'WAITING_HUMAN_APPROVAL'

export interface ProductionApprovedScope {
  readonly scopeId: string
  readonly version: number
  readonly items: readonly string[]
  readonly approvedBy: string
  readonly approvedAt: string
  readonly scopeHash: string
}

export interface ProductionAcceptance {
  readonly verdict: string
  readonly reviewerComment: string | null
}

export type ProductionJsonValue =
  boolean | null | number | string | readonly ProductionJsonValue[] | { readonly [key: string]: ProductionJsonValue }

export interface ProductionBundleMeta {
  readonly missingInformation: readonly string[]
  readonly decisionRequired: boolean
  readonly inputSources: readonly ProductionJsonValue[]
  readonly outputRequirements: { readonly [key: string]: ProductionJsonValue }
  readonly acceptanceCriteria: readonly ProductionJsonValue[]
  readonly deliverables: { readonly [key: string]: ProductionJsonValue } | null
  readonly decisionNote: string | null
  readonly dueDate: string | null
  readonly revision: number
  readonly revisionReason: string | null
}

export interface ProductionEvent {
  readonly state: ProductionGateState | null
  readonly at: string | null
  readonly actor: string | null
  readonly note: string | null
  readonly approvedScopeVersion: number | null
  readonly revision: number | null
  readonly revisionReason: string | null
  readonly reviewerComment: string | null
  readonly manifestVersion: string | null
  readonly acceptance: ProductionAcceptance | null
}

/**
 * Optional authority projection supplied by the existing Workspace snapshot.
 * A missing projection is not a synthetic production record: the UI must keep
 * its Control/WorkBridge-owned facts unset until the backend supplies them.
 */
export interface ProductionReview {
  readonly workId: string
  readonly authority: 'workbridge'
  readonly gateState: ProductionGateState
  readonly missingInformation: readonly string[]
  readonly decisionRequired: boolean | null
  readonly approvedScope: ProductionApprovedScope | null
  readonly scopeHistory: readonly ProductionApprovedScope[]
  readonly revision: number | null
  readonly manifestVersion: string | null
  readonly acceptance: ProductionAcceptance | null
  readonly bundleMeta: ProductionBundleMeta | null
  readonly events: readonly ProductionEvent[]
  readonly source: SourceReference
}

export interface Activity {
  readonly id: string
  readonly projectRef: string | null
  readonly workId: string | null
  readonly summary: string
  readonly occurredAt: string | null
  readonly source: SourceReference
}

export interface WorkspaceSnapshot {
  readonly projects: readonly Project[]
  readonly tasks: readonly Task[]
  readonly events: readonly Event[]
  readonly deliverables: readonly Deliverable[]
  readonly productionReviews: readonly ProductionReview[]
  readonly activities: readonly Activity[]
  /** Canonical Planning Core projections. Optional only for legacy fixtures. */
  readonly scheduleBlocks?: readonly ScheduleBlock[]
  readonly fixedEvents?: readonly ScheduleBlock[]
  readonly planningProposals?: readonly PlanningProposal[]
  readonly planningEvents?: readonly PlanningEvent[]
  /** Canonical Intake Core projections. Optional only for legacy fixtures. */
  readonly ingestEvents?: readonly IngestEvent[]
  readonly duplicateEvidence?: readonly CanonicalDuplicateEvidence[]
  readonly workScope?: readonly WorkScope[]
  readonly workScopeEvents?: readonly WorkScopeEvent[]
  /** Canonical V1-S4 review / cost / safety projections. Optional only for
   * legacy snapshots; a missing key means the authority is unavailable and
   * must render as such, never as an empty-but-implied fact. */
  readonly reviewHistory?: readonly CanonicalReviewEvent[]
  readonly aiContribution?: readonly AiContributionRecord[]
  readonly executionTiming?: readonly ExecutionTimingRecord[]
  readonly artifactRevisions?: readonly ArtifactRevisionRecord[]
  readonly systemSettings?: SystemSettingsRecord
  readonly usageLedger?: readonly UsageLedgerEntry[]
  readonly usageLedgerTotal?: number
  readonly providerUsage?: readonly ProviderUsageRollup[]
  readonly providerCredit?: readonly never[]
  readonly costAttribution?: readonly never[]
  readonly securityAlerts?: readonly SecurityAlertRecord[]
  readonly backupStatus?: BackupStatusRecord
  readonly notifications?: readonly NotificationRecord[]
  readonly sourceHealth?: readonly SourceHealthRecord[]
  readonly loadedAt: string
}

export type CanonicalReviewEventType = 'accepted' | 'completed' | 'deadline_changed' | 'reopened' | 'reviewed'

export interface CanonicalReviewEvent {
  readonly eventId: string
  readonly workId: string
  readonly projectId: string | null
  readonly type: CanonicalReviewEventType
  readonly occurredAt: string
  readonly actor: string
  readonly previousValue: ProductionJsonValue | null
  readonly nextValue: ProductionJsonValue | null
  readonly source: 'production_history' | 'task_mutation'
  readonly revision: number
}

export type AiContributionState = 'AI_ASSISTED' | 'AI_AUTONOMOUS' | 'AI_PRIMARY' | 'HUMAN' | 'UNKNOWN'

export interface AiContributionRecord {
  readonly workId: string
  readonly state: AiContributionState
  readonly evidenceRefs: readonly string[]
  readonly assessedBy: string
  readonly assessedAt: string | null
  readonly revision: number
}

export interface ExecutionTimingRecord {
  readonly workId: string
  readonly scheduledStart: string | null
  readonly scheduledEnd: string | null
  readonly actualStart: string | null
  readonly actualEnd: string | null
  readonly actualDurationMinutes: number | null
  readonly measuredBy: string | null
  readonly revision: number
}

export interface ArtifactRevisionFileMeta {
  readonly filename: string
  readonly relativePath: string | null
  readonly extension: string
  readonly sizeBytes: number
  readonly sha256: string
  readonly modifiedAt: string
}

export interface ArtifactRevisionRecord {
  readonly workId: string
  readonly revision: number | null
  readonly scopeVersion: number | null
  readonly manifestVersion: string | null
  readonly producer: string | null
  readonly acceptance: ProductionAcceptance | null
  readonly files: readonly ArtifactRevisionFileMeta[] | null
  readonly recordedAt: string | null
}

export interface SystemSettingsRecord {
  readonly workdayEnd: string
  readonly nightBudget: number | null
  readonly budgetCurrency: string | null
  readonly timezone: string
  readonly notificationPreferences: ProductionJsonValue | null
  readonly workScopeRevision: number | null
  readonly providerDisplay: readonly string[] | null
  readonly revision: number
}

export interface UsageLedgerEntry {
  readonly usageId: string
  readonly occurredAt: string
  readonly provider: string
  readonly model: string
  readonly agent: string | null
  readonly projectId: string | null
  readonly workId: string | null
  readonly requests: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
  readonly source: string
}

export interface ProviderUsageRollup {
  readonly periodStart: string
  readonly periodEnd: string
  readonly provider: string
  readonly model: string
  readonly agent: string | null
  readonly projectId: string | null
  readonly workId: string | null
  readonly requests: number
  readonly tokens: number
  readonly value: null
  readonly currency: null
  readonly valueKind: 'actual' | 'estimated'
}

export type SecurityAlertType =
  | 'ledger_mismatch'
  | 'rate_anomaly'
  | 'secret_exposure'
  | 'unknown_model'
  | 'usage_spike'

export interface SecurityAlertRecord {
  readonly alertId: string
  readonly type: SecurityAlertType
  readonly severity: string
  readonly state: string
  readonly detectedAt: string
  readonly provider: string | null
  readonly workId: string | null
  readonly safeSummary: string
}

export interface BackupStatusRecord {
  readonly latestBackupAt: string | null
  readonly state: 'failed' | 'healthy' | 'running' | 'unknown'
  readonly lastRestoreTestAt: string | null
  readonly lastRestoreTestState: string | null
  readonly protectedComponents: readonly string[]
  readonly lastErrorCode: string | null
  readonly checkedAt: string
}

export interface NotificationRecord {
  readonly notificationId: string
  readonly kind: 'duplicate_possible' | 'task_state'
  readonly severity: 'high' | 'info'
  readonly workId: string | null
  readonly title: string | null
  readonly state: string | null
  readonly occurredAt: string | null
}

export interface SourceHealthRecord {
  readonly sourceType: string
  readonly health: 'degraded' | 'healthy' | 'unavailable' | 'unknown'
  readonly scopeState: string | null
  readonly reason: string
  readonly checkedAt: string
}

export type AdapterIssueCode = 'duplicate_id' | 'invalid_field' | 'invalid_record' | 'missing_id' | 'missing_name'

export interface AdapterIssue {
  readonly code: AdapterIssueCode
  readonly message: string
  readonly recordId: string | null
  readonly source: DomainSource
}

export interface AdapterResult<T> {
  readonly data: T
  readonly issues: readonly AdapterIssue[]
}
