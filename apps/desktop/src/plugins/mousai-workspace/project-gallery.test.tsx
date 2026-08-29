import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProjectGallery } from './project-gallery'
import type { RawWorkspaceReadSnapshot, WorkspaceReadTransport } from './service-workspace-read'
import { createUnavailableWorkspaceReadTransport } from './service-workspace-read'

function projectRecord(
  id: string,
  name: string,
  type: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    record_id: `rec-${id}`,
    fields: {
      'PROJECT-ID': id,
      名称: name,
      类型: type,
      ...extra
    }
  }
}

function snapshot(projects: readonly unknown[] = []): RawWorkspaceReadSnapshot {
  return {
    workdata: {
      projectRecords: projects,
      taskRecords: [
        {
          record_id: 'rec-work-1',
          fields: {
            'WORK-ID': 'WORK-001',
            任务名称: '整理第一次课资料',
            所属项目: '历史建筑活化利用',
            状态: '收件箱'
          }
        }
      ]
    },
    loadedAt: '2026-08-28T01:00:00Z'
  }
}

function transport(readSnapshot: () => Promise<RawWorkspaceReadSnapshot>, scope = 'test'): WorkspaceReadTransport {
  return { scope, readSnapshot }
}

function renderGallery(ui: ReactElement, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const rendered = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)

  return { ...rendered, client }
}

describe('ProjectGallery', () => {
  afterEach(() => cleanup())

  it('shows a loading state while the safe transport is pending', () => {
    const pending = new Promise<RawWorkspaceReadSnapshot>(() => undefined)

    renderGallery(<ProjectGallery gatewayState="open" transport={transport(() => pending)} />)

    expect(screen.getByLabelText('正在读取项目')).toBeTruthy()
  })

  it('reports the production transport blocker without rendering fake projects', async () => {
    renderGallery(<ProjectGallery gatewayState="open" transport={createUnavailableWorkspaceReadTransport()} />)

    expect(await screen.findByText('安全只读链路尚未接通')).toBeTruthy()
    expect(screen.getByText(/未加载或伪造任何项目/)).toBeTruthy()
    expect(screen.queryByText('历史建筑活化利用')).toBeNull()
  })

  it('renders an honest empty state', async () => {
    renderGallery(<ProjectGallery gatewayState="open" transport={transport(async () => snapshot())} />)

    expect(await screen.findByText('当前没有可显示的项目')).toBeTruthy()
    expect(screen.getByText(/不会自动创建示例项目/)).toBeTruthy()
  })

  it('groups real adapter output and displays absent facts as 未设置', async () => {
    renderGallery(
      <ProjectGallery
        gatewayState="open"
        transport={transport(async () =>
          snapshot([
            projectRecord('PROJECT-001', '历史建筑活化利用', '教学'),
            projectRecord('PROJECT-002', '研究项目', '科研', { 当前阶段: '资料整理' })
          ])
        )}
      />
    )

    expect(await screen.findByText('历史建筑活化利用')).toBeTruthy()
    expect(screen.getByText('研究项目')).toBeTruthy()
    expect(screen.getAllByText('教学').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('科研').length).toBeGreaterThanOrEqual(2)
    expect(screen.getAllByText('未设置').length).toBeGreaterThan(5)
    expect(screen.queryByText(/32|48|40%|60%|泰特现代|首钢园|陶溪川/)).toBeNull()
  })

  it('filters by query and project type without changing source data', async () => {
    renderGallery(
      <ProjectGallery
        gatewayState="open"
        transport={transport(async () =>
          snapshot([
            projectRecord('PROJECT-001', '历史建筑活化利用', '教学'),
            projectRecord('PROJECT-002', '研究项目', '科研', { 当前阶段: '资料整理' })
          ])
        )}
      />
    )

    await screen.findByText('历史建筑活化利用')
    fireEvent.change(screen.getByPlaceholderText('搜索名称、阶段或下一步'), { target: { value: '资料整理' } })
    expect(screen.queryByText('历史建筑活化利用')).toBeNull()
    expect(screen.getByText('研究项目')).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('搜索名称、阶段或下一步'), { target: { value: '' } })
    fireEvent.change(screen.getByRole('combobox', { name: '按项目类型筛选' }), { target: { value: 'teaching' } })
    expect(screen.getByText('历史建筑活化利用')).toBeTruthy()
    expect(screen.queryByText('研究项目')).toBeNull()
  })

  it('waits while disconnected and reads once the Remote Gateway returns', async () => {
    const read = vi.fn(async () => snapshot([projectRecord('PROJECT-001', '历史建筑活化利用', '教学')]))
    const source = transport(read)
    const { rerender, client } = renderGallery(<ProjectGallery gatewayState="connecting" transport={source} />)

    expect(screen.getByText('等待 Gateway 连接')).toBeTruthy()
    expect(read).not.toHaveBeenCalled()

    rerender(
      <QueryClientProvider client={client}>
        <ProjectGallery gatewayState="open" transport={source} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('历史建筑活化利用')).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('refetches after an established Remote Gateway reconnects', async () => {
    const read = vi.fn(async () => snapshot([projectRecord('PROJECT-001', '历史建筑活化利用', '教学')]))
    const source = transport(read)
    const { rerender, client } = renderGallery(<ProjectGallery gatewayState="open" transport={source} />)

    await screen.findByText('历史建筑活化利用')
    expect(read).toHaveBeenCalledTimes(1)

    rerender(
      <QueryClientProvider client={client}>
        <ProjectGallery gatewayState="connecting" transport={source} />
      </QueryClientProvider>
    )
    expect(screen.getByText('等待 Gateway 连接')).toBeTruthy()

    rerender(
      <QueryClientProvider client={client}>
        <ProjectGallery gatewayState="open" transport={source} />
      </QueryClientProvider>
    )
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  })

  it('refetches on Gallery reopen so navigation cannot silently freeze stale data', async () => {
    const read = vi.fn(async () => snapshot([projectRecord('PROJECT-001', '历史建筑活化利用', '教学')]))
    const source = transport(read)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const first = renderGallery(<ProjectGallery gatewayState="open" transport={source} />, client)

    await screen.findByText('历史建筑活化利用')
    expect(read).toHaveBeenCalledTimes(1)
    first.unmount()

    renderGallery(<ProjectGallery gatewayState="open" transport={source} />, client)
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2))
  })

  it('allows a bounded manual retry after a transient transport failure', async () => {
    const read = vi
      .fn<() => Promise<RawWorkspaceReadSnapshot>>()
      .mockRejectedValueOnce(new Error('temporary gateway error'))
      .mockResolvedValueOnce(snapshot([projectRecord('PROJECT-001', '历史建筑活化利用', '教学')]))

    renderGallery(<ProjectGallery gatewayState="open" transport={transport(read)} />)

    expect(await screen.findByText('项目读取失败')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText('历史建筑活化利用')).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('keeps the Gallery surface read-only', async () => {
    renderGallery(
      <ProjectGallery
        gatewayState="open"
        transport={transport(async () => snapshot([projectRecord('PROJECT-001', '历史建筑活化利用', '教学')]))}
      />
    )

    await screen.findByText('历史建筑活化利用')
    expect(screen.queryByRole('button', { name: /新建|创建|编辑|删除|保存/ })).toBeNull()
  })
})
