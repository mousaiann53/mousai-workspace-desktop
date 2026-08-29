import { describe, expect, it } from 'vitest'

import { adaptManifest } from './adapter-manifest'
import { adaptProductionReviews } from './adapter-production-review'
import { adaptWorkBridgeJobs } from './adapter-workbridge'
import { adaptWorkDataSnapshot } from './adapter-workdata'
import { createUnavailableWorkspaceReadTransport, readWorkspaceSnapshot } from './service-workspace-read'

const SHA = 'a'.repeat(64)

function projectRecord(overrides: Record<string, unknown> = {}) {
  return {
    record_id: 'rec-project-1',
    fields: {
      'PROJECT-ID': 'PROJECT-001',
      名称: '历史建筑活化利用',
      类型: '教学',
      当前状态: '',
      当前阶段: null,
      下一步: '',
      ...overrides
    }
  }
}

function taskRecord(overrides: Record<string, unknown> = {}) {
  return {
    record_id: 'rec-task-1',
    fields: {
      'WORK-ID': 'WORK-001',
      任务名称: '整理第一次课资料',
      类型: '教学',
      所属项目: '历史建筑活化利用',
      状态: '收件箱',
      ...overrides
    }
  }
}

describe('WorkData adapter', () => {
  it('maps confirmed values and preserves absent course facts as null', () => {
    const result = adaptWorkDataSnapshot({ projectRecords: [projectRecord()], taskRecords: [taskRecord()] })
    const project = result.data.projects[0]

    expect(result.issues).toEqual([])
    expect(project).toMatchObject({
      id: 'PROJECT-001',
      name: '历史建筑活化利用',
      type: 'teaching',
      typeLabel: '教学',
      status: null,
      stage: null,
      progress: null,
      nextDeadline: null,
      risk: null
    })
    expect(Object.values(project.courseProfile).every(value => value === null)).toBe(true)
    expect(JSON.stringify(project)).not.toMatch(/32|48|40%|60%|泰特现代|首钢园|陶溪川/)
    expect(result.data.tasks[0]).toMatchObject({
      id: 'WORK-001',
      projectRef: '历史建筑活化利用',
      status: 'inbox',
      workBridgeState: 'not_applicable',
      estimate: null,
      executor: null
    })
  })

  it('keeps unknown enums and invalid dates safe', () => {
    const result = adaptWorkDataSnapshot({
      projectRecords: [projectRecord({ 类型: '自定义类型', 更新时间: 'not-a-date' })],
      taskRecords: [taskRecord({ 状态: '未来状态', DDL: 'not-a-date' })]
    })

    expect(result.data.projects[0]).toMatchObject({ type: 'other', typeLabel: '自定义类型', updatedAt: null })
    expect(result.data.tasks[0]).toMatchObject({
      status: 'unknown',
      statusLabel: '未来状态',
      deadline: null,
      workBridgeState: 'unknown'
    })
    expect(result.issues.map(item => item.message)).toEqual(['Unknown task status: 未来状态', 'Task DDL is invalid.'])
  })

  it('maps the sixteen course fields only when the source supplies them', () => {
    const result = adaptWorkDataSnapshot({
      projectRecords: [
        projectRecord({
          授课对象: '建筑学本科生',
          年级: '三年级',
          专业背景: '建筑设计基础',
          总学时: 48,
          教学周数: '16',
          周课时: 3,
          考核方式: '课程设计',
          考核比例: '平时40%，期末60%',
          指定教材: '已确认教材',
          参考书目: '已确认书目',
          偏好案例: '已确认案例',
          本地案例: '已确认本地案例',
          '实践基地 / 期末选址': '已确认基地',
          教案模板链接: { link: 'https://example.test/lesson' },
          PPT模板链接: { url: 'https://example.test/slides' },
          课程资料根链接: 'https://example.test/root'
        })
      ],
      taskRecords: []
    })

    expect(result.data.projects[0].courseProfile).toEqual({
      audience: '建筑学本科生',
      grade: '三年级',
      professionalBackground: '建筑设计基础',
      totalHours: 48,
      teachingWeeks: 16,
      weeklyHours: 3,
      assessmentMethod: '课程设计',
      assessmentRatio: '平时40%，期末60%',
      requiredTextbook: '已确认教材',
      referenceBooks: '已确认书目',
      preferredCases: '已确认案例',
      localCases: '已确认本地案例',
      practiceBaseOrFinalSite: '已确认基地',
      lessonPlanTemplateUrl: 'https://example.test/lesson',
      slideTemplateUrl: 'https://example.test/slides',
      courseMaterialRootUrl: 'https://example.test/root'
    })
  })

  it('rejects invalid and duplicate IDs instead of silently merging them', () => {
    const result = adaptWorkDataSnapshot({
      projectRecords: [projectRecord(), projectRecord({ 名称: '重复项目' }), projectRecord({ 'PROJECT-ID': '' }), 42],
      taskRecords: [taskRecord(), taskRecord({ 任务名称: '重复任务' }), taskRecord({ 'WORK-ID': '' })]
    })

    expect(result.data.projects).toHaveLength(1)
    expect(result.data.tasks).toHaveLength(1)
    expect(result.issues.map(item => item.code)).toEqual([
      'duplicate_id',
      'missing_id',
      'invalid_record',
      'duplicate_id',
      'missing_id'
    ])
  })
})

