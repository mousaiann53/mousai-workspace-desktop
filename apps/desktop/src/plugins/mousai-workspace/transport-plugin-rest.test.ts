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
        ]
      })
    )

    const transport = createPluginWorkspaceReadTransport(rest)

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
    expect(JSON.stringify(result)).not.toContain('未知字段')
  })

  it.each([
    ['non-object response', null],
    ['unknown schema', envelope({ schemaVersion: 'future' })],
    ['invalid generatedAt', envelope({ generatedAt: 'not-a-date' })],
    ['non-array projects', envelope({ projects: {} })],
    ['non-array tasks', envelope({ tasks: null })],
    ['non-array events', envelope({ events: 'events' })],
    ['non-array deliverables', envelope({ deliverables: 1 })]
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
})
