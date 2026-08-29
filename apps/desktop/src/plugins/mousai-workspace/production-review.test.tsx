import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    decisionRequired: false,
    approvedScope,
    scopeHistory: [approvedScope],
    revision: 2,
    manifestVersion: 'manifest-v3',
    acceptance: null,
    bundleMeta: {
      missingInformation: [],
      decisionRequired: false,
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
        approvedScopeVersion: 3,
        revision: 2,
        revisionReason: '修订版式',
        reviewerComment: '版式通过',
        manifestVersion: null,
        acceptance: null
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
      'Deliverable title',
      'Producer',
      'Provenance',
      '当前 Gate',
      'Gate 权威',
      'Production 状态',
      'Task 状态',
      'DDL',
      '当前执行者',
      '下一步',
      '缺失资料',
      '需要决策',
      'WorkBridge 状态',
      'Approved Scope version',
      'Approved Scope items',
      'Scope 历史',
      'Mousai 验收意见',
      'Revision',
      '最终版本',
      'Skill candidate 状态',
      '验收结果',
      'Submission 状态',
      'Delivery 状态',
      'Acceptance 状态',
      'Gate 事件'
    ]) {
      expect(screen.getAllByText(label).length).toBeGreaterThanOrEqual(1)
    }

    expect(screen.getByText('历史建筑活化利用')).toBeTruthy()
    expect(screen.getAllByText('正式交付任务').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('等待验收（WAITING_ACCEPTANCE）')).toBeTruthy()
    expect(screen.getByText('WorkBridge')).toBeTruthy()
    expect(screen.getByText('v3')).toBeTruthy()
    expect(screen.getAllByText('正式交付物').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('需要决策').parentElement?.textContent).toContain('无')
    expect(screen.getByText('版式通过')).toBeTruthy()
    expect(screen.getByText('r2')).toBeTruthy()
    expect(screen.getByText('已提交')).toBeTruthy()
    expect(screen.getByText('已交付')).toBeTruthy()
    expect(screen.getAllByText('待人工验收')).toHaveLength(3)
    expect(screen.getByText(/Manifest：final.pdf · 1024 bytes · .pdf · version manifest-v3/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '打开本地产物' }))
    expect(onOpenLocal).toHaveBeenCalledWith(task.id)
  })

  it('attributes WorkBuddy only when canonical events contain real WorkBuddy production evidence', () => {
    const baseline = review()

    const workBuddyReview = review({
      events: [
        ...baseline.events,
        {
          state: 'READY_FOR_PRODUCTION',
          at: '2026-08-29T03:00:00.000Z',
          actor: 'workbuddy',
          note: 'production started',
          approvedScopeVersion: 3,
          revision: 2,
          revisionReason: null,
          reviewerComment: null,
          manifestVersion: null,
          acceptance: null
        }
      ]
    })

    const [item] = buildProductionReviewItems(project, [task], [deliverable], [workBuddyReview])

    expect(item.producer).toBe('workbuddy')
    expect(item.provenance).toBe('Mousai Workspace / WorkBuddy')
  })

  it('keeps provenance unset when a title looks like M5 but canonical evidence names no producer', () => {
    const [item] = buildProductionReviewItems(
      project,
      [{ ...task, title: 'M5 教学计划', origin: 'Control' }],
      [deliverable],
      [review()]
    )

    expect(item.producer).toBeNull()
    expect(item.provenance).toBeNull()
  })

  it('uses explicit GPT-PM evidence for an external production record', () => {
    const externalReview = review({
      events: [
        {
          state: 'WAITING_ACCEPTANCE',
          at: '2026-08-29T03:00:00.000Z',
          actor: 'GPT-PM',
          note: 'external delivery',
          approvedScopeVersion: 3,
          revision: 1,
          revisionReason: null,
          reviewerComment: null,
          manifestVersion: 'manifest-v3',
          acceptance: null
        }
      ]
    })

    const [item] = buildProductionReviewItems(project, [task], [deliverable], [externalReview])

    expect(item.producer).toBe('GPT-PM')
    expect(item.provenance).toBe('external / GPT-PM + Mousai')
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
    const waiting = review({
      gateState: 'WAITING_HUMAN_APPROVAL',
      approvedScope: null,
      scopeHistory: [],
      revision: null,
      manifestVersion: null
    })

    const [item] = buildProductionReviewItems(project, [task], [], [waiting])

    render(card(item))

    expect(screen.getByText('等待人工批准（WAITING_HUMAN_APPROVAL）')).toBeTruthy()
    expect((screen.getByRole('button', { name: '批准范围' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '开始生产' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '批准范围' }))

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByText(/批准下方完整 Scope items/)).toBeTruthy()
    expect(screen.getAllByText(task.id).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('WAITING_HUMAN_APPROVAL')).toBeTruthy()
    expect(screen.getAllByText('未设置 / 等待输入').length).toBeGreaterThanOrEqual(3)
    fireEvent.change(screen.getByLabelText('本次 Scope items（每行一项）'), {
      target: { value: 'M5 已批准结构\nM5 已批准交付格式' }
    })
    expect(screen.getByText('M5 已批准结构；M5 已批准交付格式')).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认批准范围' })).toBeTruthy()
    expect(actionTransport.approveProductionScope).not.toHaveBeenCalled()
    expect(actionTransport.startProduction).not.toHaveBeenCalled()
  })

  it('shows approved scope items and version from the canonical read model', () => {
    const approved = review({ gateState: 'APPROVED_SCOPE', manifestVersion: null })
    const [item] = buildProductionReviewItems(project, [task], [], [approved])

    render(card(item))

    expect(screen.getByText('Scope 已批准（APPROVED_SCOPE）')).toBeTruthy()
    expect(screen.getByText('v3')).toBeTruthy()
    expect(screen.getAllByText('正式交付物').length).toBeGreaterThanOrEqual(2)
  })

  it('enables revision and acceptance only while waiting for human acceptance', () => {
    const [item] = buildProductionReviewItems(project, [task], [deliverable], [review()])

    render(card(item))

    expect((screen.getByRole('button', { name: '要求修订' }) as HTMLButtonElement).disabled).toBe(false)
    expect((screen.getByRole('button', { name: '最终通过' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it.each<ProductionGateState>([
    'INPUT_REQUIRED',
    'MATERIAL_MISSING',
    'DECISION_REQUIRED',
    'WAITING_HUMAN_APPROVAL',
    'APPROVED_SCOPE',
    'READY_FOR_PRODUCTION',
    'REVISION_REQUIRED',
    'DELIVERED',
    'ACCEPTED'
  ])('keeps revision and acceptance disabled outside WAITING_ACCEPTANCE (%s)', gateState => {
    const [item] = buildProductionReviewItems(project, [task], [deliverable], [review({ gateState })])

    render(card(item))

    expect((screen.getByRole('button', { name: '要求修订' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '最终通过' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('refetches the canonical snapshot after mutation without painting optimistic production facts', async () => {
    let finishRefresh!: () => void
    const order: string[] = []

    const accepted = review({
      gateState: 'ACCEPTED',
      acceptance: { verdict: 'PASS', reviewerComment: '人工通过' }
    })

    const transport = {
      ...actionTransport,
      acceptProduction: vi.fn(async () => {
        order.push('server')

        return { action: 'accept' as const, production: accepted }
      })
    }

    const onRefresh = vi.fn(
      () =>
        new Promise<void>(resolve => {
          order.push('refresh')
          finishRefresh = resolve
        })
    )

    const [item] = buildProductionReviewItems(project, [task], [deliverable], [review()])

    render(<ProductionReviewCard item={item} onOpenLocal={vi.fn()} onRefresh={onRefresh} transport={transport} />)

    fireEvent.click(screen.getByRole('button', { name: '最终通过' }))
    expect(screen.getByText(/保存本次人工验收 metadata/)).toBeTruthy()
    expect((screen.getByRole('button', { name: '确认最终通过' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Acceptance comment（必填）'), {
      target: { value: 'Mousai 已核对交付 metadata' }
    })
    fireEvent.click(screen.getByRole('button', { name: '确认最终通过' }))

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
    expect(order).toEqual(['server', 'refresh'])
    expect(screen.getByText('等待验收（WAITING_ACCEPTANCE）')).toBeTruthy()
    expect(screen.queryByText('已验收（ACCEPTED）')).toBeNull()

    await act(async () => finishRefresh())
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('等待验收（WAITING_ACCEPTANCE）')).toBeTruthy()
    expect(screen.queryByText('已验收（ACCEPTED）')).toBeNull()
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

  it('renders canonical scope and production events in append-only order without edit controls', () => {
    const scopeV2 = {
      ...approvedScope,
      version: 4,
      items: ['修订后的正式交付物'],
      approvedAt: '2026-08-29T04:00:00.000Z',
      scopeHash: 'd'.repeat(64)
    }

    const historical = review({
      approvedScope: scopeV2,
      scopeHistory: [approvedScope, scopeV2],
      events: [
        {
          state: 'APPROVED_SCOPE',
          at: '2026-08-29T04:00:00.000Z',
          actor: 'Mousai',
          note: 'scope v4 approved',
          approvedScopeVersion: 4,
          revision: null,
          revisionReason: null,
          reviewerComment: null,
          manifestVersion: null,
          acceptance: null
        },
        {
          state: 'READY_FOR_PRODUCTION',
          at: '2026-08-29T05:00:00.000Z',
          actor: 'workbuddy',
          note: 'production started',
          approvedScopeVersion: 4,
          revision: null,
          revisionReason: null,
          reviewerComment: null,
          manifestVersion: null,
          acceptance: null
        },
        {
          state: 'WAITING_ACCEPTANCE',
          at: '2026-08-29T06:00:00.000Z',
          actor: 'workbuddy',
          note: 'manifest submitted',
          approvedScopeVersion: null,
          revision: null,
          revisionReason: null,
          reviewerComment: null,
          manifestVersion: 'manifest-v4',
          acceptance: null
        },
        {
          state: 'REVISION_REQUIRED',
          at: '2026-08-29T07:00:00.000Z',
          actor: 'Mousai',
          note: null,
          approvedScopeVersion: 4,
          revision: 3,
          revisionReason: '补充审核证据',
          reviewerComment: '请按清单修订',
          manifestVersion: null,
          acceptance: null
        },
        {
          state: 'ACCEPTED',
          at: '2026-08-29T08:00:00.000Z',
          actor: 'Mousai',
          note: null,
          approvedScopeVersion: null,
          revision: null,
          revisionReason: null,
          reviewerComment: null,
          manifestVersion: null,
          acceptance: { verdict: 'PASS', reviewerComment: '最终通过' }
        }
      ]
    })

    const [item] = buildProductionReviewItems(project, [task], [deliverable], [historical])

    render(card(item))

    const history = screen.getByLabelText('Revision / Acceptance History')
    const text = history.textContent ?? ''

    expect(text).toContain('Scope v3')
    expect(text).toContain('Scope v4')
    expect(text).toContain('Manifest manifest-v4')
    expect(text).toContain('Revision r3')
    expect(text).toContain('Reason：补充审核证据')
    expect(text).toContain('Reviewer：请按清单修订')
    expect(text).toContain('Acceptance：PASS')
    expect(text.indexOf('APPROVED_SCOPE')).toBeLessThan(text.indexOf('READY_FOR_PRODUCTION'))
    expect(text.indexOf('READY_FOR_PRODUCTION')).toBeLessThan(text.indexOf('WAITING_ACCEPTANCE'))
    expect(within(history).queryByRole('button')).toBeNull()
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
