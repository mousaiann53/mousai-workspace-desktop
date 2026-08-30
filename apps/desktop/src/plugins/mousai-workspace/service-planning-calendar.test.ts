import { describe, expect, it } from 'vitest'

import type { ProductionReview, Project, Task, WorkspaceSnapshot } from './domain'
import { agendaItemsForView, buildAgendaItems, buildDailyTimeline, planningDateKey } from './service-planning-calendar'

function task(id: string, deadline: string | null): Task {
  return {
    id,
    revision: 'a'.repeat(64),
    title: id,
    typeLabel: '行政',
    projectRef: 'PROJECT-1',
    status: 'classified',
    statusLabel: '已分类',
    priority: 'high',
    priorityLabel: '高',
    deadline,
    estimate: null,
    executor: null,
    nextAction: null,
    origin: 'WorkData',
    artifactUrl: null,
    requiresHumanApproval: null,
    createdAt: null,
    updatedAt: null,
    workBridgeState: 'not_applicable',
    source: { system: 'workdata', recordId: id }
  }
}

const project: Project = {
  id: 'PROJECT-1',
  name: '项目一',
  type: 'administrative',
  typeLabel: '行政',
  status: null,
  stage: null,
  nextAction: null,
  officialSourceUrl: null,
  lastReview: null,
  updatedAt: null,
  horizon: 'unset',
  ownership: 'unset',
  progress: null,
  nextDeadline: '2026-09-03T00:00:00+08:00',
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
  source: { system: 'workdata', recordId: 'PROJECT-1' }
}

const review: ProductionReview = {
  workId: 'WORK-TODAY',
  authority: 'workbridge',
  gateState: 'WAITING_ACCEPTANCE',
  missingInformation: [],
  decisionRequired: false,
  approvedScope: null,
  scopeHistory: [],
  revision: 1,
  manifestVersion: 'manifest-v1',
  acceptance: null,
  bundleMeta: null,
  events: [
    {
      state: 'WAITING_ACCEPTANCE',
      at: '2026-08-29T10:00:00+08:00',
      actor: 'WorkBuddy',
      note: null,
      approvedScopeVersion: 1,
      revision: 1,
      revisionReason: null,
      reviewerComment: null,
      manifestVersion: 'manifest-v1',
      acceptance: null
    }
  ],
  source: { system: 'workbridge', recordId: 'WORK-TODAY' }
}

const snapshot: WorkspaceSnapshot = {
  projects: [project],
  tasks: [task('WORK-TODAY', '2026-08-29T18:00:00+08:00'), task('WORK-NEXT', '2026-08-30T18:00:00+08:00')],
  events: [],
  deliverables: [],
  productionReviews: [review],
  activities: [],
  loadedAt: '2026-08-29T00:00:00Z'
}

describe('planning calendar read model', () => {
  const now = new Date('2026-08-29T04:00:00Z')

  it('uses an explicit Shanghai date boundary', () => {
    expect(planningDateKey('2026-08-28T16:00:00Z')).toBe('2026-08-29')
  })

  it('derives only canonical task, project, and production dates', () => {
    const items = buildAgendaItems(snapshot)

    expect(items.map(item => item.kind)).toEqual([
      'production_event',
      'task_deadline',
      'task_deadline',
      'project_deadline'
    ])
    expect(agendaItemsForView(items, 'today', now).map(item => item.id)).toEqual([
      'production:WORK-TODAY:0:WAITING_ACCEPTANCE',
      'task:WORK-TODAY:deadline'
    ])
    expect(agendaItemsForView(items, 'week', now).map(item => item.id)).toContain('task:WORK-NEXT:deadline')
  })

  it('keeps the daily timeline unestimated and unscheduled when canonical fields are absent', () => {
    const [item] = buildDailyTimeline(snapshot, now)

    expect(item.timeRange).toBe('未排时')
    expect(item.estimatedDuration).toBeNull()
    expect(item.productionGate).toBe('WAITING_ACCEPTANCE')
    expect(item.blockingState).toBe('等待 Mousai 人工验收')
  })
})
