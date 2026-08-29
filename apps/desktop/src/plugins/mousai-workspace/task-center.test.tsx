import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DurableTaskCreateDraft, TaskCreateDraftStore } from './service-task-create-draft'
import type { WorkspaceTaskMutationTransport } from './service-task-mutation'
import type { RawWorkspaceReadSnapshot, WorkspaceReadTransport } from './service-workspace-read'
import { TaskCenter } from './task-center'

const snapshot: RawWorkspaceReadSnapshot = {
  workdata: {
    projectRecords: [
      { record_id: 'rec-project', fields: { 'PROJECT-ID': 'PROJECT-001', 名称: '历史建筑活化利用', 类型: '教学' } }
    ],
    taskRecords: [
      {
        record_id: 'rec-task',
        revision: 'a'.repeat(64),
        fields: { 'WORK-ID': 'WORK-001', 任务名称: '收件箱任务', 状态: '收件箱', DDL: null }
      }
    ]
  },
  loadedAt: '2026-08-29T01:00:00Z'
}

describe('TaskCenter', () => {
  afterEach(() => cleanup())

  it('creates through the bounded transport, preserves the request id on failure, and refetches on success', async () => {
    const readSnapshot = vi.fn(async () => snapshot)
    let persisted: DurableTaskCreateDraft | null = null

    const draftStore: TaskCreateDraftStore = {
      clear: () => {
        persisted = null
      },
      load: () => persisted,
      save: draft => {
        persisted = draft

        return true
      }
    }

    const createTask = vi
      .fn<WorkspaceTaskMutationTransport['createTask']>()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce({
        workId: 'WORK-20260829-001',
        action: 'create',
        success: true,
        idempotent: true,
        newRevision: 'b'.repeat(64),
        changed: { title: '新任务', status: '收件箱' }
      })

    const transport: WorkspaceReadTransport & WorkspaceTaskMutationTransport = {
      scope: 'task-center-test',
      readSnapshot,
      createTask,
      editTask: vi.fn(),
      deferTask: vi.fn(),
      completeTask: vi.fn()
    }

    const firstClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const firstRender = render(
      <QueryClientProvider client={firstClient}>
        <TaskCenter draftStore={draftStore} gatewayState="open" transport={transport} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('收件箱任务')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /新建任务/ }))
    fireEvent.change(screen.getByLabelText('任务名称'), { target: { value: '新任务' } })
    fireEvent.click(screen.getByRole('button', { name: '创建' }))
    expect(await screen.findByText(/表单和幂等请求标识已保留/)).toBeTruthy()

    const firstRequestId = createTask.mock.calls[0][0].clientRequestId

    expect(draftStore.load()?.clientRequestId).toBe(firstRequestId)
    firstRender.unmount()

    const secondClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={secondClient}>
        <TaskCenter draftStore={draftStore} gatewayState="open" transport={transport} />
      </QueryClientProvider>
    )

    expect(await screen.findByText(/检测到未确认结果的创建请求/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '安全重试' }))

    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(2))
    expect(createTask.mock.calls[1][0].clientRequestId).toBe(firstRequestId)
    expect(createTask.mock.calls[1][0].task).toEqual(createTask.mock.calls[0][0].task)
    expect(await screen.findByText('已创建 WORK-20260829-001')).toBeTruthy()
    expect(readSnapshot.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(draftStore.load()).toBeNull()
  })
})
