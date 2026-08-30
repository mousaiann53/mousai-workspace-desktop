import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReviewCostCenter } from './review-cost-center'
import type { WorkspaceReadTransport } from './service-workspace-read'

const transport: WorkspaceReadTransport = {
  scope: 'review-cost-test',
  readSnapshot: vi.fn(async () => ({
    workdata: { projectRecords: [], taskRecords: [] },
    loadedAt: '2026-08-30T00:00:00Z'
  }))
}

describe('ReviewCostCenter', () => {
  afterEach(() => cleanup())

  function renderCenter(surface: Parameters<typeof ReviewCostCenter>[0]['surface'], onNavigate = vi.fn()) {
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ReviewCostCenter gatewayState="open" onNavigate={onNavigate} surface={surface} transport={transport} />
      </QueryClientProvider>
    )
  }

  it('shows honest unavailable cost facts rather than zero values', () => {
    renderCenter('cost')

    expect(screen.getByText('AI 用量与成本 unavailable')).toBeTruthy()
    expect(screen.getAllByText('未设置').length).toBeGreaterThan(0)
    expect(screen.queryByText('¥0')).toBeNull()
  })

  it('keeps release evidence at NOT RUN or HOLD', () => {
    renderCenter('release')

    expect(screen.getAllByText('NOT RUN').length).toBeGreaterThan(0)
    expect(screen.getAllByText('HOLD').length).toBeGreaterThan(0)
    expect(screen.queryByText('PASS')).toBeNull()
  })

  it('navigates among explicit review foundation surfaces', () => {
    const onNavigate = vi.fn()
    renderCenter('review', onNavigate)
    fireEvent.click(screen.getByRole('button', { name: '安全中心' }))
    expect(onNavigate).toHaveBeenCalledWith('security')
  })
})
