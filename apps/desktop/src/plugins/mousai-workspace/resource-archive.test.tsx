import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ResourceArchiveView } from './resource-archive'
import { resourceArchiveRawSnapshot } from './resource-archive.test-fixtures'
import type { WorkspaceReadTransport } from './service-workspace-read'

function renderView(mode: 'archive' | 'resources') {
  const revealOutbox = vi.fn(async () => true)
  const onOpenResource = vi.fn()
  const onOpenTask = vi.fn()

  const transport: WorkspaceReadTransport = {
    scope: `resource-archive-${mode}`,
    async readSnapshot() {
      return resourceArchiveRawSnapshot()
    }
  }

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  render(
    <QueryClientProvider client={client}>
      <ResourceArchiveView
        gatewayState="open"
        localAccess={{ revealOutbox }}
        mode={mode}
        onOpenResource={onOpenResource}
        onOpenTask={onOpenTask}
        transport={transport}
      />
    </QueryClientProvider>
  )

  return { onOpenResource, onOpenTask, revealOutbox }
}

describe('ResourceArchiveView', () => {
  afterEach(() => cleanup())

  it('shows manifest metadata grouped by project and uses only bounded local access', async () => {
    const calls = renderView('resources')

    expect(await screen.findByText('final.pdf')).toBeTruthy()
    expect(screen.getByText('真实项目')).toBeTruthy()
    expect(screen.getByText(/Revision：1/)).toBeTruthy()
    expect(screen.getByText(/Producer：workbuddy/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '进入交付物' }))
    expect(calls.onOpenResource).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: '打开本地产物' }))
    expect(calls.revealOutbox).toHaveBeenCalledWith('WORK-COMPLETED')
  })

  it('shows archived tasks, completed work and accepted deliverables without demos', async () => {
    const calls = renderView('archive')

    expect((await screen.findAllByText('已归档任务')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('已完成任务')).toBeTruthy()
    expect(screen.getByText('已验收交付物')).toBeTruthy()
    expect(screen.getByText('final.pdf')).toBeTruthy()
    expect(screen.queryByText(/Demo|示例/)).toBeNull()

    fireEvent.click(screen.getAllByRole('button', { name: '进入任务' })[0])
    expect(calls.onOpenTask).toHaveBeenCalledOnce()
  })
})
