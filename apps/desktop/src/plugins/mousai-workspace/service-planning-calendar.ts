import type { ProductionGateState, Task, WorkspaceSnapshot } from './domain'
import { waitingReason } from './service-task-views'

export const PLANNING_TIME_ZONE = 'Asia/Shanghai'

export type CalendarView = 'agenda' | 'month' | 'today' | 'week'
export type AgendaItemKind =
  'production_event' | 'project_deadline' | 'schedule_block' | 'task_deadline' | 'workspace_event'

export interface AgendaItem {
  readonly id: string
  readonly kind: AgendaItemKind
  readonly title: string
  readonly startsAt: string
  readonly endsAt: string | null
  readonly taskId: string | null
  readonly projectId: string | null
  readonly deliverableWorkId: string | null
  readonly source: string
}

export interface DailyTimelineItem {
  readonly task: Task
  readonly projectId: string | null
  readonly projectName: string | null
  readonly timeRange: string
  readonly estimatedDuration: string | null
  readonly blockingState: string | null
  readonly productionGate: ProductionGateState | null
}

function zonedParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: PLANNING_TIME_ZONE,
    year: 'numeric'
  }).formatToParts(value)

  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''

  return { year: Number(part('year')), month: Number(part('month')), day: Number(part('day')) }
}

