import type { AiContributionState, ProductionReview, Task, WorkspaceSnapshot } from './domain'
import { planningDateKey } from './service-planning-calendar'
import { buildAiContribution } from './service-review-cost'
import { waitingReason } from './service-task-views'

export type NightSafetyState = 'AUTO_OK' | 'BLOCKED' | 'HUMAN_REQUIRED'

export interface NightSafetyEvidence {
  readonly lowRisk: boolean | null
  readonly reversible: boolean | null
  readonly prohibited: boolean | null
}

export interface NightSafetyResult {
  readonly state: NightSafetyState
  readonly reasons: readonly string[]
}

export interface BriefTask {
  readonly task: Task
  readonly note: string
}

export interface NightPlanItem {
  readonly task: Task
  readonly safety: NightSafetyResult
  readonly expectedOutput: string | null
  readonly completionWindow: string | null
  readonly costEstimate: string | null
}

export interface AfterWorkBrief {
  readonly completedToday: readonly BriefTask[]
  readonly delayed: readonly BriefTask[]
  readonly risks: readonly BriefTask[]
  readonly tomorrow: readonly BriefTask[]
  readonly aiCompleted: readonly BriefTask[]
  readonly aiContribution: Readonly<Record<AiContributionState, number>>
  readonly apiCostToday: number | null
  readonly nightPlans: readonly NightPlanItem[]
  readonly nightEstimatedCost: number | null
}

export interface PlanningHistoryItem {
  readonly workId: string
  readonly title: string
  readonly currentDeadline: string | null
  readonly originalDeadline: string | null
  readonly rescheduleCount: number | null
  readonly actualCompletionAt: string | null
  readonly scopeVersions: readonly number[]
  readonly revision: number | null
  readonly events: readonly {
    readonly at: string | null
    readonly label: string
    readonly actor: string | null
  }[]
}

const TERMINAL_STATES = new Set(['archived', 'completed'])
const AI_EXECUTOR = /(workbuddy|司木|moss)/i

function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function reviewForTask(snapshot: WorkspaceSnapshot, workId: string): ProductionReview | null {
  return snapshot.productionReviews.find(review => review.workId === workId) ?? null
}

export function classifyNightTask(
  task: Task,
  review: ProductionReview | null,
  evidence: NightSafetyEvidence
): NightSafetyResult {
  const reasons: string[] = []

  if (evidence.prohibited === true) {
    return { state: 'BLOCKED', reasons: ['命中禁止自动执行的安全边界'] }
  }

  if (review?.gateState === 'MATERIAL_MISSING' || review?.gateState === 'INPUT_REQUIRED') {
    reasons.push('资料不完整')
  }

  if (review?.gateState === 'DECISION_REQUIRED' || review?.gateState === 'WAITING_HUMAN_APPROVAL') {
    reasons.push('需要 Mousai 决策或批准')
  }

  if (reasons.length) {
    return { state: 'BLOCKED', reasons }
  }

  if (!task.executor || !AI_EXECUTOR.test(task.executor)) {
    reasons.push('执行者未明确为 WorkBuddy / 司木 Moss')
  }

  if (task.requiresHumanApproval !== false) {
    reasons.push('人工审批要求未明确关闭')
  }

  if (evidence.lowRisk !== true) {
    reasons.push('低风险证据未确认')
  }

  if (evidence.reversible !== true) {
    reasons.push('可逆性证据未确认')
  }

  if (evidence.prohibited !== false) {
    reasons.push('禁止项检查未确认')
  }

  return reasons.length ? { state: 'HUMAN_REQUIRED', reasons } : { state: 'AUTO_OK', reasons: [] }
}

