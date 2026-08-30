import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IntakeAuxiliarySurface, IntakeSurfaceNav } from './intake-operations'
import type { WorkspaceReadTransport } from './service-workspace-read'

describe('intake operations', () => {
  afterEach(() => cleanup())

  it('keeps work scope writes disabled while the typed contract is absent', () => {
    render(
      <IntakeAuxiliarySurface
        gatewayState="open"
        surface="scope"
        transport={{ scope: 'test', readSnapshot: vi.fn() }}
      />
    )

    expect(screen.getByText(/来源 allowlist 尚无权威 contract/)).toBeTruthy()
    expect(
      screen.getAllByRole('button', { name: '配置范围' }).every(button => (button as HTMLButtonElement).disabled)
    ).toBe(true)
  })

  it('navigates among explicit intake surfaces', () => {
    const onNavigate = vi.fn()
    render(<IntakeSurfaceNav active="inbox" onNavigate={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: '来源状态' }))
    expect(onNavigate).toHaveBeenCalledWith('health')
  })

  it('shows canonical snapshot and gateway health without fake channel health', async () => {
    const transport: WorkspaceReadTransport = {
      scope: 'health-test',
      readSnapshot: vi.fn(async () => ({
        workdata: { projectRecords: [], taskRecords: [] },
        loadedAt: '2026-08-30T01:00:00Z'
      }))
    }

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    render(
      <QueryClientProvider client={client}>
        <IntakeAuxiliarySurface gatewayState="open" surface="health" transport={transport} />
      </QueryClientProvider>
    )

    expect(await screen.findByText('已连接')).toBeTruthy()
    expect(screen.getAllByText('未知').length).toBeGreaterThan(0)
  })
})
