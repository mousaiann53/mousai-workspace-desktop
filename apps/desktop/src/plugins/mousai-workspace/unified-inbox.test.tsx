import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { adaptWorkDataSnapshot } from './adapter-workdata'
import type { WorkspaceSnapshot } from './domain'
import { UnifiedInbox } from './unified-inbox'

function snapshot(): WorkspaceSnapshot {
  const adapted = adaptWorkDataSnapshot({
    projectRecords: [{ record_id: 'project-1', fields: { 'PROJECT-ID': 'PROJECT-1', 名称: '项目一', 类型: '行政' } }],
    taskRecords: [
      {
        record_id: 'task-feishu',
        revision: 'a'.repeat(64),
        fields: {
          'WORK-ID': 'WORK-FEISHU',
          任务名称: '飞书事项',
          状态: '收件箱',
          来源: 'Feishu DM',
          所属项目: 'PROJECT-1'
        }
      },
      {
        record_id: 'task-qq',
        revision: 'b'.repeat(64),
        fields: { 'WORK-ID': 'WORK-QQ', 任务名称: 'QQ 事项', 状态: '收件箱', 来源: 'QQ 群' }
      }
    ]
  })

  return {
    projects: adapted.data.projects,
    tasks: adapted.data.tasks,
    events: [],
    deliverables: [],
    productionReviews: [],
    activities: [],
    loadedAt: '2026-08-30T00:00:00Z'
  }
}

describe('UnifiedInbox', () => {
  afterEach(() => cleanup())

  it('filters real source facts and opens task/source audit without canonical merge evidence', () => {
    const onOpenTask = vi.fn()
    const onOpenSource = vi.fn()

    render(<UnifiedInbox onOpenSource={onOpenSource} onOpenTask={onOpenTask} snapshot={snapshot()} />)

    expect(screen.getByText('飞书事项')).toBeTruthy()
    expect(screen.getByText('QQ 事项')).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: 'Feishu' }))
    expect(screen.getByText('飞书事项')).toBeTruthy()
    expect(screen.queryByText('QQ 事项')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '打开任务：飞书事项' }))
    fireEvent.click(screen.getByRole('button', { name: '来源记录' }))
    expect(onOpenTask).toHaveBeenCalledWith('WORK-FEISHU')
    expect(onOpenSource).toHaveBeenCalledWith('WORK-FEISHU')
    expect(screen.queryByRole('button', { name: '合并候选' })).toBeNull()
  })

  it('offers merge only for canonical possible evidence and refetches after success', async () => {
    const live = snapshot()

    const tasks = live.tasks.map(task => ({
      ...task,
      intakeRevision: task.id === 'WORK-FEISHU' ? 'c'.repeat(64) : 'd'.repeat(64)
    }))

    const transport = {
      mergeIntakeTasks: vi.fn().mockResolvedValue({ idempotent: false, survivorWorkId: 'WORK-FEISHU' })
    }

    const onRefresh = vi.fn().mockResolvedValue(undefined)
    render(
      <UnifiedInbox
        onRefresh={onRefresh}
        snapshot={{
          ...live,
          tasks,
          duplicateEvidence: [
            {
              workId: 'WORK-FEISHU',
              state: 'possible',
              relatedWorkIds: ['WORK-QQ'],
              evidence: [{ kind: 'manual_review', reference: '人工确认', actor: 'Mousai', occurredAt: null }],
              revision: 1
            }
          ]
        }}
        transport={transport}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '合并候选' }))
    expect(screen.getByText(/被合并项将通过既有归档动作/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('合并原因（必填）'), { target: { value: '人工确认重复' } })
    fireEvent.click(screen.getByRole('button', { name: '确认合并' }))
    await waitFor(() => expect(transport.mergeIntakeTasks).toHaveBeenCalledOnce())
    expect(transport.mergeIntakeTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        survivorWorkId: 'WORK-FEISHU',
        mergedWorkId: 'WORK-QQ',
        reason: '人工确认重复',
        expectedRevisions: { 'WORK-FEISHU': 'c'.repeat(64), 'WORK-QQ': 'd'.repeat(64) }
      })
    )
    expect(onRefresh).toHaveBeenCalledOnce()
  })
})
