import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { WorkspaceSnapshot } from './domain'
import { PlanningPreview } from './planning-preview'
import type { WorkspacePlanningMutationTransport } from './service-planning-mutation'

const snapshot: WorkspaceSnapshot = {
  projects: [],
  tasks: [],
  events: [],
  deliverables: [],
  productionReviews: [],
  activities: [],
  scheduleBlocks: [],
  fixedEvents: [],
  planningEvents: [],
  planningProposals: [
    {
      proposalId: 'PLAN-0123456789ABCDEF',
      proposalRevision: 1,
      status: 'pending',
      workId: 'WORK-001',
      startsAt: '2026-09-01T09:00:00+08:00',
      endsAt: '2026-09-01T09:45:00+08:00',
      executor: 'Mousai',
      kind: 'task',
      estimatedDurationMinutes: 45,
      createdAt: '2026-08-30T12:00:00+08:00',
      createdBy: 'Mousai'
    }
  ],
  loadedAt: '2026-08-30T04:00:00Z'
}

function transport(): WorkspacePlanningMutationTransport {
  const proposal = snapshot.planningProposals?.[0]

  if (!proposal) {throw new Error('fixture missing proposal')}
  const result = { proposal: { ...proposal, status: 'accepted' as const }, scheduleBlock: null, idempotent: false }

  return {
    registerPlanningProposal: vi.fn().mockResolvedValue(result),
    acceptPlanningProposal: vi.fn().mockResolvedValue(result),
    adjustPlanningProposal: vi.fn().mockResolvedValue(result),
    ignorePlanningProposal: vi.fn().mockResolvedValue(result)
  }
}

describe('PlanningPreview canonical actions', () => {
  it('keeps accept explicit and refetches after the canonical result', async () => {
    const mutations = transport()
    const refetch = vi.fn().mockResolvedValue(undefined)
    render(<PlanningPreview onRefetch={refetch} snapshot={snapshot} transport={mutations} />)

    fireEvent.click(screen.getByRole('button', { name: '接受' }))

    await waitFor(() => expect(mutations.acceptPlanningProposal).toHaveBeenCalledTimes(1))
    expect(mutations.registerPlanningProposal).not.toHaveBeenCalled()
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('does not offer accept for terminal proposals', () => {
    const terminal = {
      ...snapshot,
      planningProposals: snapshot.planningProposals?.map(proposal => ({ ...proposal, status: 'ignored' as const }))
    }

    render(<PlanningPreview onRefetch={vi.fn()} snapshot={terminal} transport={transport()} />)
    expect(screen.queryByRole('button', { name: '接受' })).toBeNull()
  })
})
