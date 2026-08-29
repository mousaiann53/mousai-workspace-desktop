import type { Deliverable, ProductionReview, Project, Task, WorkspaceSnapshot } from './domain'
import { buildProductionReviewItems } from './service-production-review'
import { projectMatchesRef } from './service-project-gallery'

export interface ResourceEntry {
  readonly deliverable: Deliverable
  readonly task: Task | null
  readonly project: Project | null
  readonly review: ProductionReview | null
  readonly producer: string | null
  readonly provenance: 'external / GPT-PM + Mousai' | 'Mousai Workspace / WorkBuddy' | null
}

export interface ResourceGroup {
  readonly key: string
  readonly project: Project | null
  readonly entries: readonly ResourceEntry[]
}

export interface ArchiveModel {
  readonly archivedTasks: readonly { readonly task: Task; readonly project: Project | null }[]
  readonly completedTasks: readonly { readonly task: Task; readonly project: Project | null }[]
  readonly acceptedDeliverables: readonly ResourceEntry[]
}

function uniqueReview(workId: string, reviews: readonly ProductionReview[]): ProductionReview | null {
  const matches = reviews.filter(review => review.workId === workId)

  return matches.length === 1 ? matches[0] : null
}

function projectForTask(
  snapshot: WorkspaceSnapshot,
  task: Task | null,
  directProjectId: string | null
): Project | null {
  const direct = directProjectId ? snapshot.projects.filter(project => project.id === directProjectId) : []

  if (direct.length === 1) {
    return direct[0]
  }

  const related = task ? snapshot.projects.filter(project => projectMatchesRef(project, task.projectRef)) : []

  return related.length === 1 ? related[0] : null
}

function resourceEntry(snapshot: WorkspaceSnapshot, deliverable: Deliverable): ResourceEntry {
  const taskMatches = snapshot.tasks.filter(task => task.id === deliverable.taskId || task.id === deliverable.workId)
  const task = taskMatches.length === 1 ? taskMatches[0] : null
  const project = projectForTask(snapshot, task, deliverable.projectId)
  const review = uniqueReview(deliverable.workId, snapshot.productionReviews)

  const productionItem =
    project && task ? buildProductionReviewItems(project, [task], [deliverable], review ? [review] : [])[0] : null

  return {
    deliverable,
    task,
    project,
    review,
    producer: productionItem?.producer ?? null,
    provenance: productionItem?.provenance ?? null
  }
}

function byTaskUpdated(left: { readonly task: Task }, right: { readonly task: Task }): number {
  const leftAt = left.task.updatedAt ?? left.task.createdAt ?? ''
  const rightAt = right.task.updatedAt ?? right.task.createdAt ?? ''

  return rightAt.localeCompare(leftAt) || left.task.id.localeCompare(right.task.id)
}

export function buildResourceGroups(snapshot: WorkspaceSnapshot): readonly ResourceGroup[] {
  const entries = snapshot.deliverables
    .map(deliverable => resourceEntry(snapshot, deliverable))
    .toSorted(
      (left, right) =>
        right.deliverable.modifiedAt.localeCompare(left.deliverable.modifiedAt) ||
        left.deliverable.filename.localeCompare(right.deliverable.filename)
    )

  const groups = new Map<string, ResourceEntry[]>()

  for (const entry of entries) {
    const key = entry.project?.id ?? 'unlinked'

    groups.set(key, [...(groups.get(key) ?? []), entry])
  }

  return [...groups.entries()].map(([key, grouped]) => ({
    key,
    project: grouped[0]?.project ?? null,
    entries: grouped
  }))
}

export function buildArchiveModel(snapshot: WorkspaceSnapshot): ArchiveModel {
  const projectTask = (task: Task) => ({ task, project: projectForTask(snapshot, task, null) })
  const resources = buildResourceGroups(snapshot).flatMap(group => group.entries)

  return {
    archivedTasks: snapshot.tasks
      .filter(task => task.status === 'archived')
      .map(projectTask)
      .toSorted(byTaskUpdated),
    completedTasks: snapshot.tasks
      .filter(task => task.status === 'completed')
      .map(projectTask)
      .toSorted(byTaskUpdated),
    acceptedDeliverables: resources.filter(entry => entry.review?.gateState === 'ACCEPTED')
  }
}
