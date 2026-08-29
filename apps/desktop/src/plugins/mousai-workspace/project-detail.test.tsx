import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectDetail } from './project-detail'
import type { RawWorkspaceReadSnapshot, WorkspaceReadTransport } from './service-workspace-read'

function snapshot(): RawWorkspaceReadSnapshot {
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
          fields: {
            'WORK-ID': 'WORK-001',
            任务名称: 'Phase 1C Base 闭环测试',
            所属项目: '历史建筑活化利用',
            状态: '待验收',
            优先级: '普通',
            需要人工验收: true
          }
        },
        {
          record_id: 'rec-task-2',
          fields: {
            'WORK-ID': 'WORK-002',
            任务名称: '整理第一次课资料',
            所属项目: 'PROJECT-001',
            状态: '收件箱'
          }
        },
        {
          record_id: 'rec-task-other',
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

function renderDetail(source = transport(), gatewayState = 'open') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onBack = vi.fn()

  const rendered = render(
    <QueryClientProvider client={client}>
      <ProjectDetail gatewayState={gatewayState} onBack={onBack} projectId="PROJECT-001" transport={source} />
    </QueryClientProvider>
  )

  return { ...rendered, client, onBack }
}

describe('ProjectDetail', () => {
  afterEach(() => cleanup())

  it('opens the real sparse project and shows only its related tasks', async () => {
    renderDetail()

    expect(await screen.findByRole('heading', { name: '历史建筑活化利用' })).toBeTruthy()
    expect(screen.getByText('Phase 1C Base 闭环测试')).toBeTruthy()
    expect(screen.getByText('整理第一次课资料')).toBeTruthy()
    expect(screen.queryByText('不相关任务')).toBeNull()
    expect(screen.getAllByText('未设置').length).toBeGreaterThanOrEqual(6)
    expect(screen.getAllByText('暂无正式数据')).toHaveLength(4)
    expect(screen.queryByText(/32|48|40%|60%|泰特现代|首钢园|陶溪川/)).toBeNull()
  })

  it('opens, switches and closes the read-only task inspector while preserving the project', async () => {
    renderDetail()
    await screen.findByRole('heading', { name: '历史建筑活化利用' })

    fireEvent.click(screen.getByRole('button', { name: /Phase 1C Base 闭环测试/ }))
    expect(await screen.findByText('WORK-001 · 只读详情')).toBeTruthy()
    expect(screen.getByText('是')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /编辑|保存|完成|延期|搁置/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'WORK-002' }))
    expect(await screen.findByText('WORK-002 · 只读详情')).toBeTruthy()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('WORK-002 · 只读详情')).toBeNull())
    expect(screen.getByRole('heading', { name: '历史建筑活化利用' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /整理第一次课资料/ }))
    expect(await screen.findByText('WORK-002 · 只读详情')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /关闭|Close/ }))
    await waitFor(() => expect(screen.queryByText('WORK-002 · 只读详情')).toBeNull())
  })

  it('waits on disconnect and refetches after reconnect', async () => {
    const read = vi.fn(async () => snapshot())
    const source = transport(read)
    const { rerender, client, onBack } = renderDetail(source, 'connecting')

    expect(screen.getByText('等待 Gateway 连接')).toBeTruthy()
    expect(read).not.toHaveBeenCalled()

    rerender(
      <QueryClientProvider client={client}>
        <ProjectDetail gatewayState="open" onBack={onBack} projectId="PROJECT-001" transport={source} />
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
})
