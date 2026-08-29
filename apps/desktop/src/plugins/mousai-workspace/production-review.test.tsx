import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Deliverable, ProductionGateState, ProductionReview, Project, Task } from './domain'
import { ProductionReviewCard } from './production-review'
import type { WorkspaceProductionActionTransport } from './service-production-actions'
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

const approvedScope = {
  scopeId: 'scope-001',
  version: 3,
  items: ['正式交付物'],
  approvedBy: 'Mousai',
  approvedAt: '2026-08-29T01:30:00.000Z',
  scopeHash: 'c'.repeat(64)
} as const

function review(overrides: Partial<ProductionReview> = {}): ProductionReview {
  return {
    workId: task.id,
    authority: 'workbridge',
    gateState: 'WAITING_ACCEPTANCE',
    missingInformation: [],
    decisionRequired: true,
    approvedScope,
    scopeHistory: [approvedScope],
    revision: 2,
    manifestVersion: 'manifest-v3',
    acceptance: null,
    bundleMeta: {
      missingInformation: [],
      decisionRequired: true,
      inputSources: ['source-001'],
      outputRequirements: { formats: ['pdf'] },
      acceptanceCriteria: ['人工验收'],
      deliverables: null,
      decisionNote: null,
      dueDate: '2026-09-01',
      revision: 2,
      revisionReason: '按审阅意见修订'
    },
    events: [
      {
        state: 'REVISION_REQUIRED',
        at: '2026-08-29T02:00:00.000Z',
        actor: 'Mousai',
        note: null,
        revision: 2,
        revisionReason: '修订版式',
        reviewerComment: '版式通过',
        manifestVersion: null
      }
    ],
    source: { system: 'workbridge', recordId: task.id },
    ...overrides
  }
}

const actionTransport = {
  prepareProduction: vi.fn(),
  approveProductionScope: vi.fn(),
  startProduction: vi.fn(),
  requestProductionRevision: vi.fn(),
  acceptProduction: vi.fn()
} satisfies WorkspaceProductionActionTransport

function card(item: ReturnType<typeof buildProductionReviewItems>[number]) {
  return <ProductionReviewCard item={item} onOpenLocal={vi.fn()} onRefresh={vi.fn()} transport={actionTransport} />
}

describe('Production Review presentation', () => {
  it('joins the canonical work-level model and renders authoritative production facts', () => {
    const [item] = buildProductionReviewItems(project, [task], [deliverable], [review()])
    const onOpenLocal = vi.fn()

    render(
      <ProductionReviewCard item={item} onOpenLocal={onOpenLocal} onRefresh={vi.fn()} transport={actionTransport} />
    )

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
      'Scope 历史',
      'Mousai 验收意见',
      'Revision',
      '最终版本',
      'Skill candidate 状态',
      '验收结果',
      'Gate 事件'
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1)
    }

    expect(screen.getByText('历史建筑活化利用')).toBeTruthy()
    expect(screen.getByText('等待验收（WAITING_ACCEPTANCE）')).toBeTruthy()
    expect(screen.getByText('WorkBridge')).toBeTruthy()
    expect(screen.getByText('v3')).toBeTruthy()
    expect(screen.getAllByText('需要决策')).toHaveLength(2)
    expect(screen.getByText('版式通过')).toBeTruthy()
    expect(screen.getByText('r2')).toBeTruthy()
    expect(screen.getByText('已提交')).toBeTruthy()
    expect(screen.getByText('已交付')).toBeTruthy()
    expect(screen.getAllByText('待人工验收')).toHaveLength(2)
    expect(screen.getByText(/Manifest：final.pdf · 1024 bytes · .pdf · version manifest-v3/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '打开本地产物' }))
    expect(onOpenLocal).toHaveBeenCalledWith(task.id)
  })

  it('keeps absent ProductionReadModel fields visibly unset and never invents a record', () => {
    const [item] = buildProductionReviewItems(project, [{ ...task, executor: null, deadline: null }], [deliverable], [])

    render(card(item))

    expect(screen.getByText(/尚无 WorkBridge ProductionReadModel/)).toBeTruthy()
    expect(screen.getAllByText('未设置 / 等待输入').length).toBeGreaterThanOrEqual(10)
    expect(screen.queryByText(/READY_FOR_PRODUCTION/)).toBeNull()
    expect((screen.getByRole('button', { name: '提交待人工审批' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '批准范围' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('requires a separate human confirmation before approving scope and never auto-starts', () => {
    const waiting = review({ gateState: 'WAITING_HUMAN_APPROVAL' })
    const [item] = buildProductionReviewItems(project, [task], [], [waiting])

    render(card(item))

    expect((screen.getByRole('button', { name: '批准范围' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '开始生产' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '批准范围' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getAllByText(task.id).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('WAITING_HUMAN_APPROVAL')).toBeTruthy()
    expect(screen.getAllByText('v3').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('button', { name: '确认批准范围' })).toBeTruthy()
    expect(actionTransport.approveProductionScope).not.toHaveBeenCalled()
    expect(actionTransport.startProduction).not.toHaveBeenCalled()
  })

  it('shows final version only after canonical acceptance', () => {
    const accepted = review({
      gateState: 'ACCEPTED',
      acceptance: { verdict: '通过', reviewerComment: '验收通过' }
    })

    const [item] = buildProductionReviewItems(project, [task], [deliverable], [accepted])

    render(card(item))

    expect(screen.getByText('已验收（ACCEPTED）')).toBeTruthy()
    expect(screen.getByText('通过')).toBeTruthy()
    expect(screen.getByText('manifest-v3')).toBeTruthy()
  })

  it.each<[ProductionGateState, string]>([
    ['INPUT_REQUIRED', '需要输入（INPUT_REQUIRED）'],
    ['MATERIAL_MISSING', '资料缺失（MATERIAL_MISSING）'],
    ['DECISION_REQUIRED', '需要决策（DECISION_REQUIRED）'],
    ['WAITING_HUMAN_APPROVAL', '等待人工批准（WAITING_HUMAN_APPROVAL）'],
    ['APPROVED_SCOPE', 'Scope 已批准（APPROVED_SCOPE）'],
    ['READY_FOR_PRODUCTION', '可进入生产（READY_FOR_PRODUCTION）'],
    ['REVISION_REQUIRED', '需要修订（REVISION_REQUIRED）'],
    ['DELIVERED', '已交付（DELIVERED）'],
    ['WAITING_ACCEPTANCE', '等待验收（WAITING_ACCEPTANCE）'],
    ['ACCEPTED', '已验收（ACCEPTED）']
  ])('preserves the canonical %s gate label', (gateState, label) => {
    const [item] = buildProductionReviewItems(project, [task], [deliverable], [review({ gateState })])

    render(card(item))

    expect(screen.getByText(label)).toBeTruthy()
  })
})
