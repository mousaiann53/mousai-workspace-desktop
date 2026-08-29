import type { Deliverable, ProductionReview, Project, Task } from './domain'

export interface ProductionReviewItem {
  readonly deliverable: Deliverable
  readonly project: Project
  readonly review: ProductionReview | null
  readonly task: Task | null
}

function reviewFor(deliverable: Deliverable, reviews: readonly ProductionReview[]): ProductionReview | null {
  const exactMatches = reviews.filter(review => {
    if (review.workId !== deliverable.workId) {
      return false
    }

    if (review.deliverableId) {
      return review.deliverableId === deliverable.id
    }

    return review.relativePath === deliverable.relativePath && review.sha256 === deliverable.sha256
  })

  if (exactMatches.length !== 0) {
    return exactMatches.length === 1 ? exactMatches[0] : null
  }

  const workMatches = reviews.filter(
    review =>
      review.workId === deliverable.workId &&
      review.deliverableId === null &&
      review.relativePath === null &&
      review.sha256 === null
  )

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
