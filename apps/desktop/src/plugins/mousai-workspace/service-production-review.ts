import type { Deliverable, ProductionReview, Project, Task } from './domain'

export interface ProductionReviewItem {
  readonly deliverables: readonly Deliverable[]
  readonly project: Project
  readonly review: ProductionReview | null
  readonly task: Task
}

function reviewFor(task: Task, reviews: readonly ProductionReview[]): ProductionReview | null {
  const workMatches = reviews.filter(review => review.workId === task.id)

  return workMatches.length === 1 ? workMatches[0] : null
}

export function buildProductionReviewItems(
  project: Project,
  tasks: readonly Task[],
  deliverables: readonly Deliverable[],
  reviews: readonly ProductionReview[]
): readonly ProductionReviewItem[] {
  return tasks.map(task => ({
    deliverables: deliverables.filter(deliverable => deliverable.taskId === task.id || deliverable.workId === task.id),
    project,
    task,
    review: reviewFor(task, reviews)
  }))
}
