import type { Deliverable, ProductionReview, Project, Task } from './domain'

export interface ProductionReviewItem {
  readonly deliverables: readonly Deliverable[]
  readonly producer: string | null
  readonly provenance: 'external / GPT-PM + Mousai' | 'Mousai Workspace / WorkBuddy' | null
  readonly project: Project
  readonly review: ProductionReview | null
  readonly task: Task
}

function actorMatches(actor: string | null, pattern: RegExp): boolean {
  return actor !== null && pattern.test(actor.trim())
}

function productionAttribution(
  task: Task,
  review: ProductionReview | null
): Pick<ProductionReviewItem, 'producer' | 'provenance'> {
  if (!review) {
    return { producer: null, provenance: null }
  }

  const workBuddyEvent = [...review.events]
    .reverse()
    .find(event => actorMatches(event.actor, /^(workbuddy|司木(?:\s+moss)?)$/i))

  if (workBuddyEvent?.actor) {
    return { producer: workBuddyEvent.actor, provenance: 'Mousai Workspace / WorkBuddy' }
  }

  const externalEvent = [...review.events]
    .reverse()
    .find(event => actorMatches(event.actor, /(?:^|[\s/_-])(gpt|pm)(?:$|[\s/_-])/i))

  const explicitExternalOrigin = actorMatches(task.origin, /(?:external|gpt[\s/_-]*pm)/i)

  if (externalEvent?.actor || explicitExternalOrigin) {
    return {
      producer: externalEvent?.actor ?? task.origin,
      provenance: 'external / GPT-PM + Mousai'
    }
  }

  return { producer: null, provenance: null }
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
  return tasks.map(task => {
    const review = reviewFor(task, reviews)

    return {
      deliverables: deliverables.filter(
        deliverable => deliverable.taskId === task.id || deliverable.workId === task.id
      ),
      ...productionAttribution(task, review),
      project,
      task,
      review
    }
  })
}
