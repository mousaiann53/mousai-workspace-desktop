import type { PluginStorage } from '@hermes/plugin-sdk'
import { describe, expect, it } from 'vitest'

import { createTaskCreateDraftStore } from './service-task-create-draft'

function memoryStorage(): PluginStorage {
  const values = new Map<string, unknown>()

  return {
    get(key, fallback) {
      return (values.has(key) ? values.get(key) : fallback) as never
    },
    remove(key) {
      values.delete(key)
    },
    set(key, value) {
      values.set(key, value)
    }
  }
}

describe('durable task create draft', () => {
  it('round-trips the bounded request through official plugin storage and clears it after acknowledgement', () => {
    const store = createTaskCreateDraftStore(memoryStorage())

    const draft = {
      clientRequestId: 'desktop:create:durable-001',
      task: {
        title: '新任务',
        type: '行政',
        projectRef: 'PROJECT-001',
        priority: '普通',
        deadline: null,
        nextAction: '核对事实'
      }
    }

    expect(store.save(draft)).toBe(true)
    expect(store.load()).toEqual(draft)

    store.clear()
    expect(store.load()).toBeNull()
  })
})
