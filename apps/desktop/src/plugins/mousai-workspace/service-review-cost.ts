import type {
  AiContributionState,
  CanonicalReviewEvent,
  ProductionReview,
  Project,
  Task,
  WorkspaceSnapshot
} from './domain'
import { planningDateKey } from './service-planning-calendar'
import { waitingReason } from './service-task-views'

export type ReviewScope = 'month' | 'project' | 'today' | 'week'
export type ReadinessState = 'HOLD' | 'NOT APPLICABLE' | 'NOT RUN' | 'PASS'

export interface ReviewSummary {
  readonly scope: ReviewScope
  readonly completedTasks: number | null
  readonly unfinishedTasks: number
  readonly overdueTasks: number
  readonly blockers: number
  readonly waitingReview: number
  readonly acceptedDeliverables: number | null
  readonly revisions: number | null
  readonly activeProjects: number
  readonly ddlRisks: number
  readonly historySufficient: boolean
}

export interface PlanActualRow {
  readonly task: Task
  readonly plannedDeadline: string | null
  readonly currentDeadline: string | null
  readonly scheduledTime: string | null
  readonly actualCompletion: string | null
  readonly estimatedDuration: string | null
  readonly actualDuration: number | null
  readonly rescheduleCount: number | null
}

export interface AiContributionItem {
  readonly workId: string
  readonly title: string
  readonly state: AiContributionState
  readonly evidence: readonly string[]
}

export interface ProjectReviewModel {
  readonly project: Project
  readonly lifecycle: string | null
  readonly state: 'closed' | 'ongoing'
  readonly completedTasks: number
  readonly totalTasks: number
  readonly overdueTasks: number
  readonly revisions: number | null
  readonly deliverables: number
  readonly contribution: Readonly<Record<AiContributionState, number>>
  readonly apiCost: number | null
  readonly blockers: readonly { readonly workId: string; readonly reason: string }[]
  readonly importantEvents: readonly { readonly at: string | null; readonly label: string }[]
}

export interface ReleaseReadinessItem {
  readonly area: string
  readonly state: ReadinessState
  readonly reason: string
}

const TERMINAL_TASKS = new Set<Task['status']>(['archived', 'completed'])
const WORKBUDDY = /^(workbuddy|司木(?:\s+moss)?|moss)$/i
const EXTERNAL_AI = /(?:external|gpt[\s/_-]*pm)/i

function reviewFor(snapshot: WorkspaceSnapshot, workId: string): ProductionReview | null {
  const matches = snapshot.productionReviews.filter(review => review.workId === workId)

  return matches.length === 1 ? matches[0] : null
}

function rangeFor(scope: Exclude<ReviewScope, 'project'>, now: Date): { start: string; end: string } {
  const today = planningDateKey(now) ?? now.toISOString().slice(0, 10)
  const instant = new Date(`${today}T00:00:00Z`)

  if (scope === 'today') {
    return { start: today, end: today }
  }

  if (scope === 'week') {
    const day = instant.getUTCDay() || 7
    const monday = new Date(instant)
    monday.setUTCDate(instant.getUTCDate() - day + 1)
    const sunday = new Date(monday)
    sunday.setUTCDate(monday.getUTCDate() + 6)

    return { start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10) }
  }

  const start = `${today.slice(0, 7)}-01`
  const end = new Date(Date.UTC(instant.getUTCFullYear(), instant.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)

  return { start, end }
}

function eventInRange(at: string | null, range: { start: string; end: string }): boolean {
  const key = at ? planningDateKey(at) : null

  return Boolean(key && key >= range.start && key <= range.end)
}

