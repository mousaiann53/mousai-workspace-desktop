import type { Project, ProjectType, Task, WorkHorizon, WorkspaceSnapshot } from './domain'

export type ProjectTypeFilter = 'all' | ProjectType

export interface ProjectGalleryFilter {
  readonly query: string
  readonly type: ProjectTypeFilter
}

export interface ProjectCardModel {
  readonly project: Project
  readonly tasks: readonly Task[]
  readonly openTaskCount: number
}

export interface ProjectGroup {
  readonly key: WorkHorizon
  readonly label: string
  readonly projects: readonly ProjectCardModel[]
}

export const PROJECT_TYPE_LABELS: Readonly<Record<ProjectType, string>> = {
  teaching: '教学',
  research: '科研',
  administrative: '行政',
  creative: '创意制作',
  other: '其他'
}

export const PROJECT_HORIZON_LABELS: Readonly<Record<WorkHorizon, string>> = {
  long: '长期',
  medium: '中期',
  short: '短期',
  unset: '未设置时间范围'
}

const CLOSED_TASKS = new Set(['archived', 'completed'])

export function projectCardModels(snapshot: WorkspaceSnapshot): readonly ProjectCardModel[] {
  const tasksByProjectRef = new Map<string, Task[]>()

  for (const task of snapshot.tasks) {
    const projectRef = task.projectRef?.trim().toLocaleLowerCase()

    if (!projectRef) {
      continue
    }

    const tasks = tasksByProjectRef.get(projectRef) ?? []

    tasks.push(task)
    tasksByProjectRef.set(projectRef, tasks)
  }

  return snapshot.projects.map(project => {
    const related = [
      ...(tasksByProjectRef.get(project.id.toLocaleLowerCase()) ?? []),
      ...(tasksByProjectRef.get(project.name.toLocaleLowerCase()) ?? [])
    ]

    const tasks = [...new Map(related.map(task => [task.id, task])).values()]

    return {
      project,
      tasks,
      openTaskCount: tasks.filter(task => !CLOSED_TASKS.has(task.status)).length
    }
  })
}

export function filterProjectCards(
  cards: readonly ProjectCardModel[],
  filter: ProjectGalleryFilter
): readonly ProjectCardModel[] {
  const query = filter.query.trim().toLocaleLowerCase()

  return cards.filter(card => {
    if (filter.type !== 'all' && card.project.type !== filter.type) {
      return false
    }

    if (!query) {
      return true
    }

    return [
      card.project.id,
      card.project.name,
      card.project.typeLabel,
      card.project.status,
      card.project.stage,
      card.project.nextAction,
      ...card.project.tags
    ]
      .filter((value): value is string => Boolean(value))
      .some(value => value.toLocaleLowerCase().includes(query))
  })
}

export function groupProjectCards(cards: readonly ProjectCardModel[]): readonly ProjectGroup[] {
  const order: readonly WorkHorizon[] = ['long', 'medium', 'short', 'unset']

  return order
    .map(key => ({
      key,
      label: PROJECT_HORIZON_LABELS[key],
      projects: cards.filter(card => card.project.horizon === key)
    }))
    .filter(group => group.projects.length > 0)
}
