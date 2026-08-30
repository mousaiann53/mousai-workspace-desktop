import type { ProductionReview, Task, WorkspaceSnapshot } from './domain'
import { agendaItemsForView, buildAgendaItems, planningDateKey } from './service-planning-calendar'
import { waitingReason } from './service-task-views'

export type PlanningHorizon = 'today' | 'tomorrow' | 'week'

export interface SchedulingBlock {
  readonly id?: string
  readonly startsAt: string
  readonly endsAt: string
}

export interface SchedulingContext {
  readonly now: Date
  readonly horizonEnd: Date
  readonly scheduleBlocks: readonly SchedulingBlock[] | null
  readonly dependencies: ReadonlyMap<string, readonly string[]> | null
  readonly workdayStartHour: number
  readonly workdayEndHour: number
}

export interface CapacitySummary {
  readonly horizon: 'today' | 'week'
  readonly knownEstimateMinutes: number
  readonly unknownEstimateCount: number
  readonly taskCount: number
  readonly fixedEventCount: number
  readonly scheduledMinutes: number | null
  readonly availableMinutes: number | null
  readonly workdayBoundary: string
  readonly sourceState: 'canonical' | 'contract_gap'
}

export interface SchedulingProposal {
  readonly workId: string
  readonly title: string
  readonly projectRef: string | null
  readonly executor: string | null
  readonly deadline: string | null
  readonly estimatedMinutes: number | null
  readonly proposedStart: string | null
  readonly proposedEnd: string | null
  readonly blockingReason: string | null
  readonly rationale: readonly string[]
  readonly requiresHumanApproval: boolean
  readonly sourceState: 'canonical_preview' | 'contract_gap'
}

const TERMINAL_STATES = new Set(['archived', 'completed'])
const PRIORITY = { urgent: 0, high: 1, normal: 2, low: 3, unset: 4 } as const

export function parseEstimatedMinutes(value: string | null): number | null {
  const normalized = value?.trim().toLowerCase()

  if (!normalized) {
    return null
  }

  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(m|min|分钟|h|hr|小时)$/)

  if (!match) {
    return null
  }

  const amount = Number(match[1])
  const unit = match[2]
  const minutes = ['h', 'hr', '小时'].includes(unit) ? amount * 60 : amount

  return Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null
}

function relevantTasks(snapshot: WorkspaceSnapshot, horizon: 'today' | 'week', now: Date): readonly Task[] {
  const ids = new Set(
    agendaItemsForView(buildAgendaItems(snapshot), horizon, now)
      .filter(item => item.kind === 'task_deadline' && item.taskId)
      .map(item => item.taskId as string)
  )

  return snapshot.tasks.filter(task => ids.has(task.id) && !TERMINAL_STATES.has(task.status))
}

export function buildCapacitySummary(
  snapshot: WorkspaceSnapshot,
  horizon: 'today' | 'week',
  now = new Date()
): CapacitySummary {
  const tasks = relevantTasks(snapshot, horizon, now)
  const estimates = tasks.map(task => task.estimatedMinutes ?? parseEstimatedMinutes(task.estimate))

  const fixedEventCount = agendaItemsForView(buildAgendaItems(snapshot), horizon, now).filter(
    item => item.kind === 'workspace_event'
  ).length

  const canonicalBlocks = [...(snapshot.scheduleBlocks ?? []), ...(snapshot.fixedEvents ?? [])]

  const scheduledMinutes = validBlocks(canonicalBlocks).reduce(
    (total, block) => total + Math.round((block.end.getTime() - block.start.getTime()) / 60_000),
    0
  )

  const dayCount = horizon === 'today' ? 1 : 7
  const availableMinutes = Math.max(0, dayCount * 9 * 60 - scheduledMinutes)

  return {
    horizon,
    knownEstimateMinutes: estimates.reduce<number>((total, value) => total + (value ?? 0), 0),
    unknownEstimateCount: estimates.filter(value => value === null).length,
    taskCount: tasks.length,
    fixedEventCount,
    scheduledMinutes,
    availableMinutes,
    workdayBoundary: '18:00 Asia/Shanghai',
    sourceState: 'canonical'
  }
}

function shanghaiTime(dateKey: string, hour: number): Date {
  return new Date(`${dateKey}T${hour.toString().padStart(2, '0')}:00:00+08:00`)
}

function ceilQuarter(date: Date): Date {
  const result = new Date(date)
  result.setUTCSeconds(0, 0)
  result.setUTCMinutes(Math.ceil(result.getUTCMinutes() / 15) * 15)

  return result
}