describe('WorkBridge and Manifest adapters', () => {
  it('maps the current WorkBridge job projection without assuming missing fields', () => {
    const result = adaptWorkBridgeJobs({
      jobs: [
        {
          work_id: 'WORK-20260827-004',
          title: 'Phase 3 全链测试',
          task_type: '行政',
          project: '历史建筑活化利用',
          status: '待验收',
          next_step: '等待人工验收',
          requires_human_approval: true
        }
      ]
    })

    expect(result.issues).toEqual([])
    expect(result.data[0]).toMatchObject({
      id: 'WORK-20260827-004',
      status: 'review',
      workBridgeState: 'review',
      priority: 'unset',
      deadline: null,
      projectRef: '历史建筑活化利用'
    })
  })

  it('maps valid Manifest metadata and rejects traversal or duplicate paths', () => {
    const valid = adaptManifest({
      work_id: 'WORK-001',
      generated_at: '2026-08-28T01:00:00Z',
      file_count: 1,
      total_size_bytes: 12,
      local_output_root: 'H:\\MousaiWork\\outbox\\WORK-001',
      task_status: '待验收',
      delivered_files: [{ relative_path: 'deliverables/test.pdf', sha256: SHA }],
      files: [
        {
          filename: 'test.pdf',
          relative_path: 'deliverables/test.pdf',
          extension: '.pdf',
          size_bytes: 12,
          sha256: SHA,
          modified_at: '2026-08-28T01:00:00Z'
        }
      ]
    })

    expect(valid.issues).toEqual([])
    expect(valid.data[0]).toMatchObject({
      workId: 'WORK-001',
      filename: 'test.pdf',
      name: 'test.pdf',
      format: '.pdf',
      taskId: 'WORK-001',
      projectId: null,
      submissionState: 'submitted',
      deliveryState: 'delivered',
      reviewState: 'pending',
      sizeBytes: 12,
      sha256: SHA
    })

    const invalid = adaptManifest({
      work_id: 'WORK-001',
      files: [
        {
          filename: 'test.pdf',
          relative_path: '../test.pdf',
          extension: '.pdf',
          size_bytes: 12,
          sha256: SHA,
          modified_at: '2026-08-28T01:00:00Z'
        }
      ]
    })

    expect(invalid.data).toEqual([])
    expect(invalid.issues[0].code).toBe('invalid_field')
  })
})

