import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectDetail } from './project-detail'
import type { WorkspaceProductionActionTransport } from './service-production-actions'
import { WorkspaceTaskMutationError, type WorkspaceTaskMutationTransport } from './service-task-mutation'
import type { RawWorkspaceReadSnapshot, WorkspaceReadTransport } from './service-workspace-read'
import type { WorkspaceFocusPanel } from './workspace-links'

function snapshot(taskOverrides: Record<string, unknown> = {}): RawWorkspaceReadSnapshot {
  return {
    workdata: {
      projectRecords: [
        {
          record_id: 'rec-project',
          fields: { 'PROJECT-ID': 'PROJECT-001', 名称: '历史建筑活化利用', 类型: '教学' }
        }
      ],
      taskRecords: [
        {
          record_id: 'rec-task-1',
          revision: 'a'.repeat(64),
          fields: {
            'WORK-ID': 'WORK-001',
            任务名称: 'Phase 1C Base 闭环测试',
            所属项目: '历史建筑活化利用',
            状态: '待验收',
            优先级: '普通',
            需要人工验收: true,
            ...taskOverrides
          }
        },
        {
          record_id: 'rec-task-2',
          revision: 'b'.repeat(64),
          fields: {
            'WORK-ID': 'WORK-002',
            任务名称: '整理第一次课资料',
            所属项目: 'PROJECT-001',
            状态: '收件箱'
          }
        },
        {
          record_id: 'rec-task-other',
          revision: 'c'.repeat(64),
          fields: {
            'WORK-ID': 'WORK-OTHER',
            任务名称: '不相关任务',
            所属项目: '其他项目',
            状态: '收件箱'
          }
        }
      ]
    },
    loadedAt: '2026-08-29T01:00:00Z'
  }
}

function transport(read = vi.fn(async () => snapshot())): WorkspaceReadTransport {
  return { scope: 'project-detail-test', readSnapshot: read }
}

type ProjectMutationTransport = WorkspaceTaskMutationTransport & WorkspaceProductionActionTransport

function mutationTransport(overrides: Partial<ProjectMutationTransport> = {}): ProjectMutationTransport {
  const result = (action: 'complete' | 'defer' | 'edit') => ({
    workId: 'WORK-001',
    action,
    success: true as const,
    idempotent: false,
    newRevision: 'd'.repeat(64),
    changed: {}
  })

  return {
    scope: 'mutation-test',
    editTask: vi.fn(async () => result('edit')),
    deferTask: vi.fn(async () => result('defer')),
    completeTask: vi.fn(async () => result('complete')),
    createTask: vi.fn(async () => ({ ...result('edit'), action: 'create' as const })),
    prepareProduction: vi.fn<WorkspaceProductionActionTransport['prepareProduction']>(),
    approveProductionScope: vi.fn<WorkspaceProductionActionTransport['approveProductionScope']>(),
    startProduction: vi.fn<WorkspaceProductionActionTransport['startProduction']>(),
    requestProductionRevision: vi.fn<WorkspaceProductionActionTransport['requestProductionRevision']>(),
    acceptProduction: vi.fn<WorkspaceProductionActionTransport['acceptProduction']>(),
    ...overrides
  }
}

function renderDetail(
  source = transport(),
  gatewayState = 'open',
  mutations = mutationTransport(),
  focus: { readonly panel: WorkspaceFocusPanel; readonly workId: string } | null = null
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onBack = vi.fn()
  const onClearFocus = vi.fn()
  const onNavigateFocus = vi.fn()

  const rendered = render(
    <QueryClientProvider client={client}>
      <ProjectDetail
        focusPanel={focus?.panel}
        focusWorkId={focus?.workId}
        gatewayState={gatewayState}
        localAccess={{ revealOutbox: vi.fn(async () => true) }}
        mutationTransport={mutations}
        onBack={onBack}
        onClearFocus={onClearFocus}
        onNavigateFocus={onNavigateFocus}
        projectId="PROJECT-001"
        transport={source}
      />
    </QueryClientProvider>
  )

  return { ...rendered, client, mutations, onBack, onClearFocus, onNavigateFocus }
}

