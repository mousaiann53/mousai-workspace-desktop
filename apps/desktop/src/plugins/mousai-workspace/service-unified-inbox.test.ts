import { describe, expect, it } from 'vitest'

import type { Project, Task, WorkspaceSnapshot } from './domain'
import { buildUnifiedInbox, filterUnifiedInbox, type UnifiedInboxFilters } from './service-unified-inbox'

function task(id: string, origin: string | null, projectRef: string | null, deadline: string | null): Task {
  return {
    id,
    revision: 'a'.repeat(64),
    title: `${id} 标题`,
    typeLabel: '行政',
    projectRef,
    status: 'inbox',
    statusLabel: '收件箱',
    priority: 'normal',
    priorityLabel: '普通',
    deadline,
    estimate: null,
    executor: null,
    nextAction: '下一步',
    origin,
    artifactUrl: null,
    requiresHumanApproval: null,
    createdAt: '2026-08-29T10:00:00+08:00',
    updatedAt: null,
    workBridgeState: 'not_applicable',
    source: { system: 'workdata', recordId: `rec-${id}` }
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
  source: { system: 'workdata', recordId: 'PROJECT-1' }
}

function snapshot(): WorkspaceSnapshot {
  return {
    projects: [project],
    tasks: [
      task('WORK-FEISHU', 'Feishu DM', 'PROJECT-1', '2026-08-29T18:00:00+08:00'),
      task('WORK-QQ', 'QQ 群', null, null),
      { ...task('WORK-DONE', 'Manual', null, null), status: 'completed' }
    ],
    events: [],
    deliverables: [],
    productionReviews: [],
    activities: [],
    loadedAt: '2026-08-29T00:00:00Z'
  }
}

const defaults: UnifiedInboxFilters = {
  query: '',
  projectId: null,
  sourceType: 'all',
  status: 'all',
  ddl: 'all',
  waitingOnly: false
}

describe('Unified Inbox read model', () => {
  it('uses only inbox tasks and leaves unsupported facts unset', () => {
    const items = buildUnifiedInbox(snapshot())

    expect(items.map(item => item.task.id)).toEqual(['WORK-FEISHU', 'WORK-QQ'])
    expect(items[0]).toMatchObject({ confidence: null, extractionState: null })
  })

  it('filters canonical in-memory facts without a search index', () => {
    const items = buildUnifiedInbox(snapshot())
    const now = new Date('2026-08-29T04:00:00Z')

    expect(filterUnifiedInbox(items, { ...defaults, sourceType: 'feishu' }, now).map(item => item.task.id)).toEqual([
      'WORK-FEISHU'
    ])
    expect(filterUnifiedInbox(items, { ...defaults, projectId: 'PROJECT-1' }, now)).toHaveLength(1)
    expect(filterUnifiedInbox(items, { ...defaults, ddl: 'missing' }, now).map(item => item.task.id)).toEqual([
      'WORK-QQ'
    ])
    expect(filterUnifiedInbox(items, { ...defaults, query: 'qq' }, now).map(item => item.task.id)).toEqual(['WORK-QQ'])
  })
})
