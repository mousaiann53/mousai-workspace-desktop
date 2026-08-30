import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { IntakeAuxiliarySurface, IntakeSurfaceNav } from './intake-operations'
import type { WorkspaceReadTransport } from './service-workspace-read'

describe('intake operations', () => {
  afterEach(() => cleanup())

  it('reads and writes canonical work scope through the typed transport', async () => {
    const setWorkScope = vi.fn().mockResolvedValue({ idempotent: false })

    const transport = {
      scope: 'test',
      readSnapshot: vi.fn().mockResolvedValue({
        workdata: { projectRecords: [], taskRecords: [] },
        workScope: [
          {
            source_type: 'manual',
            scope_id: 'probe',
            state: 'approval_required',
            label: 'Probe',
            updated_at: '2026-08-30T10:00:00+08:00',
            revision: 1
          }
        ]
      }),
      setWorkScope
    }

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={client}>
        <IntakeAuxiliarySurface gatewayState="open" surface="scope" transport={transport} />
      </QueryClientProvider>
    )
    expect(await screen.findByText(/manual · probe · approval_required · v1/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('来源类型'), { target: { value: 'manual' } })
    fireEvent.change(screen.getByLabelText('Scope ID'), { target: { value: 'probe' } })
    fireEvent.change(screen.getByLabelText('范围名称'), { target: { value: 'Probe' } })
    fireEvent.change(screen.getByLabelText('范围状态'), { target: { value: 'enabled' } })
    fireEvent.click(screen.getByRole('button', { name: '保存范围' }))
    await waitFor(() => expect(setWorkScope).toHaveBeenCalledOnce())
    expect(setWorkScope).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: 'manual',
        scopeId: 'probe',
        state: 'enabled',
        expectedRevision: 1,
        actor: 'Mousai'
      })
    )
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
