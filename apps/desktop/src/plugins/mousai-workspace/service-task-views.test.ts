import { describe, expect, it, vi } from 'vitest'

import type { Task } from './domain'
import { createLocalDeliverableAccess, localOutboxPath } from './service-local-deliverables'
import { tasksForView } from './service-task-views'

function task(id: string, status: Task['status'], deadline: string | null): Task {
  return {
    id,
    revision: 'a'.repeat(64),
    title: id,
    typeLabel: null,
    projectRef: null,
    status,
    statusLabel: null,
    priority: 'unset',
    priorityLabel: null,
    deadline,
    estimate: null,
    executor: null,
    nextAction: null,
    origin: null,
    artifactUrl: null,
    requiresHumanApproval: null,
    createdAt: null,
    updatedAt: null,
    workBridgeState: 'not_applicable',
    source: { system: 'workdata', recordId: id }
  }
}

describe('task read views', () => {
  const now = new Date('2026-08-29T04:00:00Z')

  const tasks = [
    task('WORK-INBOX-NO-DDL', 'inbox', null),
    task('WORK-TODAY', 'classified', '2026-08-28T16:00:00Z'),
    task('WORK-RECENT', 'review', '2026-09-02T16:00:00Z'),
    task('WORK-LATER', 'classified', '2026-09-20T16:00:00Z'),
    task('WORK-DONE', 'completed', '2026-08-28T16:00:00Z')
  ]

  it('uses only formal status and Shanghai DDL without filling missing dates', () => {
    expect(tasksForView(tasks, 'inbox', now).map(item => item.id)).toEqual(['WORK-INBOX-NO-DDL'])
    expect(tasksForView(tasks, 'today', now).map(item => item.id)).toEqual(['WORK-TODAY'])
    expect(tasksForView(tasks, 'recent', now).map(item => item.id)).toEqual(['WORK-RECENT'])
  })
})

describe('local deliverable access', () => {
  it('reveals only the fixed WORK-ID outbox through the curated OS door', async () => {
    const reveal = vi.fn(async () => true)
    const access = createLocalDeliverableAccess(reveal)

    await expect(access.revealOutbox('WORK-20260829-001')).resolves.toBe(true)
    expect(reveal).toHaveBeenCalledWith('H:\\MousaiWork\\outbox\\WORK-20260829-001')
    expect(localOutboxPath('WORK-20260829-001')).toBe('H:\\MousaiWork\\outbox\\WORK-20260829-001')
  })

  it.each(['../secret', 'WORK-001\\..\\secret', 'WORK-001/secret', ''])('rejects an unsafe WORK-ID: %s', value => {
    expect(() => localOutboxPath(value)).toThrow('invalid_work_id')
  })
})
