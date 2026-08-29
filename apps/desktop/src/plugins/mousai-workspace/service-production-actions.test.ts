import { describe, expect, it } from 'vitest'

import type { ProductionGateState, ProductionReview } from './domain'
import { issueProductionScope, productionActionCapability } from './service-production-actions'

function review(gateState: ProductionGateState): ProductionReview {
  return {
    workId: 'WORK-20260829-001',
    authority: 'workbridge',
    gateState,
    missingInformation: [],
    decisionRequired: false,
    approvedScope: null,
    scopeHistory: [],
    revision: null,
    manifestVersion: null,
    acceptance: null,
    bundleMeta: null,
    events: [],
    source: { system: 'workbridge', recordId: 'WORK-20260829-001' }
  }
}

function enabled(gateState: ProductionGateState | null): readonly string[] {
  const capability = productionActionCapability(gateState ? review(gateState) : null)

  return Object.entries(capability)
    .filter(([, allowed]) => allowed)
    .map(([action]) => action)
    .sort()
}

describe('Production action-state matrix', () => {
  it.each<[ProductionGateState | null, readonly string[]]>([
    [null, ['prepare']],
    ['INPUT_REQUIRED', ['prepare']],
    ['MATERIAL_MISSING', ['prepare']],
    ['DECISION_REQUIRED', ['prepare']],
    ['WAITING_HUMAN_APPROVAL', ['prepare', 'scope']],
    ['APPROVED_SCOPE', ['start']],
    ['READY_FOR_PRODUCTION', []],
    ['REVISION_REQUIRED', []],
    ['DELIVERED', []],
    ['WAITING_ACCEPTANCE', ['accept', 'revision']],
    ['ACCEPTED', []]
  ])('allows only explicit actions for %s', (gateState, actions) => {
    expect(enabled(gateState)).toEqual([...actions].sort())
  })

  it('seals the exact approved scope using the canonical WorkBridge digest', async () => {
    const scope = await issueProductionScope({
      workId: 'WORK-20260829-001',
      version: 2,
      items: [' 产物 A ', '产物 B'],
      approvedBy: 'Mousai',
      approvedAt: '2026-08-29T03:00:00.000Z',
      existingScopeId: null
    })

    expect(scope).toEqual({
      scopeId: 'WORK-20260829-001:scope',
      version: 2,
      items: ['产物 A', '产物 B'],
      approvedBy: 'Mousai',
      approvedAt: '2026-08-29T03:00:00.000Z',
      scopeHash: '55163327722a8c20ef13b116c53da817e9b75b0c49fe80570e1837b3a073cd29'
    })
  })
})
