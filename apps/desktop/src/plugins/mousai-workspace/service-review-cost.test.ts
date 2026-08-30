import { describe, expect, it } from 'vitest'

import type { ProductionReview, Project, Task, WorkspaceSnapshot } from './domain'
import { buildAiContribution, buildPlanActualRows, buildProjectReview, buildReviewSummary } from './service-review-cost'

const project: Project = {
  id: 'PROJECT-1',
  name: '项目一',
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
  source: { system: 'workdata', recordId: 'P1' }
}

const task: Task = {
  id: 'WORK-1',
  revision: 'a'.repeat(64),
  title: '测试任务',
  typeLabel: '教学',
  projectRef: 'PROJECT-1',
  status: 'review',
  statusLabel: '待验收',
  priority: 'normal',
  priorityLabel: '普通',
  deadline: '2026-08-30T18:00:00+08:00',
  estimate: '90m',
  executor: 'WorkBuddy',
  nextAction: null,
  origin: 'Workspace',
  artifactUrl: null,
  requiresHumanApproval: true,
  createdAt: null,
  updatedAt: '2026-08-30T19:00:00+08:00',
  workBridgeState: 'review',
  source: { system: 'workdata', recordId: 'W1' }
}

const review: ProductionReview = {
  workId: 'WORK-1',
  authority: 'workbridge',
  gateState: 'ACCEPTED',
  missingInformation: [],
  decisionRequired: false,
  approvedScope: null,
  scopeHistory: [],
  revision: 1,
  manifestVersion: 'v1',
  acceptance: { verdict: 'accepted', reviewerComment: null },
  bundleMeta: null,
  events: [
    {
      state: 'READY_FOR_PRODUCTION',
      at: '2026-08-30T08:00:00+08:00',
      actor: 'WorkBuddy',
      note: null,
      approvedScopeVersion: 1,
      revision: 1,
      revisionReason: null,
      reviewerComment: null,
      manifestVersion: null,
      acceptance: null
    },
    {
      state: 'ACCEPTED',
      at: '2026-08-30T12:00:00+08:00',
      actor: 'Mousai',
      note: null,
      approvedScopeVersion: 1,
      revision: 1,
      revisionReason: null,
      reviewerComment: null,
      manifestVersion: 'v1',
      acceptance: { verdict: 'accepted', reviewerComment: null }
    }
  ],
  source: { system: 'workbridge', recordId: 'WORK-1' }
}

const snapshot: WorkspaceSnapshot = {
  projects: [project],
  tasks: [task],
  events: [],
  deliverables: [
    {
      id: 'D1',
      workId: 'WORK-1',
      taskId: 'WORK-1',
      projectId: 'PROJECT-1',
      name: '文件',
      filename: 'test.pdf',
      format: 'pdf',
      relativePath: 'test.pdf',
      extension: '.pdf',
      sizeBytes: 1,
      sha256: 'b'.repeat(64),
      modifiedAt: '2026-08-30T10:00:00Z',
      updatedAt: '2026-08-30T10:00:00Z',
      submissionState: 'submitted',
      deliveryState: 'delivered',
      reviewState: 'approved',
      localOutputRoot: null,
      source: { system: 'manifest', recordId: 'D1' }
    }
  ],
  productionReviews: [review],
  activities: [],
  loadedAt: '2026-08-30T12:00:00Z'
}

describe('review and cost foundation', () => {
  it('uses accepted events rather than updatedAt as completion evidence', () => {
    const summary = buildReviewSummary(snapshot, 'today', { now: new Date('2026-08-30T08:00:00Z') })
    const [row] = buildPlanActualRows(snapshot)

    expect(summary.completedTasks).toBe(1)
    expect(row.actualCompletion).toBe('2026-08-30T12:00:00+08:00')
    expect(row.plannedDeadline).toBeNull()
    expect(row.actualDuration).toBeNull()
  })

  it('classifies AI contribution only from canonical WorkBuddy production plus an artifact', () => {
    expect(buildAiContribution(snapshot)[0]).toMatchObject({ state: 'AI_PRIMARY' })
    expect(buildAiContribution({ ...snapshot, deliverables: [] })[0]).toMatchObject({ state: 'UNKNOWN' })
  })

  it('keeps project cost and lifecycle unset while deriving current project facts', () => {
    const model = buildProjectReview(snapshot, project)

    expect(model.state).toBe('ongoing')
    expect(model.apiCost).toBeNull()
    expect(model.deliverables).toBe(1)
  })

  it('reports insufficient history instead of zeros when no review events exist', () => {
    const summary = buildReviewSummary({ ...snapshot, productionReviews: [] }, 'week')

    expect(summary.historySufficient).toBe(false)
    expect(summary.completedTasks).toBeNull()
    expect(summary.revisions).toBeNull()
  })
})
