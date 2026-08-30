import { describe, expect, it } from 'vitest'

import type { WorkspaceSnapshot } from './domain'
import { sourceHealthFromSnapshot } from './intake-contracts'

const snapshot: WorkspaceSnapshot = {
  projects: [],
  tasks: [],
  events: [],
  deliverables: [],
  productionReviews: [],
  activities: [],
  loadedAt: '2026-08-30T01:00:00.000Z'
}

describe('intake contracts', () => {
  it('reports only facts supported by the canonical snapshot and gateway state', () => {
    const entries = sourceHealthFromSnapshot(snapshot, 'open')

    expect(entries.find(entry => entry.sourceType === 'workspace')).toMatchObject({
      state: 'connected',
      lastSeen: snapshot.loadedAt
    })
    expect(entries.find(entry => entry.sourceType === 'hermes_session')?.state).toBe('connected')
    expect(entries.find(entry => entry.sourceType === 'feishu')?.state).toBe('unknown')
  })

  it('does not turn a missing snapshot into a fake healthy source', () => {
    expect(sourceHealthFromSnapshot(null, 'closed').every(entry => entry.state !== 'connected')).toBe(true)
  })
})
