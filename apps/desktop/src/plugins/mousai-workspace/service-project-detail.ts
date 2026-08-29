import type { Activity, Deliverable, Event, Project, Task, WorkspaceSnapshot } from './domain'
import { projectMatchesRef, tasksForProject } from './service-project-gallery'

export type TimelineLayer = 'deadline' | 'event' | 'milestone' | 'stage'
export type TimelineTiming = 'overdue' | 'upcoming' | 'undated'

export interface TimelineItem {
  readonly id: string
  readonly layer: TimelineLayer
  readonly title: string
  readonly occurredAt: string | null
  readonly relationId: string | null
  readonly timing: TimelineTiming
}

export interface TimelineLayerModel {
  readonly key: TimelineLayer
  readonly items: readonly TimelineItem[]
}

export interface ProjectDetailModel {
  readonly project: Project
  readonly tasks: readonly Task[]
  readonly deliverables: readonly Deliverable[]
  readonly activities: readonly Activity[]
  readonly timeline: readonly TimelineLayerModel[]
}

function validDate(value: string | null): string | null {
  if (!value) {
    return null
  }

  const date = new Date(value)

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function timing(date: string | null, now: Date): TimelineTiming {
  return date === null ? 'undated' : new Date(date).getTime() < now.getTime() ? 'overdue' : 'upcoming'
}

function relatedEvents(project: Project, events: readonly Event[]): readonly Event[] {
  return events.filter(event => projectMatchesRef(project, event.projectRef))
}

export function buildProjectTimeline(
  project: Project,
  tasks: readonly Task[],
  events: readonly Event[],
  now: Date = new Date()
): readonly TimelineLayerModel[] {
  const stage: TimelineItem[] = project.stage
    ? [
        {
          id: `stage:${project.id}`,
          layer: 'stage',
          title: project.stage,
          occurredAt: null,
          relationId: project.id,
          timing: 'undated'
        }
      ]
    : []

  const deadlines = new Map<string, TimelineItem>()
  const projectDeadline = validDate(project.nextDeadline)

  if (projectDeadline) {
    deadlines.set(projectDeadline, {
      id: `deadline:project:${project.id}:${projectDeadline}`,
      layer: 'deadline',
      title: '项目 DDL',
      occurredAt: projectDeadline,
      relationId: project.id,
      timing: timing(projectDeadline, now)
    })
  }

  for (const task of tasks) {
    const deadline = validDate(task.deadline)

    if (!deadline || deadlines.has(deadline)) {
      continue
    }

    deadlines.set(deadline, {
      id: `deadline:task:${task.id}:${deadline}`,
      layer: 'deadline',
      title: task.title,
      occurredAt: deadline,
      relationId: task.id,
      timing: timing(deadline, now)
    })
  }

  const importantEvents = relatedEvents(project, events)
    .flatMap(event => {
      const occurredAt = validDate(event.startsAt)

      return occurredAt
        ? [
            {
              id: `event:${event.id}`,
              layer: 'event' as const,
              title: event.title,
              occurredAt,
              relationId: event.id,
              timing: timing(occurredAt, now)
            }
          ]
        : []
    })
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))

  return [
    { key: 'stage', items: stage },
    { key: 'milestone', items: [] },
    {
      key: 'deadline',
      items: [...deadlines.values()].sort((left, right) =>
        (left.occurredAt ?? '').localeCompare(right.occurredAt ?? '')
      )
    },
    { key: 'event', items: importantEvents }
  ]
}

export function projectDetailModel(
  snapshot: WorkspaceSnapshot,
  projectId: string,
  now: Date = new Date()
): ProjectDetailModel | null {
  const project = snapshot.projects.find(candidate => candidate.id === projectId)

  if (!project) {
    return null
  }

  const tasks = tasksForProject(project, snapshot.tasks)
  const taskIds = new Set(tasks.map(task => task.id))

  const deliverables = snapshot.deliverables.filter(
    deliverable => deliverable.projectId === project.id || taskIds.has(deliverable.taskId)
  )

  const activities = snapshot.activities.filter(
    activity => projectMatchesRef(project, activity.projectRef) || (activity.workId ? taskIds.has(activity.workId) : false)
  )

  return {
    project,
    tasks,
    deliverables,
    activities,
    timeline: buildProjectTimeline(project, tasks, snapshot.events, now)
  }
}