export function planningDateKey(value: Date | string): string | null {
  const date = typeof value === 'string' ? new Date(value) : value

  if (Number.isNaN(date.getTime())) {
    return null
  }

  const { year, month, day } = zonedParts(date)

  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)

  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function dateRange(view: CalendarView, now: Date): { readonly start: string; readonly end: string } | null {
  const today = planningDateKey(now)

  if (!today || view === 'agenda') {
    return null
  }

  if (view === 'today') {
    return { start: today, end: today }
  }

  const { year, month, day } = zonedParts(now)

  if (view === 'month') {
    const start = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-01`
    const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)

    return { start, end }
  }

  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday
  const start = addDays(today, mondayOffset)

  return { start, end: addDays(start, 6) }
}

function projectForTask(snapshot: WorkspaceSnapshot, task: Task) {
  return snapshot.projects.find(project => project.id === task.projectRef || project.name === task.projectRef) ?? null
}

function productionEventTitle(state: ProductionGateState | null): string {
  if (state === 'DELIVERED') {
    return '已交付'
  }

  if (state === 'WAITING_ACCEPTANCE') {
    return '等待 Mousai 验收'
  }

  if (state === 'ACCEPTED') {
    return '已通过验收'
  }

  return state ?? 'Production event'
}

export function buildAgendaItems(snapshot: WorkspaceSnapshot): readonly AgendaItem[] {
  const items: AgendaItem[] = []

  for (const task of snapshot.tasks) {
    if (!task.deadline || !planningDateKey(task.deadline)) {
      continue
    }

    const project = projectForTask(snapshot, task)

    items.push({
      id: `task:${task.id}:deadline`,
      kind: 'task_deadline',
      title: `${task.title} · DDL`,
      startsAt: task.deadline,
      endsAt: null,
      taskId: task.id,
      projectId: project?.id ?? null,
      deliverableWorkId: null,
      source: task.source.system
    })
  }

  for (const project of snapshot.projects) {
    if (!project.nextDeadline || !planningDateKey(project.nextDeadline)) {
      continue
    }

    items.push({
      id: `project:${project.id}:deadline`,
      kind: 'project_deadline',
      title: `${project.name} · 项目日期`,
      startsAt: project.nextDeadline,
      endsAt: null,
      taskId: null,
      projectId: project.id,
      deliverableWorkId: null,
      source: project.source.system
    })
  }

  for (const event of snapshot.events) {
    if (!event.startsAt || !planningDateKey(event.startsAt)) {
      continue
    }

    items.push({
      id: `event:${event.id}`,
      kind: 'workspace_event',
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      taskId: null,
      projectId: event.projectRef,
      deliverableWorkId: null,
      source: event.source.system
    })
  }

  for (const block of [...(snapshot.scheduleBlocks ?? []), ...(snapshot.fixedEvents ?? [])]) {
    if (!planningDateKey(block.startsAt)) {continue}
    const task = block.workId ? (snapshot.tasks.find(item => item.id === block.workId) ?? null) : null
    const project = task ? projectForTask(snapshot, task) : null
    items.push({
      id: `schedule:${block.blockId}`,
      kind: 'schedule_block',
      title: task?.title ?? '固定日程',
      startsAt: block.startsAt,
      endsAt: block.endsAt,
      taskId: block.workId,
      projectId: project?.id ?? null,
      deliverableWorkId: null,
      source: 'control'
    })
  }

  for (const review of snapshot.productionReviews) {
    const task = snapshot.tasks.find(item => item.id === review.workId) ?? null
    const project = task ? projectForTask(snapshot, task) : null

    for (const [index, event] of review.events.entries()) {
      if (
        !event.at ||
        !planningDateKey(event.at) ||
        !['ACCEPTED', 'DELIVERED', 'WAITING_ACCEPTANCE'].includes(event.state ?? '')
      ) {
        continue
      }

      items.push({
        id: `production:${review.workId}:${index}:${event.state}`,
        kind: 'production_event',
        title: `${task?.title ?? review.workId} · ${productionEventTitle(event.state)}`,
        startsAt: event.at,
        endsAt: null,
        taskId: review.workId,
        projectId: project?.id ?? null,
        deliverableWorkId: review.workId,
        source: review.source.system
      })
    }
  }

  return items.toSorted((left, right) => left.startsAt.localeCompare(right.startsAt) || left.id.localeCompare(right.id))
}

export function agendaItemsForView(
  items: readonly AgendaItem[],
  view: CalendarView,
  now = new Date()
): readonly AgendaItem[] {
  const range = dateRange(view, now)

  if (!range) {
    return items
  }

  return items.filter(item => {
    const key = planningDateKey(item.startsAt)

    return Boolean(key && key >= range.start && key <= range.end)
  })
}

export function buildDailyTimeline(snapshot: WorkspaceSnapshot, now = new Date()): readonly DailyTimelineItem[] {
  const today = planningDateKey(now)
  const reviews = new Map(snapshot.productionReviews.map(review => [review.workId, review]))
  const priority = { urgent: 0, high: 1, normal: 2, low: 3, unset: 4 } as const

  const blocks = new Map(
    (snapshot.scheduleBlocks ?? [])
      .filter(block => block.workId && planningDateKey(block.startsAt) === today)
      .map(block => [block.workId as string, block])
  )

  return snapshot.tasks
    .filter(
      task =>
        ((task.deadline && planningDateKey(task.deadline) === today) || blocks.has(task.id)) &&
        !['archived', 'completed'].includes(task.status)
    )
    .map(task => {
      const project = projectForTask(snapshot, task)
      const review = reviews.get(task.id) ?? null
      const block = blocks.get(task.id)

      const timeRange = block
        ? `${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: PLANNING_TIME_ZONE }).format(new Date(block.startsAt))}–${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: PLANNING_TIME_ZONE }).format(new Date(block.endsAt))}`
        : '未排时'

      return {
        task,
        projectId: project?.id ?? null,
        projectName: project?.name ?? task.projectRef,
        timeRange,
        estimatedDuration:
          task.estimatedMinutes !== undefined && task.estimatedMinutes !== null
            ? `${task.estimatedMinutes} 分钟`
            : task.estimate,
        blockingState: waitingReason(task, review),
        productionGate: review?.gateState ?? null
      }
    })
    .toSorted(
      (left, right) =>
        priority[left.task.priority] - priority[right.task.priority] || left.task.id.localeCompare(right.task.id)
    )
}
