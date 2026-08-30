import { describe, expect, it } from 'vitest'

import type { Task } from './domain'
import {
  buildIngestAudit,
  buildSourceIdentity,
  compareDuplicateEvidence,
  duplicateStateFromCanonical
} from './service-source-identity'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'WORK-1',
    revision: 'a'.repeat(64),
    title: '测试任务',
    typeLabel: '行政',
    projectRef: null,
    status: 'inbox',
    statusLabel: '收件箱',
    priority: 'normal',
    priorityLabel: '普通',
    deadline: null,
    estimate: null,
    executor: null,
    nextAction: null,
    origin: null,
    artifactUrl: null,
    requiresHumanApproval: null,
    createdAt: null,
    updatedAt: null,
    workBridgeState: 'not_applicable',
    source: { system: 'workdata', recordId: 'rec-1' },
    ...overrides
  }
}

describe('SourceIdentity compatibility adapter', () => {
  it('maps only explicit source labels and falls back to the canonical system', () => {
    expect(buildSourceIdentity(task({ origin: '飞书 / DM' })).sourceType).toBe('feishu')
    expect(buildSourceIdentity(task({ origin: 'QQ 群' })).sourceType).toBe('qq')
    expect(buildSourceIdentity(task({ origin: null })).sourceType).toBe('workspace')
    expect(
      buildSourceIdentity(task({ origin: '未经定义的来源', source: { system: 'manifest', recordId: null } })).sourceType
    ).toBe('unknown')
  })

  it('never uses title similarity as duplicate evidence', () => {
    const left = task({ id: 'WORK-1', title: '同名任务', source: { system: 'workdata', recordId: 'rec-1' } })
    const unrelated = task({ id: 'WORK-2', title: '同名任务', source: { system: 'workdata', recordId: 'rec-2' } })
    const sameSource = task({ id: 'WORK-3', source: { system: 'workdata', recordId: 'rec-1' } })

    expect(compareDuplicateEvidence(left, unrelated).state).toBe('unknown')
    expect(compareDuplicateEvidence(left, sameSource)).toMatchObject({ state: 'possible', relatedWorkIds: ['WORK-3'] })
    expect(compareDuplicateEvidence(left, left).state).toBe('merged')
  })

  it('supports canonical duplicate states without inventing a default', () => {
    expect(duplicateStateFromCanonical('independent')).toBe('independent')
    expect(duplicateStateFromCanonical('merged')).toBe('merged')
    expect(duplicateStateFromCanonical(undefined)).toBe('unknown')
  })

  it('keeps ingest history and extraction facts unset when contracts are absent', () => {
    const audit = buildIngestAudit(task({ origin: 'Manual', projectRef: 'PROJECT-1' }), [])

    expect(audit).toMatchObject({
      manuallyCreated: true,
      assignedToProject: true,
      automaticExtraction: null,
      extractionState: null,
      sourceMerged: null,
      historyAvailable: false
    })
  })
})
