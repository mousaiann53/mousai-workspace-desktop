import { describe, expect, it } from 'vitest'

import { adaptManifest } from './adapter-manifest'
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
      status: 'inbox'
    })
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
          loadedAt: '2026-08-28T01:00:00Z'
        }
      }
    })

    expect(result.snapshot.tasks).toHaveLength(2)
    expect(result.snapshot.tasks.find(task => task.id === 'WORK-001')?.title).toBe('整理第一次课资料')
    expect(result.snapshot.tasks.find(task => task.id === 'WORK-002')?.status).toBe('waiting_local')
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