describe('Production Review adapter', () => {
  const scope = {
    scope_id: 'scope-001',
    version: 3,
    items: ['正式交付物'],
    approved_by: 'Mousai',
    approved_at: '2026-08-29T01:00:00Z',
    scope_hash: 'c'.repeat(64)
  }

  it('adapts the canonical OpenAPI 1.6 ProductionReadModel without requiring an authority field', () => {
    const result = adaptProductionReviews([
      {
        work_id: 'WORK-001',
        gate_state: 'READY_FOR_PRODUCTION',
        missing_information: [],
        decision_required: false,
        approved_scope: scope,
        scope_history: [scope],
        revision: 2,
        manifest_version: 'manifest-v3',
        acceptance: null,
        bundle_meta: {
          missing_information: [],
          decision_required: false,
          input_sources: ['source-001'],
          output_requirements: { formats: ['pdf'] },
          acceptance: ['人工验收'],
          revision: 2,
          revision_reason: '人工批准范围'
        },
        events: [
          {
            state: 'APPROVED_SCOPE',
            at: '2026-08-29T01:00:00Z',
            actor: 'Mousai',
            approved_scope_version: 3
          }
        ]
      }
    ])

    expect(result.issues).toEqual([])
    expect(result.data[0]).toMatchObject({
      workId: 'WORK-001',
      authority: 'workbridge',
      gateState: 'READY_FOR_PRODUCTION',
      missingInformation: [],
      decisionRequired: false,
      approvedScope: { version: 3 },
      revision: 2,
      manifestVersion: 'manifest-v3',
      source: { system: 'workbridge', recordId: 'WORK-001' }
    })
    expect(result.data[0].scopeHistory).toHaveLength(1)
    expect(result.data[0].events[0]).toMatchObject({
      state: 'APPROVED_SCOPE',
      actor: 'Mousai',
      approvedScopeVersion: 3,
      acceptance: null
    })
  })

  it.each([
    'INPUT_REQUIRED',
    'MATERIAL_MISSING',
    'DECISION_REQUIRED',
    'WAITING_HUMAN_APPROVAL',
    'APPROVED_SCOPE',
    'READY_FOR_PRODUCTION',
    'REVISION_REQUIRED',
    'DELIVERED',
    'WAITING_ACCEPTANCE',
    'ACCEPTED'
  ])('preserves the canonical %s gate state', gateState => {
    const needsScope = !['INPUT_REQUIRED', 'MATERIAL_MISSING', 'DECISION_REQUIRED', 'WAITING_HUMAN_APPROVAL'].includes(
      gateState
    )

    const result = adaptProductionReviews([
      {
        work_id: `WORK-${gateState}`,
        gate_state: gateState,
        missing_information: [],
        approved_scope: needsScope ? scope : null,
        scope_history: needsScope ? [scope] : [],
        acceptance: gateState === 'ACCEPTED' ? { verdict: '通过' } : null,
        events: []
      }
    ])

    expect(result.issues).toEqual([])
    expect(result.data[0].gateState).toBe(gateState)
  })

  it('preserves acceptance metadata inside the canonical append-only event chain', () => {
    const result = adaptProductionReviews([
      {
        work_id: 'WORK-ACCEPTED-HISTORY',
        gate_state: 'ACCEPTED',
        missing_information: [],
        approved_scope: scope,
        scope_history: [scope],
        acceptance: { verdict: 'PASS', comment: '最终通过' },
        events: [
          {
            state: 'ACCEPTED',
            at: '2026-08-29T08:00:00Z',
            actor: 'Mousai',
            acceptance: { verdict: 'PASS', comment: '最终通过' }
          }
        ]
      }
    ])

    expect(result.issues).toEqual([])
    expect(result.data[0].events[0].acceptance).toEqual({ verdict: 'PASS', reviewerComment: '最终通过' })
  })

  it('fails closed when a ready record has no approved_scope and drops duplicate work models', () => {
    const withoutScope = adaptProductionReviews([
      {
        work_id: 'WORK-001',
        gate_state: 'READY_FOR_PRODUCTION',
        missing_information: [],
        approved_scope: null,
        scope_history: [],
        events: []
      }
    ])

    expect(withoutScope.data).toEqual([])
    expect(withoutScope.issues[0].message).toContain('has no canonical approved_scope')

    const ambiguous = adaptProductionReviews([
      {
        work_id: 'WORK-001',
        gate_state: 'INPUT_REQUIRED',
        missing_information: [],
        scope_history: [],
        events: []
      },
      {
        work_id: 'WORK-001',
        gate_state: 'MATERIAL_MISSING',
        missing_information: ['正式资料'],
        scope_history: [],
        events: []
      }
    ])

    expect(ambiguous.data).toEqual([])
    expect(ambiguous.issues.map(item => item.code)).toContain('duplicate_id')
  })

  it('rejects the superseded temporary review field shape', () => {
    const result = adaptProductionReviews([
      {
        review_id: 'legacy-review',
        work_id: 'WORK-001',
        authority: 'control',
        gate_status: 'ready_for_production',
        scope_approved: true,
        approved_scope_version: 'scope-v1'
      }
    ])

    expect(result.data).toEqual([])
    expect(result.issues[0]).toMatchObject({
      source: 'workbridge',
      code: 'invalid_record',
      recordId: 'WORK-001'
    })
  })
})

