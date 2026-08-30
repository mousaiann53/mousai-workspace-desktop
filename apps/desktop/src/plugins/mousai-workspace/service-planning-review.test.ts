import { describe, expect, it } from 'vitest'

import type { ProductionReview, Task, WorkspaceSnapshot } from './domain'
import { buildAfterWorkBrief, buildPlanningHistory, classifyNightTask } from './service-planning-review'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'WORK-1',
    revision: 'a'.repeat(64),
    title: '测试任务',
    typeLabel: '行政',
    projectRef: null,
    status: 'classified',
    statusLabel: '已分类',
    priority: 'normal',
    priorityLabel: '普通',
    deadline: '2026-08-30T18:00:00+08:00',
    estimate: null,
    executor: '司木 Moss',
    nextAction: '生成草稿',
    origin: 'WorkData',
    artifactUrl: null,
    requiresHumanApproval: false,
    createdAt: null,
    updatedAt: null,
    workBridgeState: 'not_applicable',
    source: { system: 'workdata', recordId: 'WORK-1' },
    ...overrides
  }
}

function review(gateState: ProductionReview['gateState']): ProductionReview {
  return {
    workId: 'WORK-1',
    authority: 'workbridge',
    gateState,
    missingInformation: [],
    decisionRequired: false,
    approvedScope: null,
    scopeHistory: [],
    revision: 2,
    manifestVersion: null,
    acceptance: null,
    bundleMeta: null,
    events: [
      {
        state: 'ACCEPTED',
        at: '2026-08-29T11:00:00+08:00',
        actor: 'Mousai',
        note: null,
        approvedScopeVersion: 1,
        revision: 2,
        revisionReason: null,
        reviewerComment: '通过',
        manifestVersion: 'v2',
        acceptance: { verdict: 'accepted', reviewerComment: '通过' }
      }
    ],
    source: { system: 'workbridge', recordId: 'WORK-1' }
  }
}

function snapshot(tasks: readonly Task[], reviews: readonly ProductionReview[] = []): WorkspaceSnapshot {
  return {
    projects: [],
    tasks,
    events: [],
    deliverables: [],
    productionReviews: reviews,
    activities: [],
    loadedAt: '2026-08-29T00:00:00Z'
  }
}

describe('after-work planning and safety', () => {
  it('allows night automation only with explicit low-risk reversible evidence', () => {
    expect(classifyNightTask(task(), null, { lowRisk: true, reversible: true, prohibited: false }).state).toBe(
      'AUTO_OK'
    )
    expect(classifyNightTask(task(), null, { lowRisk: null, reversible: null, prohibited: null }).state).toBe(
      'HUMAN_REQUIRED'
    )
  })

  it('blocks material and decision gates', () => {
    const result = classifyNightTask(task(), review('MATERIAL_MISSING'), {
      lowRisk: true,
      reversible: true,
      prohibited: false
    })

    expect(result.state).toBe('BLOCKED')
    expect(result.reasons).toContain('资料不完整')
  })

  it('builds an honest brief from canonical task facts', () => {
    const model = buildAfterWorkBrief(
      snapshot([
        task({ id: 'DONE', status: 'completed', updatedAt: '2026-08-29T10:00:00+08:00' }),
        task({ id: 'LATE', deadline: '2026-08-28T18:00:00+08:00', executor: null }),
        task({ id: 'ACTIVE' })
      ]),
      new Date('2026-08-29T04:00:00Z')
    )

    expect(model.completedToday.map(item => item.task.id)).toEqual(['DONE'])
    expect(model.aiCompleted.map(item => item.task.id)).toEqual(['DONE'])
    expect(model.delayed.map(item => item.task.id)).toEqual(['LATE'])
    expect(model.nightPlans[0]?.safety.state).toBe('HUMAN_REQUIRED')
  })

  it('uses accepted production events for actual completion and leaves deadline history unset', () => {
    const [history] = buildPlanningHistory(snapshot([task()], [review('ACCEPTED')]))

    expect(history.actualCompletionAt).toBe('2026-08-29T11:00:00+08:00')
    expect(history.originalDeadline).toBeNull()
    expect(history.rescheduleCount).toBeNull()
    expect(history.events[0]?.label).toBe('最终通过')
  })
})
