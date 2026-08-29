import { describe, expect, it } from 'vitest'

import type { Deliverable, ProductionGateState, ProductionReview, Task, WorkspaceSnapshot } from './domain'
import { buildDashboardModel } from './service-dashboard'

function task(id: string, status: Task['status'], deadline: string | null = null): Task {
  return {
    id,
    revision: null,
    title: id,
    typeLabel: null,
    projectRef: null,
    status,
    statusLabel: null,
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
    updatedAt: `2026-08-29T00:00:0${id.at(-1) ?? '0'}Z`,
    workBridgeState: 'not_applicable',
    source: { system: 'workdata', recordId: id }
  }
}

function review(
  workId: string,
  gateState: ProductionGateState,
  missingInformation: readonly string[] = []
): ProductionReview {
  return {
    workId,
    authority: 'workbridge',
    gateState,
    missingInformation,
    decisionRequired: gateState === 'DECISION_REQUIRED',
    approvedScope: null,
    scopeHistory: [],
    revision: null,
    manifestVersion: null,
    acceptance: null,
    bundleMeta: null,
    events: [],
    source: { system: 'workbridge', recordId: workId }
  }
}

function deliverable(workId: string): Deliverable {
  return {
    id: `${workId}:final.pdf`,
    workId,
    taskId: workId,
    projectId: null,
    name: 'final.pdf',
    filename: 'final.pdf',
    format: '.pdf',
    relativePath: 'final.pdf',
    extension: '.pdf',
    sizeBytes: 8,
    sha256: 'a'.repeat(64),
    modifiedAt: '2026-08-29T03:00:00Z',
    updatedAt: '2026-08-29T03:00:00Z',
    submissionState: 'submitted',
    deliveryState: 'delivered',
    reviewState: 'pending',
    localOutputRoot: null,
    source: { system: 'manifest', recordId: 'final.pdf' }
  }
}

describe('dashboard model', () => {
  it('builds seven real-data views without filling missing DDL or inventing facts', () => {
    const tasks = [
      task('WORK-1', 'classified', '2026-08-28T16:00:00Z'),
      task('WORK-2', 'classified', '2026-09-02T16:00:00Z'),
      task('WORK-3', 'review'),
      task('WORK-4', 'material_missing'),
      task('WORK-5', 'decision_required'),
      task('WORK-6', 'local_processing'),
      task('WORK-7', 'review'),
      task('WORK-8', 'classified')
    ]

    const snapshot: WorkspaceSnapshot = {
      projects: [],
      tasks,
      events: [],
      deliverables: [deliverable('WORK-7')],
      productionReviews: [
        review('WORK-3', 'WAITING_HUMAN_APPROVAL'),
        review('WORK-4', 'MATERIAL_MISSING', ['缺正式资料']),
        review('WORK-5', 'DECISION_REQUIRED'),
        review('WORK-6', 'READY_FOR_PRODUCTION'),
        review('WORK-7', 'WAITING_ACCEPTANCE')
      ],
      activities: [],
      loadedAt: '2026-08-29T04:00:00Z'
    }

    const model = buildDashboardModel(snapshot, new Date('2026-08-29T04:00:00Z'))

    expect(model.today.map(item => item.task.id)).toEqual(['WORK-1'])
    expect(model.upcoming.map(item => item.task.id)).toEqual(['WORK-2'])
    expect(model.review.map(item => item.task.id)).toEqual(['WORK-7', 'WORK-3'])
    expect(model.missing.map(item => item.task.id)).toEqual(['WORK-4'])
    expect(model.decision.map(item => item.task.id)).toEqual(['WORK-5'])
    expect(model.producing.map(item => item.task.id)).toEqual(['WORK-6'])
    expect(model.recentDelivered.map(item => item.task.id)).toEqual(['WORK-7'])
    expect(model.deliveredFilesByWorkId.get('WORK-7')?.map(file => file.filename)).toEqual(['final.pdf'])
    expect(model.today.some(item => item.task.id === 'WORK-8')).toBe(false)
    expect(model.upcoming.some(item => item.task.id === 'WORK-8')).toBe(false)
  })

  it('fails closed when duplicate production reviews make authority ambiguous', () => {
    const snapshot: WorkspaceSnapshot = {
      projects: [],
      tasks: [task('WORK-1', 'classified')],
      events: [],
      deliverables: [],
      productionReviews: [review('WORK-1', 'DECISION_REQUIRED'), review('WORK-1', 'READY_FOR_PRODUCTION')],
      activities: [],
      loadedAt: '2026-08-29T04:00:00Z'
    }

    const model = buildDashboardModel(snapshot)

    expect(model.decision).toEqual([])
    expect(model.producing).toEqual([])
  })
})