function nextDay(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)

  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

function validBlocks(blocks: readonly SchedulingBlock[]): readonly { readonly start: Date; readonly end: Date }[] {
  return blocks
    .map(block => ({ start: new Date(block.startsAt), end: new Date(block.endsAt) }))
    .filter(
      block => !Number.isNaN(block.start.getTime()) && !Number.isNaN(block.end.getTime()) && block.end > block.start
    )
    .toSorted((left, right) => left.start.getTime() - right.start.getTime())
}

function findSlot(
  startAt: Date,
  durationMinutes: number,
  context: SchedulingContext,
  allocated: readonly SchedulingBlock[],
  deadline: Date | null
): { readonly start: Date; readonly end: Date } | null {
  const horizonEnd = deadline && deadline < context.horizonEnd ? deadline : context.horizonEnd
  const blocks = validBlocks([...(context.scheduleBlocks ?? []), ...allocated])
  let cursor = ceilQuarter(startAt)

  for (let attempts = 0; attempts < 256 && cursor < horizonEnd; attempts += 1) {
    const dateKey = planningDateKey(cursor)

    if (!dateKey) {
      return null
    }

    const dayStart = shanghaiTime(dateKey, context.workdayStartHour)
    const dayEnd = shanghaiTime(dateKey, context.workdayEndHour)

    if (cursor < dayStart) {
      cursor = dayStart
    }

    const end = new Date(cursor.getTime() + durationMinutes * 60_000)

    if (end > dayEnd) {
      cursor = shanghaiTime(nextDay(dateKey), context.workdayStartHour)

      continue
    }

    const collision = blocks.find(block => cursor < block.end && end > block.start)

    if (collision) {
      cursor = ceilQuarter(collision.end)

      continue
    }

    if (end > horizonEnd) {
      return null
    }

    return { start: cursor, end }
  }

  return null
}

function reviewForTask(reviews: readonly ProductionReview[], workId: string): ProductionReview | null {
  return reviews.find(review => review.workId === workId) ?? null
}

export function buildSchedulingProposals(
  snapshot: WorkspaceSnapshot,
  context: SchedulingContext
): readonly SchedulingProposal[] {
  const tasks = snapshot.tasks
    .filter(task => !TERMINAL_STATES.has(task.status))
    .toSorted(
      (left, right) =>
        (left.deadline ?? '9999').localeCompare(right.deadline ?? '9999') ||
        PRIORITY[left.priority] - PRIORITY[right.priority] ||
        left.id.localeCompare(right.id)
    )

  const allocated: SchedulingBlock[] = []
  let cursor = context.now

  return tasks.map(task => {
    const estimatedMinutes = task.estimatedMinutes ?? parseEstimatedMinutes(task.estimate)
    const review = reviewForTask(snapshot.productionReviews, task.id)
    const canonicalBlocker = waitingReason(task, review)
    const rationale: string[] = []

    if (context.dependencies === null) {
      rationale.push('未提供已确认依赖；本建议不推断依赖关系')
    }

    if (estimatedMinutes === null) {
      rationale.push('预计工时未设置或格式不可识别')
    }

    if (!task.executor) {
      rationale.push('执行者未设置')
    }

    if (canonicalBlocker) {
      rationale.push(canonicalBlocker)
    }

    const deadline = task.deadline ? new Date(task.deadline) : null
    const invalidDeadline = deadline && Number.isNaN(deadline.getTime()) ? null : deadline

    const canPlace = estimatedMinutes !== null && Boolean(task.executor) && !canonicalBlocker

    const slot = canPlace ? findSlot(cursor, estimatedMinutes, context, allocated, invalidDeadline) : null

    if (canPlace && !slot) {
      rationale.push('正式约束范围内没有可用时段')
    }

    if (slot) {
      allocated.push({ id: `proposal:${task.id}`, startsAt: slot.start.toISOString(), endsAt: slot.end.toISOString() })
      cursor = slot.end
    }

    return {
      workId: task.id,
      title: task.title,
      projectRef: task.projectRef,
      executor: task.executor,
      deadline: task.deadline,
      estimatedMinutes,
      proposedStart: slot?.start.toISOString() ?? null,
      proposedEnd: slot?.end.toISOString() ?? null,
      blockingReason: rationale[0] ?? null,
      rationale,
      requiresHumanApproval: true,
      sourceState: slot ? 'canonical_preview' : 'contract_gap'
    }
  })
}