describe('ProjectDetail', () => {
  afterEach(() => cleanup())

  it('opens the real sparse project and shows only its related tasks', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { name: '历史建筑活化利用' })).toBeTruthy()
    expect(screen.getAllByText('Phase 1C Base 闭环测试').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('整理第一次课资料').length).toBeGreaterThanOrEqual(2)
    expect(screen.queryByText('不相关任务')).toBeNull()
    expect(screen.getAllByText('未设置').length).toBeGreaterThanOrEqual(6)
    expect(screen.getAllByText('暂无正式数据')).toHaveLength(4)
    expect(screen.queryByText(/32|48|40%|60%|泰特现代|首钢园|陶溪川/)).toBeNull()
  })

  it('opens, switches and closes the controlled task inspector while preserving the project', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: '历史建筑活化利用' })

    fireEvent.click(screen.getByRole('button', { name: /Phase 1C Base 闭环测试/ }))
    expect(await screen.findByText('WORK-001 · 受控任务事实')).toBeTruthy()
    expect(screen.getAllByText('是').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '延期' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '完成' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /新建|搁置|删除|重新执行/ })).toBeNull()
    expect((screen.getByRole('button', { name: '归档' }) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('任务名称'), { target: { value: '未保存草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByLabelText('任务名称')).toBeNull()
    expect(screen.getAllByText('Phase 1C Base 闭环测试').length).toBeGreaterThanOrEqual(1)

    fireEvent.click(screen.getByRole('button', { name: 'WORK-002' }))
    expect(await screen.findByText('WORK-002 · 受控任务事实')).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('WORK-002 · 受控任务事实')).toBeNull())
    expect(screen.getByRole('heading', { name: '历史建筑活化利用' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /整理第一次课资料/ }))
    expect(await screen.findByText('WORK-002 · 受控任务事实')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /关闭|Close/ }))
    await waitFor(() => expect(screen.queryByText('WORK-002 · 受控任务事实')).toBeNull())
  })

  it('restores a task deep link on mount and remount without redirecting home', async () => {
    const first = renderDetail(transport(), 'open', mutationTransport(), { panel: 'task', workId: 'WORK-002' })

    expect(await screen.findByText('WORK-002 · 受控任务事实')).toBeTruthy()
    expect(first.onBack).not.toHaveBeenCalled()
    first.unmount()

    const second = renderDetail(transport(), 'open', mutationTransport(), { panel: 'task', workId: 'WORK-002' })

    expect(await screen.findByText('WORK-002 · 受控任务事实')).toBeTruthy()
    expect(second.onBack).not.toHaveBeenCalled()
  })

  it('shows a real not-found state for an unknown deep-link target', async () => {
    const result = renderDetail(transport(), 'open', mutationTransport(), {
      panel: 'deliverable',
      workId: 'WORK-MISSING'
    })

    expect(await screen.findByText('目标任务 / 交付物不存在')).toBeTruthy()
    expect(screen.getByText(/没有跳回首页/)).toBeTruthy()
    expect(result.onBack).not.toHaveBeenCalled()
  })

  it('navigates from a production card to history and skill evidence with stable IDs', async () => {
    const result = renderDetail(transport(), 'open', mutationTransport(), {
      panel: 'deliverable',
      workId: 'WORK-001'
    })

    await screen.findByRole('heading', { name: '历史建筑活化利用' })
    fireEvent.click(screen.getAllByRole('button', { name: '生产历史' })[0])
    expect(result.onNavigateFocus).toHaveBeenCalledWith('WORK-001', 'history')
    fireEvent.click(screen.getAllByRole('button', { name: 'Skill evidence' })[0])
    expect(result.onNavigateFocus).toHaveBeenCalledWith('WORK-001', 'skill')
  })

  it('navigates from the task inspector to its canonical deliverable', async () => {
    const raw = snapshot()

    const source = transport(
      vi.fn(async () => ({
        ...raw,
        manifests: [
          {
            work_id: 'WORK-001',
            file_count: 1,
            total_size_bytes: 10,
            local_output_root: 'H:\\MousaiWork\\outbox\\WORK-001',
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
        ]
      }))
    )

    const result = renderDetail(source)

    await screen.findByRole('heading', { name: '历史建筑活化利用' })
    fireEvent.click(screen.getByRole('button', { name: /Phase 1C Base 闭环测试/ }))
    fireEvent.click(await screen.findByRole('button', { name: '查看交付物' }))
    expect(result.onNavigateFocus).toHaveBeenCalledWith('WORK-001', 'deliverable')
  })

  it('waits on disconnect and refetches after reconnect', async () => {
    const read = vi.fn(async () => snapshot())
    const source = transport(read)
    const { rerender, client, onBack } = renderDetail(source, 'connecting')

    expect(screen.getByText('等待 Gateway 连接')).toBeTruthy()
    expect(read).not.toHaveBeenCalled()

    rerender(
      <QueryClientProvider client={client}>
        <ProjectDetail
          gatewayState="open"
          localAccess={{ revealOutbox: vi.fn(async () => true) }}
          mutationTransport={mutationTransport()}
          onBack={onBack}
          projectId="PROJECT-001"
          transport={source}
        />
      </QueryClientProvider>
    )
    expect(await screen.findByRole('heading', { name: '历史建筑活化利用' })).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('offers a bounded retry after a read error', async () => {
    const read = vi
      .fn<() => Promise<RawWorkspaceReadSnapshot>>()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(snapshot())

    renderDetail(transport(read))
    expect(await screen.findByText('项目详情读取失败')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '历史建筑活化利用' })).toBeTruthy()
  })

  it('submits an edit without optimistic facts and refetches the authoritative snapshot', async () => {
    let resolveEdit!: (value: Awaited<ReturnType<WorkspaceTaskMutationTransport['editTask']>>) => void

    const editTask = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<WorkspaceTaskMutationTransport['editTask']>>>(resolve => (resolveEdit = resolve))
    )

    const read = vi
      .fn<() => Promise<RawWorkspaceReadSnapshot>>()
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValue(snapshot({ 下一步: '核对正式来源' }))

    renderDetail(transport(read), 'open', mutationTransport({ editTask }))
    await screen.findByRole('heading', { name: '历史建筑活化利用' })
    fireEvent.click(screen.getByRole('button', { name: /Phase 1C Base 闭环测试/ }))
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('下一步行动'), { target: { value: '核对正式来源' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(screen.getByText('提交中')).toBeTruthy()
    expect(screen.getAllByText('核对正式来源')).toHaveLength(1)
    resolveEdit({
      workId: 'WORK-001',
      action: 'edit',
      success: true,
      idempotent: false,
      newRevision: 'd'.repeat(64),
      changed: { nextAction: '核对正式来源' }
    })
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getAllByText('核对正式来源').length).toBeGreaterThanOrEqual(1))
    expect(editTask).toHaveBeenCalledWith(
      'WORK-001',
      expect.objectContaining({
        expectedRevision: 'a'.repeat(64),
        changes: { nextAction: '核对正式来源' }
      })
    )
  })

  it('keeps the inspector form open on 409, reports conflict and refetches', async () => {
    const read = vi.fn(async () => snapshot())

    const editTask = vi.fn(async () => {
      throw new WorkspaceTaskMutationError('409 conflict', 409, 'revision_conflict')
    })

    renderDetail(transport(read), 'open', mutationTransport({ editTask }))
    await screen.findByRole('heading', { name: '历史建筑活化利用' })
    fireEvent.click(screen.getByRole('button', { name: /Phase 1C Base 闭环测试/ }))
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('下一步行动'), { target: { value: '冲突后的输入仍保留' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect((await screen.findByRole('alert')).textContent).toContain('任务数据已变化')
    expect((screen.getByLabelText('下一步行动') as HTMLTextAreaElement).value).toBe('冲突后的输入仍保留')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('keeps the authoritative snapshot and draft after a non-conflict mutation error', async () => {
    const read = vi.fn(async () => snapshot())

    const editTask = vi.fn(async () => {
      throw new WorkspaceTaskMutationError('sanitized failure', 502, 'mutation_failed')
    })

    renderDetail(transport(read), 'open', mutationTransport({ editTask }))
    await screen.findByRole('heading', { name: '历史建筑活化利用' })
    fireEvent.click(screen.getByRole('button', { name: /Phase 1C Base 闭环测试/ }))
    fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
    fireEvent.change(screen.getByLabelText('下一步行动'), { target: { value: '失败后保留的草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect((await screen.findByRole('alert')).textContent).toContain('任务更新失败')
    expect((screen.getByLabelText('下一步行动') as HTMLTextAreaElement).value).toBe('失败后保留的草稿')
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('requires an explicit defer date and refetches after success', async () => {
    const deferTask = vi.fn(async () => ({
      workId: 'WORK-001',
      action: 'defer' as const,
      success: true as const,
      idempotent: false,
      newRevision: 'd'.repeat(64),
      changed: { deadline: '2026-09-10' }
    }))

    const read = vi.fn(async () => snapshot())
    renderDetail(transport(read), 'open', mutationTransport({ deferTask }))
    await screen.findByRole('heading', { name: '历史建筑活化利用' })
    fireEvent.click(screen.getByRole('button', { name: /Phase 1C Base 闭环测试/ }))
    fireEvent.click(await screen.findByRole('button', { name: '延期' }))
    expect((screen.getByRole('button', { name: '确认延期' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('明确的新 DDL'), { target: { value: '2026-09-10' } })
    fireEvent.click(screen.getByRole('button', { name: '确认延期' }))
    await waitFor(() => expect(deferTask).toHaveBeenCalledTimes(1))
    expect(deferTask).toHaveBeenCalledWith(
      'WORK-001',
      expect.objectContaining({ deadline: '2026-09-10', expectedRevision: 'a'.repeat(64) })
    )
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  })

  it('confirms human final completion through the Workspace mutation door', async () => {
    const completeTask = vi.fn(async () => ({
      workId: 'WORK-001',
      action: 'complete' as const,
      success: true as const,
      idempotent: false,
      newRevision: 'd'.repeat(64),
      changed: { status: '已完成' }
    }))

    renderDetail(transport(), 'open', mutationTransport({ completeTask }))
    await screen.findByRole('heading', { name: '历史建筑活化利用' })
    fireEvent.click(screen.getByRole('button', { name: /Phase 1C Base 闭环测试/ }))
    fireEvent.click(await screen.findByRole('button', { name: '完成' }))
    expect(screen.getByText(/不会调用 WorkBridge worker-complete/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认完成' }))
    await waitFor(() => expect(completeTask).toHaveBeenCalledTimes(1))
    expect(completeTask).toHaveBeenCalledWith('WORK-001', expect.objectContaining({ expectedRevision: 'a'.repeat(64) }))
  })

  it('disables all mutation actions for WorkBridge-active tasks', async () => {
    renderDetail(transport(vi.fn(async () => snapshot({ 状态: '已领取' }))))
    await screen.findByRole('heading', { name: '历史建筑活化利用' })
    fireEvent.click(screen.getByRole('button', { name: /Phase 1C Base 闭环测试/ }))
    expect(await screen.findByText(/WorkBridge 执行/)).toBeTruthy()
    expect((screen.getByRole('button', { name: '编辑' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '延期' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '完成' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