export function buildReviewSummary(
  snapshot: WorkspaceSnapshot,
  scope: ReviewScope,
  options: { readonly now?: Date; readonly projectId?: string | null } = {}
): ReviewSummary {
  const project = options.projectId
    ? snapshot.projects.find(item => item.id === options.projectId || item.name === options.projectId)
    : null

  const tasks = project
    ? snapshot.tasks.filter(task => task.projectRef === project.id || task.projectRef === project.name)
    : snapshot.tasks

  const taskIds = new Set(tasks.map(task => task.id))
  const reviews = snapshot.productionReviews.filter(review => taskIds.has(review.workId))
  const range = scope === 'project' ? null : rangeFor(scope, options.now ?? new Date())

  const acceptedEvents = reviews.flatMap(review =>
    review.events.filter(event => event.state === 'ACCEPTED' && (!range || eventInRange(event.at, range)))
  )

  const acceptedReviewCount = reviews.filter(review =>
    review.events.some(event => event.state === 'ACCEPTED' && (!range || eventInRange(event.at, range)))
  ).length

  const revisionEvents = reviews.flatMap(review =>
    review.events.filter(event => event.state === 'REVISION_REQUIRED' && (!range || eventInRange(event.at, range)))
  )

  const historySufficient =
    scope === 'project' ? reviews.length > 0 : reviews.some(review => review.events.some(event => event.at))

  const today = planningDateKey(options.now ?? new Date())

  const activeProjectRefs = new Set(
    tasks.filter(task => !TERMINAL_TASKS.has(task.status) && task.projectRef).map(task => task.projectRef as string)
  )

  return {
    scope,
    completedTasks: historySufficient
      ? scope === 'project'
        ? tasks.filter(task => task.status === 'completed').length
        : acceptedReviewCount
      : null,
    unfinishedTasks: tasks.filter(task => !TERMINAL_TASKS.has(task.status)).length,
    overdueTasks: tasks.filter(task => {
      const key = task.deadline ? planningDateKey(task.deadline) : null

      return !TERMINAL_TASKS.has(task.status) && Boolean(today && key && key < today)
    }).length,
    blockers: tasks.filter(task => waitingReason(task, reviewFor(snapshot, task.id))).length,
    waitingReview: tasks.filter(task => {
      const review = reviewFor(snapshot, task.id)

      return task.status === 'review' || review?.gateState === 'WAITING_ACCEPTANCE'
    }).length,
    acceptedDeliverables: historySufficient
      ? scope === 'project'
        ? reviews.filter(review => review.gateState === 'ACCEPTED').length
        : acceptedEvents.length
      : null,
    revisions: historySufficient ? revisionEvents.length : null,
    activeProjects: activeProjectRefs.size,
    ddlRisks: tasks.filter(task => !TERMINAL_TASKS.has(task.status) && task.deadline !== null).length,
    historySufficient
  }
}

export function buildPlanActualRows(snapshot: WorkspaceSnapshot, projectId?: string | null): readonly PlanActualRow[] {
  const project = projectId ? snapshot.projects.find(item => item.id === projectId || item.name === projectId) : null
  // V1-S4 canonical facts: scheduled windows and actual durations come from
  // the Control execution timing projection; reschedule counts and previous
  // deadlines come from the canonical review history. Absent projections
  // stay unavailable — never derived from file timestamps or updatedAt.
  const timingByWork = new Map((snapshot.executionTiming ?? []).map(item => [item.workId, item]))
  const historyByWork = new Map<string, CanonicalReviewEvent[]>()
  const events = snapshot.reviewHistory ?? []

  for (const event of events) {
    const existing = historyByWork.get(event.workId) ?? []
    existing.push(event)
    historyByWork.set(event.workId, existing)
  }

  return snapshot.tasks
    .filter(task => !project || task.projectRef === project.id || task.projectRef === project.name)
    .map(task => {
      const review = reviewFor(snapshot, task.id)
      const accepted = review?.events.findLast(event => event.state === 'ACCEPTED' && event.at) ?? null
      const timing = timingByWork.get(task.id) ?? null
      const taskEvents = (historyByWork.get(task.id) ?? []).filter(event => event.type === 'deadline_changed')
      const lastChange = taskEvents.length ? taskEvents[taskEvents.length - 1] : null

      const plannedDeadline =
        lastChange && typeof lastChange.previousValue === 'string' ? lastChange.previousValue : null

      return {
        task,
        plannedDeadline,
        currentDeadline: task.deadline,
        scheduledTime: timing?.scheduledStart ?? null,
        actualCompletion: accepted?.at ?? null,
        estimatedDuration: task.estimate,
        actualDuration: timing?.actualDurationMinutes ?? null,
        rescheduleCount: snapshot.reviewHistory ? taskEvents.length : null
      }
    })
}

