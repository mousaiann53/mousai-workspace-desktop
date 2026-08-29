import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Dashboard } from './dashboard'
import type { RawWorkspaceReadSnapshot, WorkspaceReadTransport } from './service-workspace-read'

function task(id: string, title: string, status: string): unknown {
  return {
    record_id: `rec-${id}`,
    fields: {
      'WORK-ID': id,
      任务名称: title,
      状态: status
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

function renderDashboard(snapshot: RawWorkspaceReadSnapshot) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  return render(
    <QueryClientProvider client={client}>
      <Dashboard gatewayState="open" transport={transport(snapshot)} />
    </QueryClientProvider>
  )
}

describe('Workspace Dashboard', () => {
  afterEach(() => cleanup())

  it('renders only canonical snapshot facts across the operational sections', async () => {
    renderDashboard({
      workdata: {
        projectRecords: [],
        taskRecords: [
          task('WORK-REVIEW', '等待审阅任务', '待验收'),
          task('WORK-MISSING', '缺资料任务', '资料缺失'),
          task('WORK-DECISION', '待决策任务', '需要决策'),
          task('WORK-PRODUCING', '生产中任务', '本机处理中'),
          task('WORK-EMPTY', '无 DDL 普通任务', '已分类')
        ]
      },
      loadedAt: '2026-08-29T01:00:00Z'
    })

    expect(await screen.findByText('等待审阅任务')).toBeTruthy()
    expect(screen.getByText('缺资料任务')).toBeTruthy()
    expect(screen.getByText('待决策任务')).toBeTruthy()
    expect(screen.getByText('生产中任务')).toBeTruthy()
    expect(screen.queryByText('无 DDL 普通任务')).toBeNull()
    expect(screen.getByText('今日任务')).toBeTruthy()
    expect(screen.getByText('近期 DDL')).toBeTruthy()
    expect(screen.getByText('等待 Mousai 审阅')).toBeTruthy()
    expect(screen.getAllByText('资料缺失').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('需要决策').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('正在生产')).toBeTruthy()
    expect(screen.getByText('最近交付')).toBeTruthy()
    expect(screen.getAllByText('暂无真实数据').length).toBeGreaterThan(0)
    expect(screen.queryByText(/Demo|示例项目/)).toBeNull()
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
