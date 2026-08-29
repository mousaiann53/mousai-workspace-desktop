import type { PluginStorage } from '@hermes/plugin-sdk'

import type { TaskCreateInput } from './service-task-mutation'

const STORAGE_KEY = 'pending-task-create-v1'
const CLIENT_REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

export interface DurableTaskCreateDraft {
  readonly clientRequestId: string
  readonly task: TaskCreateInput
}

export interface TaskCreateDraftStore {
  clear(): void
  load(): DurableTaskCreateDraft | null
  save(draft: DurableTaskCreateDraft): boolean
}

function nullableString(value: unknown): value is null | string | undefined {
  return value === null || value === undefined || typeof value === 'string'
}

function parseDraft(value: unknown): DurableTaskCreateDraft | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as { clientRequestId?: unknown; task?: unknown }

  if (
    typeof candidate.clientRequestId !== 'string' ||
    !CLIENT_REQUEST_ID.test(candidate.clientRequestId) ||
    !candidate.task ||
    typeof candidate.task !== 'object'
  ) {
    return null
  }

  const task = candidate.task as Record<string, unknown>

  if (
    typeof task.title !== 'string' ||
    task.title.trim().length === 0 ||
    !nullableString(task.type) ||
    !nullableString(task.projectRef) ||
    !nullableString(task.priority) ||
    !nullableString(task.deadline) ||
    !nullableString(task.nextAction)
  ) {
    return null
  }

  return {
    clientRequestId: candidate.clientRequestId,
    task: {
      title: task.title,
      type: task.type,
      projectRef: task.projectRef,
      priority: task.priority,
      deadline: task.deadline,
      nextAction: task.nextAction
    }
  }
}

function sameDraft(left: DurableTaskCreateDraft, right: DurableTaskCreateDraft): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function createTaskCreateDraftStore(storage: PluginStorage): TaskCreateDraftStore {
  const load = () => {
    const value = storage.get<unknown>(STORAGE_KEY, null)

    return parseDraft(value)
  }

  return Object.freeze({
    clear() {
      storage.remove(STORAGE_KEY)
    },
    load,
    save(draft: DurableTaskCreateDraft) {
      const sanitized = parseDraft(draft)

      if (!sanitized) {
        return false
      }

      storage.set(STORAGE_KEY, sanitized)

      const persisted = load()

      return persisted !== null && sameDraft(persisted, sanitized)
    }
  })
}
