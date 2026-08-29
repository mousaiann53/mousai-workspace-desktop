import { describe, expect, it, vi } from 'vitest'

import { readWorkspaceSnapshot } from './service-workspace-read'
import {
  createPluginWorkspaceReadTransport,
  WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
  WORKSPACE_SNAPSHOT_TIMEOUT_MS,
  WorkspaceSnapshotContractError
} from './transport-plugin-rest'

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: WORKSPACE_SNAPSHOT_SCHEMA_VERSION,
    generatedAt: '2026-08-29T01:02:03Z',
    projects: [],
    tasks: [],
    events: [],
    deliverables: [],
    productionReviews: [],
    ...overrides
  }
}

describe('secure Workspace plugin REST transport', () => {
  it('uses the official plugin REST namespace with a bounded read-only request', async () => {
    const rest = vi.fn().mockResolvedValue(
      envelope({
        projects: [
          {
            record_id: 'rec-project',
            fields: {
              'PROJECT-ID': 'PROJECT-001',
              名称: '历史建筑活化利用',
              类型: '教学',
              未知字段: 'must not enter the domain'
            }
          }
        ],
        productionReviews: [
          {
            work_id: 'WORK-001',
            gate_state: 'MATERIAL_MISSING',
            missing_information: ['正式模板'],
            decision_required: false,
            approved_scope: null,
            scope_history: [],
            events: []
          }
        ]
      })
    )

    const transport = createPluginWorkspaceReadTransport(
      rest as unknown as Parameters<typeof createPluginWorkspaceReadTransport>[0]
    )

    const result = await readWorkspaceSnapshot(transport)

    expect(rest).toHaveBeenCalledOnce()
    expect(rest).toHaveBeenCalledWith('/snapshot', {
      method: 'GET',
      timeoutMs: WORKSPACE_SNAPSHOT_TIMEOUT_MS
    })
    expect(result.snapshot.projects).toHaveLength(1)
    expect(result.snapshot.projects[0]).toMatchObject({
      id: 'PROJECT-001',
      name: '历史建筑活化利用',
      type: 'teaching',
      progress: null,
      nextDeadline: null,
      risk: null
    })
    expect(result.snapshot.loadedAt).toBe('2026-08-29T01:02:03.000Z')
    expect(result.snapshot.productionReviews[0]).toMatchObject({
      workId: 'WORK-001',
      authority: 'workbridge',
      gateState: 'MATERIAL_MISSING',
      missingInformation: ['正式模板']
    })
    expect(JSON.stringify(result)).not.toContain('未知字段')
  })

  it.each([
    ['non-object response', null],
    ['unknown schema', envelope({ schemaVersion: 'future' })],
    ['invalid generatedAt', envelope({ generatedAt: 'not-a-date' })],
    ['non-array projects', envelope({ projects: {} })],
    ['non-array tasks', envelope({ tasks: null })],
    ['non-array events', envelope({ events: 'events' })],
    ['non-array deliverables', envelope({ deliverables: 1 })],
    ['non-array productionReviews', envelope({ productionReviews: {} })]
  ])('rejects a malformed backend contract: %s', async (_label, response) => {
    const transport = createPluginWorkspaceReadTransport(vi.fn().mockResolvedValue(response))

    await expect(transport.readSnapshot()).rejects.toBeInstanceOf(WorkspaceSnapshotContractError)
  })

  it('preserves backend availability, permission, and timeout failures for retry UI', async () => {
    const backendError = new Error('request timed out')
    const transport = createPluginWorkspaceReadTransport(vi.fn().mockRejectedValue(backendError), { timeoutMs: 25 })

    await expect(transport.readSnapshot()).rejects.toBe(backendError)
  })

  it('honors an already-aborted Gallery lifecycle without calling the backend', async () => {
    const rest = vi.fn()
    const controller = new AbortController()
    controller.abort()
    const transport = createPluginWorkspaceReadTransport(rest)

    await expect(transport.readSnapshot({ signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(rest).not.toHaveBeenCalled()
  })

  it('accepts an empty, sparse snapshot without inventing facts', async () => {
    const rest = vi.fn().mockResolvedValue(
      envelope({
        projects: [{ record_id: 'rec-sparse', fields: { 'PROJECT-ID': 'PROJECT-EMPTY', 名称: '空白项目' } }]
      })
    )

    const result = await readWorkspaceSnapshot(createPluginWorkspaceReadTransport(rest))

    expect(result.snapshot.projects[0]).toMatchObject({
      id: 'PROJECT-EMPTY',
      name: '空白项目',
      status: null,
      stage: null,
      nextAction: null,
      nextDeadline: null,
      progress: null,
      risk: null
    })
  })

  it('uses ctx.rest for the four explicit task mutation routes', async () => {
    const response = (action: 'complete' | 'create' | 'defer' | 'edit') => ({
      workId: 'WORK-001',
      action,
      success: true,
      idempotent: false,
      newRevision: 'a'.repeat(64),
      changed: {}
    })

    const rest = vi.fn(async (path: string) => {
      if (path === '/tasks') {
        return response('create')
      }

      if (path.endsWith('/defer')) {
        return response('defer')
      }

      if (path.endsWith('/complete')) {
        return response('complete')
      }

      return response('edit')
    })

    const transport = createPluginWorkspaceReadTransport(
      rest as unknown as Parameters<typeof createPluginWorkspaceReadTransport>[0]
    )

    const meta = { clientRequestId: 'desktop:request-001', expectedRevision: 'b'.repeat(64) }

    await transport.createTask({ clientRequestId: 'desktop:create-001', task: { title: '新任务' } })
    await transport.editTask('WORK-001', { ...meta, changes: { nextAction: '核对事实' } })
    await transport.deferTask('WORK-001', { ...meta, deadline: '2026-09-10' })
    await transport.completeTask('WORK-001', meta)

    expect(rest).toHaveBeenNthCalledWith(1, '/tasks', {
      method: 'POST',
      body: { clientRequestId: 'desktop:create-001', task: { title: '新任务' } },
      timeoutMs: WORKSPACE_SNAPSHOT_TIMEOUT_MS
    })
    expect(rest).toHaveBeenNthCalledWith(2, '/tasks/WORK-001', {
      method: 'PATCH',
      body: { ...meta, changes: { nextAction: '核对事实' } },
      timeoutMs: WORKSPACE_SNAPSHOT_TIMEOUT_MS
    })
    expect(rest).toHaveBeenNthCalledWith(3, '/tasks/WORK-001/defer', {
      method: 'POST',
      body: { ...meta, deadline: '2026-09-10' },
      timeoutMs: WORKSPACE_SNAPSHOT_TIMEOUT_MS
    })
    expect(rest).toHaveBeenNthCalledWith(4, '/tasks/WORK-001/complete', {
      method: 'POST',
      body: meta,
      timeoutMs: WORKSPACE_SNAPSHOT_TIMEOUT_MS
    })
  })

  it('uses five explicit typed production routes without renderer authentication fields', async () => {
    const scope = {
      scopeId: 'scope-001',
      version: 1,
      items: ['产物 A'],
      approvedBy: 'Mousai',
      approvedAt: '2026-08-29T03:00:00.000Z',
      scopeHash: 'c'.repeat(64)
    }

    const bundleMeta = {
      missingInformation: [],
      decisionRequired: false,
      inputSources: ['source-001'],
      outputRequirements: { formats: ['pdf'] },
      acceptanceCriteria: ['人工验收'],
      deliverables: null,
      decisionNote: null,
      dueDate: '2026-09-01',
      revision: 1,
      revisionReason: '初始范围'
    } as const

    const rest = vi.fn(async (path: string) => {
      const gateState = path.endsWith('/prepare')
        ? 'WAITING_HUMAN_APPROVAL'
        : path.endsWith('/scope')
          ? 'APPROVED_SCOPE'
          : path.endsWith('/start')
            ? 'READY_FOR_PRODUCTION'
            : path.endsWith('/revision')
              ? 'REVISION_REQUIRED'
              : 'ACCEPTED'

      const hasScope = gateState !== 'WAITING_HUMAN_APPROVAL'

      return {
        production: {
          work_id: 'WORK-001',
          gate_state: gateState,
          missing_information: [],
          decision_required: false,
          approved_scope: hasScope
            ? {
                scope_id: scope.scopeId,
                version: scope.version,
                items: scope.items,
                approved_by: scope.approvedBy,
                approved_at: scope.approvedAt,
                scope_hash: scope.scopeHash
              }
            : null,
          scope_history: hasScope
            ? [
                {
                  scope_id: scope.scopeId,
                  version: scope.version,
                  items: scope.items,
                  approved_by: scope.approvedBy,
                  approved_at: scope.approvedAt,
                  scope_hash: scope.scopeHash
                }
              ]
            : [],
          revision: gateState === 'REVISION_REQUIRED' ? 2 : null,
          acceptance: gateState === 'ACCEPTED' ? { verdict: 'PASS', comment: '通过' } : null,
          events: []
        }
      }
    })

    const transport = createPluginWorkspaceReadTransport(
      rest as unknown as Parameters<typeof createPluginWorkspaceReadTransport>[0]
    )

    await transport.prepareProduction('WORK-001', { actor: 'Mousai', bundleMeta })
    await transport.approveProductionScope('WORK-001', { actor: 'Mousai', approvedScope: scope, bundleMeta })
    await transport.startProduction('WORK-001', { actor: 'Mousai' })
    await transport.requestProductionRevision('WORK-001', {
      actor: 'Mousai',
      revision: 2,
      reason: '需要修订',
      reviewerComment: '请按意见修订'
    })
    await transport.acceptProduction('WORK-001', { actor: 'Mousai', verdict: 'PASS', comment: '通过' })

    expect(rest).toHaveBeenNthCalledWith(1, '/tasks/WORK-001/production/prepare', {
      method: 'POST',
      body: {
        actor: 'Mousai',
        bundle_meta: {
          missing_information: [],
          decision_required: false,
          input_sources: ['source-001'],
          output_requirements: { formats: ['pdf'] },
          acceptance: ['人工验收'],
          due_date: '2026-09-01',
          revision: 1,
          revision_reason: '初始范围'
        }
      },
      timeoutMs: WORKSPACE_SNAPSHOT_TIMEOUT_MS
    })
    expect(rest).toHaveBeenNthCalledWith(2, '/tasks/WORK-001/production/scope', {
      method: 'POST',
      body: {
        actor: 'Mousai',
        approved_scope: {
          scope_id: 'scope-001',
          version: 1,
          items: ['产物 A'],
          approved_by: 'Mousai',
          approved_at: '2026-08-29T03:00:00.000Z',
          scope_hash: 'c'.repeat(64)
        },
        bundle_meta: {
          missing_information: [],
          decision_required: false,
          input_sources: ['source-001'],
          output_requirements: { formats: ['pdf'] },
          acceptance: ['人工验收'],
          due_date: '2026-09-01',
          revision: 1,
          revision_reason: '初始范围'
        }
      },
      timeoutMs: WORKSPACE_SNAPSHOT_TIMEOUT_MS
    })
    expect(rest).toHaveBeenNthCalledWith(3, '/tasks/WORK-001/production/start', {
      method: 'POST',
      body: { actor: 'Mousai' },
      timeoutMs: WORKSPACE_SNAPSHOT_TIMEOUT_MS
    })
    expect(rest).toHaveBeenNthCalledWith(4, '/tasks/WORK-001/production/revision', {
      method: 'POST',
      body: {
        actor: 'Mousai',
        revision: 2,
        reason: '需要修订',
        reviewer_comment: '请按意见修订'
      },
      timeoutMs: WORKSPACE_SNAPSHOT_TIMEOUT_MS
    })
    expect(rest).toHaveBeenNthCalledWith(5, '/tasks/WORK-001/production/accept', {
      method: 'POST',
      body: { actor: 'Mousai', acceptance: { verdict: 'PASS', comment: '通过' } },
      timeoutMs: WORKSPACE_SNAPSHOT_TIMEOUT_MS
    })
    expect(JSON.stringify(rest.mock.calls)).not.toMatch(/authorization|bearer|token/i)
  })

  it('preserves a canonical production 409 without reporting success', async () => {
    const backend = Object.assign(
      new Error('409: {"error":{"code":"illegal_transition","message":"WAITING_ACCEPTANCE required"}}'),
      { statusCode: 409 }
    )

    const transport = createPluginWorkspaceReadTransport(vi.fn().mockRejectedValue(backend))

    await expect(transport.startProduction('WORK-001', { actor: 'Mousai' })).rejects.toMatchObject({
      statusCode: 409,
      code: 'illegal_transition',
      message: expect.stringContaining('WAITING_ACCEPTANCE required')
    })
  })

  it('preserves a sanitized 409 revision conflict for the refetch UI', async () => {
    const backend = Object.assign(new Error('409: {"detail":{"code":"revision_conflict","message":"Task changed"}}'), {
      statusCode: 409
    })

    const transport = createPluginWorkspaceReadTransport(vi.fn().mockRejectedValue(backend))

    await expect(
      transport.editTask('WORK-001', {
        clientRequestId: 'desktop:request-001',
        expectedRevision: 'a'.repeat(64),
        changes: { nextAction: '不会覆盖' }
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'revision_conflict'
    })
  })
})