export function buildAiContribution(
  snapshot: WorkspaceSnapshot,
  projectId?: string | null
): readonly AiContributionItem[] {
  const project = projectId ? snapshot.projects.find(item => item.id === projectId || item.name === projectId) : null

  const tasks = snapshot.tasks.filter(
    task => !project || task.projectRef === project.id || task.projectRef === project.name
  )

  // Preferred path: the canonical Control projection (evidence-based, with
  // explicit UNKNOWN semantics). The legacy client-side derivation below only
  // runs for legacy gateways that do not supply the projection.
  if (snapshot.aiContribution) {
    const titles = new Map(tasks.map(task => [task.id, task.title] as const))

    return snapshot.aiContribution
      .filter(item => !project || tasks.some(task => task.id === item.workId))
      .map(item => ({
        workId: item.workId,
        title: titles.get(item.workId) ?? item.workId,
        state: item.state,
        evidence: item.evidenceRefs
      }))
  }

  return tasks
    .map(task => {
      const review = reviewFor(snapshot, task.id)
      const workBuddyEvents = review?.events.filter(event => event.actor && WORKBUDDY.test(event.actor.trim())) ?? []
      const externalEvents = review?.events.filter(event => event.actor && EXTERNAL_AI.test(event.actor)) ?? []
      const revisions = review?.events.filter(event => event.state === 'REVISION_REQUIRED').length ?? 0
      const hasArtifact = snapshot.deliverables.some(item => item.workId === task.id || item.taskId === task.id)
      const evidence: string[] = []
      let state: AiContributionState = 'UNKNOWN'

      if (workBuddyEvents.length && hasArtifact) {
        evidence.push('canonical WorkBuddy production event', 'Manifest / Deliverable metadata')
        state = revisions > 0 ? 'AI_ASSISTED' : 'AI_PRIMARY'

        if (revisions > 0) {
          evidence.push(`${revisions} 次人工修订要求`)
        }
      } else if (externalEvents.length || (task.origin && EXTERNAL_AI.test(task.origin))) {
        evidence.push('canonical external GPT/PM provenance')
        state = 'AI_ASSISTED'
      }

      return { workId: task.id, title: task.title, state, evidence }
    })
}

export function buildProjectReview(snapshot: WorkspaceSnapshot, project: Project): ProjectReviewModel {
  const tasks = snapshot.tasks.filter(task => task.projectRef === project.id || task.projectRef === project.name)
  const taskIds = new Set(tasks.map(task => task.id))
  const reviews = snapshot.productionReviews.filter(review => taskIds.has(review.workId))
  const contribution = buildAiContribution(snapshot, project.id)

  const contributionCounts: Record<AiContributionState, number> = {
    HUMAN: 0,
    AI_ASSISTED: 0,
    AI_PRIMARY: 0,
    AI_AUTONOMOUS: 0,
    UNKNOWN: 0
  }

  for (const item of contribution) {
    contributionCounts[item.state] += 1
  }

  const today = planningDateKey(new Date())

  return {
    project,
    lifecycle: null,
    state: /完成|归档|closed|complete/i.test(project.status ?? '') ? 'closed' : 'ongoing',
    completedTasks: tasks.filter(task => task.status === 'completed').length,
    totalTasks: tasks.length,
    overdueTasks: tasks.filter(task => {
      const deadline = task.deadline ? planningDateKey(task.deadline) : null

      return !TERMINAL_TASKS.has(task.status) && Boolean(today && deadline && deadline < today)
    }).length,
    revisions: reviews.length
      ? reviews.flatMap(review => review.events).filter(event => event.state === 'REVISION_REQUIRED').length
      : null,
    deliverables: snapshot.deliverables.filter(item => taskIds.has(item.workId) || taskIds.has(item.taskId)).length,
    contribution: contributionCounts,
    apiCost: null,
    blockers: tasks.flatMap(task => {
      const reason = waitingReason(task, reviewFor(snapshot, task.id))

      return reason ? [{ workId: task.id, reason }] : []
    }),
    importantEvents: reviews
      .flatMap(review => review.events.map(event => ({ at: event.at, label: event.state ?? 'Production 事件' })))
      .toSorted((left, right) => (right.at ?? '').localeCompare(left.at ?? ''))
  }
}

export const RELEASE_READINESS_FOUNDATION: readonly ReleaseReadinessItem[] = [
  { area: 'Desktop', state: 'NOT RUN', reason: '等待正式 release acceptance evidence' },
  { area: 'Control', state: 'NOT RUN', reason: 'Desktop snapshot 未提供 release evidence' },
  { area: 'WorkBridge', state: 'NOT RUN', reason: '连接成功不等于 release PASS' },
  { area: 'WorkBuddy', state: 'NOT RUN', reason: '需要真实 production run 与人工验收' },
  { area: 'Projects', state: 'NOT RUN', reason: '需要 Product Owner 验收' },
  { area: 'Deliverables', state: 'NOT RUN', reason: '仅 canonical acceptance 可判 PASS' },
  { area: 'Skills', state: 'NOT RUN', reason: '必须真实复跑，skeleton 不计' },
  { area: 'Security', state: 'HOLD', reason: 'canonical security alert / audit contract unavailable' },
  { area: 'Backup', state: 'HOLD', reason: 'canonical backup status unavailable' },
  { area: 'Contract blockers', state: 'HOLD', reason: '见 V1-S4 contract gaps' }
]
