import type { RawWorkspaceReadSnapshot } from './service-workspace-read'

const SCOPE = {
  scope_id: 'scope-1',
  version: 1,
  items: ['正式交付物'],
  approved_by: 'Mousai',
  approved_at: '2026-08-29T00:00:00Z',
  scope_hash: 'b'.repeat(64)
}

export function resourceArchiveRawSnapshot(): RawWorkspaceReadSnapshot {
  return {
    workdata: {
      projectRecords: [
        {
          record_id: 'rec-project',
          fields: { 'PROJECT-ID': 'PROJECT-1', 名称: '真实项目', 类型: '教学' }
        }
      ],
      taskRecords: [
        {
          record_id: 'rec-archived',
          fields: { 'WORK-ID': 'WORK-ARCHIVED', 任务名称: '已归档任务', 所属项目: 'PROJECT-1', 状态: '已归档' }
        },
        {
          record_id: 'rec-completed',
          fields: { 'WORK-ID': 'WORK-COMPLETED', 任务名称: '已完成任务', 所属项目: 'PROJECT-1', 状态: '已完成' }
        }
      ]
    },
    manifests: [
      {
        work_id: 'WORK-COMPLETED',
        file_count: 1,
        total_size_bytes: 10,
        local_output_root: 'H:\\MousaiWork\\outbox\\WORK-COMPLETED',
        task_status: '已完成',
        delivered_files: [{ relative_path: 'final.pdf', sha256: 'a'.repeat(64) }],
        files: [
          {
            filename: 'final.pdf',
            relative_path: 'final.pdf',
            extension: '.pdf',
            size_bytes: 10,
            sha256: 'a'.repeat(64),
            modified_at: '2026-08-29T02:00:00Z'
          }
        ]
      }
    ],
    productionReviews: [
      {
        work_id: 'WORK-COMPLETED',
        gate_state: 'ACCEPTED',
        missing_information: [],
        approved_scope: SCOPE,
        scope_history: [SCOPE],
        revision: 1,
        manifest_version: 'manifest-v1',
        acceptance: { verdict: 'PASS', reviewer_comment: '通过' },
        events: [
          { state: 'READY_FOR_PRODUCTION', at: '2026-08-29T01:00:00Z', actor: 'workbuddy' },
          { state: 'ACCEPTED', at: '2026-08-29T03:00:00Z', actor: 'Mousai' }
        ]
      }
    ],
    loadedAt: '2026-08-29T04:00:00Z'
  }
}
