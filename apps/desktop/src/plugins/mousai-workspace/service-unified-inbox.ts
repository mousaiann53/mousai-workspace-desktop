import type { ProductionReview, Project, Task, WorkspaceSnapshot } from './domain'
import { planningDateKey } from './service-planning-calendar'
import {
  buildSourceIdentity,
  type DuplicateEvidence,
  duplicateEvidenceForTask,
  type SourceIdentity,
  type SourceType
} from './service-source-identity'
import { waitingReason } from './service-task-views'

export type InboxDdlFilter = 'all' | 'has' | 'missing' | 'overdue'

export interface UnifiedInboxFilters {
  readonly query: string
  readonly projectId: string | null
  readonly sourceType: 'all' | SourceType
  readonly status: 'all' | Task['status']
  readonly ddl: InboxDdlFilter
  readonly waitingOnly: boolean
}

export interface UnifiedInboxItem {
  readonly task: Task
  readonly project: Project | null
  readonly review: ProductionReview | null
  readonly sourceIdentity: SourceIdentity
  readonly confidence: number | null
  readonly extractionState: string | null
  readonly duplicate: DuplicateEvidence
  readonly waiting: string | null
}

function projectForTask(snapshot: WorkspaceSnapshot, task: Task): Project | null {
  return snapshot.projects.find(project => project.id === task.projectRef || project.name === task.projectRef) ?? null
}

export function buildUnifiedInbox(snapshot: WorkspaceSnapshot): readonly UnifiedInboxItem[] {
  return snapshot.tasks
    .filter(task => task.status === 'inbox')
    .map(task => {
      const review = snapshot.productionReviews.find(item => item.workId === task.id) ?? null

      return {
        task,
        project: projectForTask(snapshot, task),
        review,
        sourceIdentity: buildSourceIdentity(task),
        confidence: null,
        extractionState: null,
        duplicate: duplicateEvidenceForTask(task, snapshot.tasks),
        waiting: waitingReason(task, review)
      }
    })
    .toSorted(
      (left, right) =>
        (right.sourceIdentity.receivedAt ?? '').localeCompare(left.sourceIdentity.receivedAt ?? '') ||
        left.task.id.localeCompare(right.task.id)
    )
}

export function filterUnifiedInbox(
  items: readonly UnifiedInboxItem[],
  filters: UnifiedInboxFilters,
  now = new Date()
): readonly UnifiedInboxItem[] {
  const query = filters.query.trim().toLocaleLowerCase()
  const today = planningDateKey(now)

  return items.filter(item => {
    if (filters.sourceType !== 'all' && item.sourceIdentity.sourceType !== filters.sourceType) {
      return false
    }

    if (filters.projectId && item.project?.id !== filters.projectId) {
      return false
    }

    if (filters.status !== 'all' && item.task.status !== filters.status) {
      return false
    }

    if (filters.waitingOnly && !item.waiting) {
      return false
    }

    const ddl = item.task.deadline ? planningDateKey(item.task.deadline) : null

    if (filters.ddl === 'has' && !ddl) {
      return false
    }

    if (filters.ddl === 'missing' && ddl) {
      return false
    }

    if (filters.ddl === 'overdue' && (!ddl || !today || ddl >= today)) {
      return false
    }

    if (query) {
      const haystack = [
        item.task.id,
        item.task.title,
        item.task.nextAction,
        item.project?.name,
        item.sourceIdentity.displayName,
        item.sourceIdentity.originReference
      ]
        .filter(Boolean)
        .join('\n')
        .toLocaleLowerCase()

      if (!haystack.includes(query)) {
        return false
      }
    }

    return true
  })
}
