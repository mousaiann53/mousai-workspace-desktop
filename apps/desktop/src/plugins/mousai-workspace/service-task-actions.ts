import type { Task, TaskStatus } from './domain'

const ACTIVE_EXECUTION = new Set<TaskStatus>(['claimed', 'cloud_processing', 'local_processing', 'waiting_local'])
const EDITABLE = new Set<TaskStatus>(['classified', 'decision_required', 'inbox', 'material_missing', 'review'])
const COMPLETABLE = new Set<TaskStatus>(['classified', 'inbox', 'review'])

export interface TaskActionCapability {
  readonly canComplete: boolean
  readonly canDefer: boolean
  readonly canEdit: boolean
  readonly reason: null | 'active_execution' | 'missing_revision' | 'state_protected'
}

export function taskActionCapability(task: Task): TaskActionCapability {
  if (!task.revision) {
    return { canComplete: false, canDefer: false, canEdit: false, reason: 'missing_revision' }
  }

  if (ACTIVE_EXECUTION.has(task.status)) {
    return { canComplete: false, canDefer: false, canEdit: false, reason: 'active_execution' }
  }

  const canEdit = EDITABLE.has(task.status)
  const canComplete = COMPLETABLE.has(task.status)

  return {
    canComplete,
    canDefer: canEdit,
    canEdit,
    reason: canEdit || canComplete ? null : 'state_protected'
  }
}