describe('Workspace read boundary', () => {
  it('uses WorkData as the task authority and adds only missing WorkBridge jobs', async () => {
    const result = await readWorkspaceSnapshot({
      scope: 'test',
      async readSnapshot() {
        return {
          workdata: { projectRecords: [projectRecord()], taskRecords: [taskRecord()] },
          workbridgeJobs: {
            jobs: [
              {
                work_id: 'WORK-001',
                title: 'WorkBridge duplicate',
                status: '待验收'
              },
              {
                work_id: 'WORK-002',
                title: 'WorkBridge-only job',
                status: '等待本机'
              }
            ]
          },
          productionReviews: [
            {
              work_id: 'WORK-001',
              gate_state: 'WAITING_ACCEPTANCE',
              missing_information: [],
              decision_required: false,
              approved_scope: {
                scope_id: 'scope-001',
                version: 1,
                items: ['正式交付物'],
                approved_by: 'Mousai',
                approved_at: '2026-08-28T00:00:00Z',
                scope_hash: 'd'.repeat(64)
              },
              scope_history: [
                {
                  scope_id: 'scope-001',
                  version: 1,
                  items: ['正式交付物'],
                  approved_by: 'Mousai',
                  approved_at: '2026-08-28T00:00:00Z',
                  scope_hash: 'd'.repeat(64)
                }
              ],
              events: []
            }
          ],
          loadedAt: '2026-08-28T01:00:00Z'
        }
      }
    })

    expect(result.snapshot.tasks).toHaveLength(2)
    expect(result.snapshot.tasks.find(task => task.id === 'WORK-001')?.title).toBe('整理第一次课资料')
    expect(result.snapshot.tasks.find(task => task.id === 'WORK-002')?.status).toBe('waiting_local')
    expect(result.snapshot.productionReviews[0]).toMatchObject({
      workId: 'WORK-001',
      authority: 'workbridge',
      gateState: 'WAITING_ACCEPTANCE'
    })
    expect(result.snapshot.loadedAt).toBe('2026-08-28T01:00:00.000Z')
  })

  it('fails closed when no host-mediated safe transport exists', async () => {
    const transport = createUnavailableWorkspaceReadTransport()

    expect(Object.keys(transport).sort()).toEqual(['readSnapshot', 'scope'])
    await expect(readWorkspaceSnapshot(transport)).rejects.toMatchObject({
      code: 'safe_read_transport_unavailable'
    })
  })
})