export function buildAfterWorkBrief(snapshot: WorkspaceSnapshot, now = new Date()): AfterWorkBrief {
  const today = planningDateKey(now)
  const tomorrow = today ? addDays(today, 1) : null
  const completedToday: BriefTask[] = []
  const delayed: BriefTask[] = []
  const risks: BriefTask[] = []
  const tomorrowTasks: BriefTask[] = []
  const aiCompleted: BriefTask[] = []
  const nightPlans: NightPlanItem[] = []

  const contributionCounts: Record<AiContributionState, number> = {
    HUMAN: 0,
    AI_ASSISTED: 0,
    AI_PRIMARY: 0,
    AI_AUTONOMOUS: 0,
    UNKNOWN: 0
  }

  const contributions = buildAiContribution(snapshot)
  const contributionByWorkId = new Map(contributions.map(item => [item.workId, item]))

  for (const contribution of contributions) {
    contributionCounts[contribution.state] += 1
  }

  for (const task of snapshot.tasks) {
    const review = reviewForTask(snapshot, task.id)
    const deadlineDate = task.deadline ? planningDateKey(task.deadline) : null
    const blocker = waitingReason(task, review)

    const acceptedToday =
      review?.events.findLast(event => event.state === 'ACCEPTED' && event.at && planningDateKey(event.at) === today) ??
      null

    if (acceptedToday) {
      const item = { task, note: `canonical acceptance ${acceptedToday.at}` }
      completedToday.push(item)

      const contribution = contributionByWorkId.get(task.id)

      if (contribution && ['AI_ASSISTED', 'AI_AUTONOMOUS', 'AI_PRIMARY'].includes(contribution.state)) {
        aiCompleted.push(item)
      }
    }

    if (!TERMINAL_STATES.has(task.status) && today && deadlineDate && deadlineDate < today) {
      delayed.push({ task, note: `DDL ${task.deadline}` })
    }

    if (!TERMINAL_STATES.has(task.status) && blocker) {
      risks.push({ task, note: blocker })
    }

    if (!TERMINAL_STATES.has(task.status) && tomorrow && deadlineDate === tomorrow) {
      tomorrowTasks.push({ task, note: `DDL ${task.deadline}` })
    }

    if (!TERMINAL_STATES.has(task.status) && task.executor && AI_EXECUTOR.test(task.executor)) {
      nightPlans.push({
        task,
        safety: classifyNightTask(task, review, { lowRisk: null, reversible: null, prohibited: null }),
        expectedOutput: task.nextAction,
        completionWindow: null,
        costEstimate: null
      })
    }
  }

  return {
    completedToday,
    delayed,
    risks,
    tomorrow: tomorrowTasks,
    aiCompleted,
    aiContribution: contributionCounts,
    apiCostToday: null,
    nightPlans,
    nightEstimatedCost: null
  }
}

function productionEventLabel(state: string | null): string {
  const labels: Readonly<Record<string, string>> = {
    ACCEPTED: '最终通过',
    APPROVED_SCOPE: '范围已批准',
    DELIVERED: '已交付',
    READY_FOR_PRODUCTION: '开始生产',
    REVISION_REQUIRED: '要求修订',
    WAITING_ACCEPTANCE: '等待验收',
    WAITING_HUMAN_APPROVAL: '等待人工审批'
  }

  return state ? (labels[state] ?? state) : 'Production 事件'
}

export function buildPlanningHistory(snapshot: WorkspaceSnapshot): readonly PlanningHistoryItem[] {
  return snapshot.tasks
    .map(task => {
      const review = reviewForTask(snapshot, task.id)
      const accepted = review?.events.findLast(event => event.state === 'ACCEPTED' && event.at) ?? null

      return {
        workId: task.id,
        title: task.title,
        currentDeadline: task.deadline,
        originalDeadline: null,
        rescheduleCount: null,
        actualCompletionAt: accepted?.at ?? null,
        scopeVersions: review?.scopeHistory.map(scope => scope.version) ?? [],
        revision: review?.revision ?? null,
        events:
          review?.events.map(event => ({
            at: event.at,
            label: productionEventLabel(event.state),
            actor: event.actor
          })) ?? []
      }
    })
    .toSorted(
      (left, right) =>
        (right.events.at(-1)?.at ?? '').localeCompare(left.events.at(-1)?.at ?? '') ||
        left.workId.localeCompare(right.workId)
    )
}
