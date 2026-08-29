import { describe, expect, it } from 'vitest'

import type { Project, Task, WorkspaceSnapshot } from './domain'
import { buildProjectTimeline, projectDetailModel } from './service-project-detail'

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'PROJECT-001',
    name: '历史建筑活化利用',
    type: 'teaching',
    typeLabel: '教学',
    status: null,
    stage: null,
    nextAction: null,
    officialSourceUrl: null,
    lastReview: null,
    updatedAt: null,
    horizon: 'unset',
    ownership: 'unset',
    progress: null,
    nextDeadline: null,
    risk: null,
    tags: [],
    courseProfile: {
      audience: null,
      assessmentMethod: null,
      assessmentRatio: null,
      courseMaterialRootUrl: null,
      grade: null,
      lessonPlanTemplateUrl: null,
      localCases: null,
      preferredCases: null,
      professionalBackground: null,
      referenceBooks: null,
      requiredTextbook: null,
      slideTemplateUrl: null,
      teachingWeeks: null,
      totalHours: null,
      weeklyHours: null,
      practiceBaseOrFinalSite: null
    },
    source: { system: 'workdata', recordId: 'rec-project' },
    ...overrides
  }
}

function task(id: string, projectRef: string | null, deadline: string | null = null): Task {
  return {
    id,
    title: `任务 ${id}`,
    typeLabel: null,
    projectRef,
    status: 'inbox',
    statusLabel: '收件箱',
    priority: 'unset',
    priorityLabel: null,
    deadline,
    estimate: null,
    executor: null,
    nextAction: null,
    origin: null,
    artifactUrl: null,
    requiresHumanApproval: null,
    createdAt: null,
    updatedAt: null,
    workBridgeState: 'not_applicable',
    source: { system: 'workdata', recordId: `rec-${id}` }
  }
}

function snapshot(projects: readonly Project[], tasks: readonly Task[]): WorkspaceSnapshot {
  return {
    projects,
    tasks,
    events: [],
    deliverables: [],
    activities: [],
    loadedAt: '2026-08-29T01:00:00Z'
  }
}

describe('project detail presentation model', () => {
  it('relates tasks by authoritative project id or exact project name and excludes bad refs', () => {
    const source = project()

    const model = projectDetailModel(
      snapshot(
        [source],
        [task('WORK-ID', source.id), task('WORK-NAME', source.name), task('WORK-BAD', '跟岗挖掘手册'), task('WORK-NONE', null)]
      ),
      source.id
    )

    expect(model?.tasks.map(item => item.id)).toEqual(['WORK-ID', 'WORK-NAME'])
    expect(model?.deliverables).toEqual([])
    expect(model?.activities).toEqual([])
  })

  it('keeps sparse project facts and source-less timeline layers empty', () => {
    const source = project()
    const model = projectDetailModel(snapshot([source], []), source.id)

    expect(model?.project).toMatchObject({ progress: null, risk: null, nextDeadline: null })
    expect(model?.timeline.map(layer => [layer.key, layer.items.length])).toEqual([
      ['stage', 0],
      ['milestone', 0],
      ['deadline', 0],
      ['event', 0]
    ])
  })

  it('uses only the current stage and never invents historical stages or milestones', () => {
    const timeline = buildProjectTimeline(project({ stage: '资料核验' }), [], [], new Date('2026-08-29T00:00:00Z'))

    expect(timeline[0]).toMatchObject({ key: 'stage', items: [{ title: '资料核验', occurredAt: null }] })
    expect(timeline[1]).toEqual({ key: 'milestone', items: [] })
  })

  it('combines project and task DDLs, deduplicates equal dates, drops invalid dates and sorts chronologically', () => {
    const source = project({ nextDeadline: '2026-09-02T00:00:00Z' })

    const timeline = buildProjectTimeline(
      source,
      [
        task('WORK-LATER', source.id, '2026-09-03T00:00:00Z'),
        task('WORK-DUP', source.id, '2026-09-02T00:00:00Z'),
        task('WORK-EARLY', source.id, '2026-08-20T00:00:00Z'),
        task('WORK-BAD', source.id, 'not-a-date')
      ],
      [],
      new Date('2026-08-29T00:00:00Z')
    )

    const deadlines = timeline.find(layer => layer.key === 'deadline')?.items ?? []

    expect(deadlines.map(item => item.occurredAt)).toEqual([
      '2026-08-20T00:00:00.000Z',
      '2026-09-02T00:00:00.000Z',
      '2026-09-03T00:00:00.000Z'
    ])
    expect(deadlines.map(item => item.timing)).toEqual(['overdue', 'upcoming', 'upcoming'])
    expect(deadlines.find(item => item.occurredAt === '2026-09-02T00:00:00.000Z')?.title).toBe('项目 DDL')
  })

  it('returns null for an unknown project id without falling back to another project', () => {
    expect(projectDetailModel(snapshot([project()], []), 'PROJECT-MISSING')).toBeNull()
  })
})
