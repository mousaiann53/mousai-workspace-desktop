export type DomainSource = 'control' | 'manifest' | 'workbridge' | 'workdata'

export interface SourceReference {
  readonly system: DomainSource
  readonly recordId: string | null
}

export type ProjectType = 'administrative' | 'creative' | 'other' | 'research' | 'teaching'
export type WorkHorizon = 'long' | 'medium' | 'short' | 'unset'
export type Ownership = 'personal' | 'team' | 'unset'

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
  readonly title: string
  readonly typeLabel: string | null
  readonly projectRef: string | null
  readonly status: TaskStatus
  readonly statusLabel: string | null
  readonly priority: TaskPriority
  readonly priorityLabel: string | null
  readonly deadline: string | null
  readonly estimate: string | null
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

export interface ProductionBundleMeta {
  readonly missingInformation: readonly string[] | null
  readonly decisionRequired: boolean | null
  readonly decisionNote: string | null
  readonly dueDate: string | null
  readonly revision: number | null
  readonly revisionReason: string | null
}

export interface ProductionEvent {
  readonly state: ProductionGateState | null
  readonly at: string | null
  readonly actor: string | null
  readonly note: string | null
  readonly revision: number | null
  readonly revisionReason: string | null
  readonly reviewerComment: string | null
  readonly manifestVersion: string | null
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
  readonly loadedAt: string
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
