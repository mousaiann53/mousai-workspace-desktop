import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ReviewCostCenter } from './review-cost-center'
import type { WorkspaceSettingsTransport } from './service-settings'
import type { WorkspaceReadTransport } from './service-workspace-read'

const settingsTransport: WorkspaceSettingsTransport = {
  readSettings: vi.fn(async () => {
    throw new Error('not available in this fixture')
  }),
  updateSettings: vi.fn(async () => {
    throw new Error('not available in this fixture')
  })
}

const transport: WorkspaceReadTransport & WorkspaceSettingsTransport = {
  scope: 'review-cost-test',
  readSnapshot: vi.fn(async () => ({
    workdata: { projectRecords: [], taskRecords: [] },
    loadedAt: '2026-08-30T00:00:00Z'
  })),
  ...settingsTransport
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

  it('shows honest unavailable cost facts rather than zero values', async () => {
    renderCenter('cost')

    expect(await screen.findByText('AI 用量与成本 unavailable')).toBeTruthy()
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

  it.each([
    ['providers', 'Provider 状态 unavailable'],
    ['security', 'AI 用量安全告警 unavailable'],
    ['backup', '备份与恢复状态 unavailable'],
    ['settings', '设置只读 / unavailable']
  ] as const)('keeps %s honest when its canonical contract is absent', async (surface, message) => {
    renderCenter(surface)
    expect(await screen.findByText(message)).toBeTruthy()
  })

  it('renders an honest insufficient-history review state from an empty canonical snapshot', async () => {
    renderCenter('review')
    expect(await screen.findByText('历史数据不足以统计')).toBeTruthy()
    expect(screen.getAllByText('未设置').length).toBeGreaterThan(0)
  })

  it('renders a bounded error state without stale or demo facts', async () => {
    const failingTransport: WorkspaceReadTransport & WorkspaceSettingsTransport = {
      scope: 'review-cost-error',
      readSnapshot: vi.fn(async () => {
        throw new Error('read failed')
      }),
      ...settingsTransport
    }

    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ReviewCostCenter gatewayState="open" onNavigate={vi.fn()} surface="review" transport={failingTransport} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('复盘读取失败')).toBeTruthy()
    expect(screen.queryByText('¥0')).toBeNull()
  })
})
