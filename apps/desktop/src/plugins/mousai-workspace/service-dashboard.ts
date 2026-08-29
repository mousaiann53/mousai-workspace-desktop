import type { Deliverable, ProductionReview, Task, WorkspaceSnapshot } from './domain'
import { tasksForView } from './service-task-views'

export type DashboardSectionId =
  'decision' | 'missing' | 'producing' | 'recentDelivered' | 'review' | 'today' | 'upcoming'

export interface DashboardTaskItem {
  readonly task: Task
  readonly review: ProductionReview | null
}

export interface DashboardModel {
  readonly today: readonly DashboardTaskItem[]
  readonly upcoming: readonly DashboardTaskItem[]
  readonly review: readonly DashboardTaskItem[]
  readonly missing: readonly DashboardTaskItem[]
  readonly decision: readonly DashboardTaskItem[]
  readonly producing: readonly DashboardTaskItem[]
  readonly recentDelivered: readonly DashboardTaskItem[]
  readonly deliveredFilesByWorkId: ReadonlyMap<string, readonly Deliverable[]>
}

function reviewMap(reviews: readonly ProductionReview[]): ReadonlyMap<string, ProductionReview> {
  const grouped = new Map<string, ProductionReview[]>()

  for (const review of reviews) {
    grouped.set(review.workId, [...(grouped.get(review.workId) ?? []), review])
  }

  return new Map(
    [...grouped.entries()].flatMap(([workId, matches]) => (matches.length === 1 ? [[workId, matches[0]]] : []))
  )
}

function byUpdatedAt(left: Task, right: Task): number {
  const leftAt = left.updatedAt ?? left.createdAt ?? ''
  const rightAt = right.updatedAt ?? right.createdAt ?? ''

  return rightAt.localeCompare(leftAt) || left.id.localeCompare(right.id)
}

function taskItems(
  tasks: readonly Task[],
  reviews: ReadonlyMap<string, ProductionReview>
): readonly DashboardTaskItem[] {
  return tasks.map(task => ({ task, review: reviews.get(task.id) ?? null }))
}

function select(
  tasks: readonly Task[],
  reviews: ReadonlyMap<string, ProductionReview>,
  predicate: (task: Task, review: ProductionReview | null) => boolean
): readonly DashboardTaskItem[] {
  return taskItems(tasks.filter(task => predicate(task, reviews.get(task.id) ?? null)).toSorted(byUpdatedAt), reviews)
}

function deliveredFiles(deliverables: readonly Deliverable[]): ReadonlyMap<string, readonly Deliverable[]> {
  const grouped = new Map<string, Deliverable[]>()

  for (const deliverable of deliverables) {
    grouped.set(deliverable.workId, [...(grouped.get(deliverable.workId) ?? []), deliverable])
  }

  return new Map(
    [...grouped.entries()].map(([workId, files]) => [
      workId,
      files.toSorted(
        (left, right) => right.modifiedAt.localeCompare(left.modifiedAt) || left.filename.localeCompare(right.filename)
      )
    ])
  )
}

export function buildDashboardModel(snapshot: WorkspaceSnapshot, now = new Date()): DashboardModel {
  const reviews = reviewMap(snapshot.productionReviews)
  const filesByWorkId = deliveredFiles(snapshot.deliverables)

  const recentDeliveredIds = new Set([
    ...snapshot.deliverables.map(deliverable => deliverable.workId),
    ...[...reviews.values()]
      .filter(review => ['ACCEPTED', 'DELIVERED', 'WAITING_ACCEPTANCE'].includes(review.gateState))
      .map(review => review.workId)
  ])

  return {
    today: taskItems(tasksForView(snapshot.tasks, 'today', now), reviews),
    upcoming: taskItems(tasksForView(snapshot.tasks, 'recent', now), reviews),
    review: select(
      snapshot.tasks,
      reviews,
      (task, review) =>
        task.status === 'review' ||
        review?.gateState === 'WAITING_ACCEPTANCE' ||
        review?.gateState === 'WAITING_HUMAN_APPROVAL'
    ),
    missing: select(
      snapshot.tasks,
      reviews,
      (task, review) =>
        task.status === 'material_missing' ||
        review?.gateState === 'MATERIAL_MISSING' ||
        Boolean(review?.missingInformation.length)
    ),
    decision: select(
      snapshot.tasks,
      reviews,
      (task, review) =>
        task.status === 'decision_required' ||
        review?.gateState === 'DECISION_REQUIRED' ||
        review?.decisionRequired === true
    ),
    producing: select(
      snapshot.tasks,
      reviews,
      (task, review) =>
        task.status === 'cloud_processing' ||
        task.status === 'local_processing' ||
        review?.gateState === 'READY_FOR_PRODUCTION'
    ),
    recentDelivered: taskItems(
      snapshot.tasks.filter(task => recentDeliveredIds.has(task.id)).toSorted(byUpdatedAt),
      reviews
    ),
    deliveredFilesByWorkId: filesByWorkId
  }
}
