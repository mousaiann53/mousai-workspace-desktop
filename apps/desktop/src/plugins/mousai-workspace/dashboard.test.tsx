import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Dashboard } from './dashboard'
import type { RawWorkspaceReadSnapshot, WorkspaceReadTransport } from './service-workspace-read'

function task(id: string, title: string, status: string): unknown {
  return {
    record_id: `rec-${id}`,
    fields: {
      'WORK-ID': id,
      任务名称: title,
      状态: status,
      所属项目: 'PROJECT-1'
    }
  }
}

function transport(snapshot: RawWorkspaceReadSnapshot): WorkspaceReadTransport {
  return {
    scope: 'dashboard-test',
    async readSnapshot() {
      return snapshot
    }
  }
}

function renderDashboard(snapshot: RawWorkspaceReadSnapshot, onOpenItem = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return {
    ...render(
      <QueryClientProvider client={client}>
        <Dashboard gatewayState="open" onOpenItem={onOpenItem} transport={transport(snapshot)} />
      </QueryClientProvider>
    ),
    onOpenItem
  }
}

describe('Workspace Dashboard', () => {
  afterEach(() => cleanup())

  it('renders only canonical snapshot facts across the operational sections', async () => {
    const result = renderDashboard({
      workdata: {
        projectRecords: [
          {
            record_id: 'rec-project-1',
            fields: { 'PROJECT-ID': 'PROJECT-1', 名称: '真实项目', 类型: '教学' }
          }
        ],
        taskRecords: [
          task('WORK-REVIEW', '等待审阅任务', '待验收'),
          task('WORK-MISSING', '缺资料任务', '资料缺失'),
          task('WORK-DECISION', '待决策任务', '需要决策'),
          task('WORK-PRODUCING', '生产中任务', '本机处理中'),
          task('WORK-WAITING', '等待本机任务', '等待本机'),
          task('WORK-COMPLETED', '最近完成任务', '已完成'),
          task('WORK-EMPTY', '无 DDL 普通任务', '已分类')
        ]
      },
      loadedAt: '2026-08-29T01:00:00Z'
    })

    expect(await screen.findByText('等待审阅任务')).toBeTruthy()
    expect(screen.getByText('缺资料任务')).toBeTruthy()
    expect(screen.getByText('待决策任务')).toBeTruthy()
    expect(screen.getByText('生产中任务')).toBeTruthy()
    expect(screen.getByText('等待本机任务')).toBeTruthy()
    expect(screen.getByText('最近完成任务')).toBeTruthy()
    expect(screen.queryByText('无 DDL 普通任务')).toBeNull()
    expect(screen.getByText('今日任务')).toBeTruthy()
    expect(screen.getByText('近期 DDL')).toBeTruthy()
    expect(screen.getByText('等待 Mousai 审阅')).toBeTruthy()
    expect(screen.getAllByText('资料缺失').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('需要决策').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('等待本机').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('正在处理')).toBeTruthy()
    expect(screen.getByText('最近交付')).toBeTruthy()
    expect(screen.getByText('最近完成')).toBeTruthy()
    expect(screen.getAllByText('暂无真实数据').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Demo|示例项目/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '打开任务：生产中任务' }))
    expect(result.onOpenItem).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'PROJECT-1' }), 'task')
  })

  it('waits for the gateway without reading or showing stale facts', () => {
    const source = transport({ workdata: { projectRecords: [], taskRecords: [] } })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <Dashboard gatewayState="connecting" transport={source} />
      </QueryClientProvider>
    )

    expect(screen.getByText('等待 Gateway 连接')).toBeTruthy()
  })
})
