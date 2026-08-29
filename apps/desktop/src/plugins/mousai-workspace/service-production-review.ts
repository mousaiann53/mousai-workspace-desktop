import type { Deliverable, ProductionReview, Project, Task } from './domain'

export interface ProductionReviewItem {
  readonly deliverable: Deliverable
  readonly project: Project
  readonly review: ProductionReview | null
  readonly task: Task | null
}

function reviewFor(deliverable: Deliverable, reviews: readonly ProductionReview[]): ProductionReview | null {
  const workMatches = reviews.filter(review => review.workId === deliverable.workId)

  return workMatches.length === 1 ? workMatches[0] : null
}

export function buildProductionReviewItems(
  project: Project,
  tasks: readonly Task[],
  deliverables: readonly Deliverable[],
  reviews: readonly ProductionReview[]
): readonly ProductionReviewItem[] {
  const taskById = new Map(tasks.map(task => [task.id, task]))

  return deliverables.map(deliverable => ({
    deliverable,
    project,
    task: taskById.get(deliverable.taskId) ?? taskById.get(deliverable.workId) ?? null,
    review: reviewFor(deliverable, reviews)
  }))
}
