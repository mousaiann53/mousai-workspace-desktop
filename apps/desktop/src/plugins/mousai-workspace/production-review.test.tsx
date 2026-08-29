import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Deliverable, ProductionReview, Project, Task } from './domain'
import { ProductionReviewCard } from './production-review'
import { buildProductionReviewItems } from './service-production-review'

const SHA = 'a'.repeat(64)

const project: Project = {
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
  source: { system: 'workdata', recordId: 'rec-project' }
}

const task: Task = {
  id: 'WORK-20260829-001',
  revision: 'b'.repeat(64),
  title: '正式交付任务',
  typeLabel: '教学',
  projectRef: project.id,
  status: 'review',
  statusLabel: '待验收',
  priority: 'normal',
  priorityLabel: '普通',
  deadline: '2026-09-01T00:00:00Z',
  estimate: null,
  executor: '司木 Moss',
  nextAction: '等待 Mousai 验收',
  origin: 'Control',
  artifactUrl: null,
  requiresHumanApproval: true,
  createdAt: null,
  updatedAt: null,
  workBridgeState: 'review',
  source: { system: 'workdata', recordId: 'rec-task' }
}

const deliverable: Deliverable = {
  id: `${task.id}:${SHA}:deliverables/final.pdf`,
  workId: task.id,
  taskId: task.id,
  projectId: null,
  name: 'final.pdf',
  filename: 'final.pdf',
  format: '.pdf',
  relativePath: 'deliverables/final.pdf',
  extension: '.pdf',
  sizeBytes: 1024,
  sha256: SHA,
  modifiedAt: '2026-08-29T01:00:00Z',
  updatedAt: '2026-08-29T01:00:00Z',
  submissionState: 'submitted',
  deliveryState: 'delivered',
  reviewState: 'pending',
  localOutputRoot: null,
  source: { system: 'manifest', recordId: 'deliverables/final.pdf' }
}

function review(overrides: Partial<ProductionReview> = {}): ProductionReview {
  return {
    id: 'review-001',
    workId: task.id,
    deliverableId: deliverable.id,
    relativePath: null,
    sha256: null,
    authority: 'control',
    gateState: 'ready_for_production',
    gateStatusRaw: 'ready_for_production',
    productionStatus: '已批准生产',
    currentExecutor: '司木 Moss',
    scopeApproved: true,
    approvedScopeVersion: 'scope-v3',
    missingInformation: [],
    decisionsRequired: ['确认发布渠道'],
    mousaiReviewComment: '版式通过',
    revision: 'r2',
    finalVersion: 'v1.0',
    skillCandidateStatus: '待评估',
    updatedAt: '2026-08-29T02:00:00Z',
    source: { system: 'control', recordId: 'review-001' },
    ...overrides
  }
}

describe('Production Review presentation', () => {
  it('prefers an exact deliverable authority record and renders every approved production fact', () => {
    const workLevel = review({
      id: 'review-work',
      deliverableId: null,
      source: { system: 'control', recordId: 'review-work' }
    })

    const exact = review()
    const [item] = buildProductionReviewItems(project, [task], [deliverable], [workLevel, exact])
    const onOpenLocal = vi.fn()

    expect(item.review?.id).toBe('review-001')

    render(<ProductionReviewCard item={item} onOpenLocal={onOpenLocal} />)

    for (const label of [
      '所属项目',
      '当前 Gate',
      'Gate 权威',
      'Production 状态',
      'DDL',
      '当前执行者',
      '下一步',
      '缺失资料',
      '需要决策',
      'WorkBridge 状态',
      'Approved Scope version',
      'Mousai 验收意见',
      'Revision',
      '最终版本',
      'Skill candidate 状态'
    ]) {
      expect(screen.getByText(label)).toBeTruthy()
    }

    expect(screen.getByText('历史建筑活化利用')).toBeTruthy()
    expect(screen.getByText('可进入生产')).toBeTruthy()
    expect(screen.getByText('scope-v3')).toBeTruthy()
    expect(screen.getByText('确认发布渠道')).toBeTruthy()
    expect(screen.getByText('版式通过')).toBeTruthy()
    expect(screen.getByText('v1.0')).toBeTruthy()
    expect(screen.getByText('已提交')).toBeTruthy()
    expect(screen.getByText('已交付')).toBeTruthy()
    expect(screen.getByText('待人工验收')).toBeTruthy()
    expect(screen.getByText(/Manifest：1024 bytes/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '打开本地产物' }))
    expect(onOpenLocal).toHaveBeenCalledWith(task.id)
  })

  it('keeps absent production authority fields visibly unset and never claims readiness', () => {
    const [item] = buildProductionReviewItems(project, [{ ...task, executor: null, deadline: null }], [deliverable], [])

    render(<ProductionReviewCard item={item} onOpenLocal={vi.fn()} />)

    expect(screen.getByText('等待 Control / WorkBridge')).toBeTruthy()
    expect(screen.getByText(/尚无 Control \/ WorkBridge production record/)).toBeTruthy()
    expect(screen.getAllByText('未设置 / 等待输入').length).toBeGreaterThanOrEqual(8)
    expect(screen.queryByText('可进入生产')).toBeNull()
  })

  it('shows an unapproved scope as blocked rather than ready for production', () => {
    const blocked = review({
      gateState: 'blocked',
      gateStatusRaw: 'ready_for_production',
      productionStatus: null,
      scopeApproved: false,
      approvedScopeVersion: null
    })

    const [item] = buildProductionReviewItems(project, [task], [deliverable], [blocked])

    render(<ProductionReviewCard item={item} onOpenLocal={vi.fn()} />)

    expect(screen.getByText('阻塞')).toBeTruthy()
    expect(screen.getByText('未批准')).toBeTruthy()
    expect(screen.queryByText('可进入生产')).toBeNull()
  })
})
