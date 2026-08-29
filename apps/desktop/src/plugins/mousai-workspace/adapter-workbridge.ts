import { asNullableBoolean, asTrimmedText, isRecord, issue, recordsFromPayload } from './adapter-shared'
import type { AdapterIssue, AdapterResult, Task, TaskPriority, TaskStatus } from './domain'

const TASK_STATUSES: Readonly<Record<string, TaskStatus>> = {
  收件箱: 'inbox',
  已分类: 'classified',
  云端处理中: 'cloud_processing',
  等待本机: 'waiting_local',
  待验收: 'review',
  已完成: 'completed',
  已归档: 'archived',
  资料缺失: 'material_missing',
  需要决策: 'decision_required'
}

function adaptJob(candidate: unknown, issues: AdapterIssue[], seen: Set<string>): Task | null {
  if (!isRecord(candidate)) {
    issues.push(issue('workbridge', 'invalid_record', 'WorkBridge job is not an object.'))

    return null
  }

  const id = asTrimmedText(candidate.work_id)
  const title = asTrimmedText(candidate.title)

  if (!id) {
    issues.push(issue('workbridge', 'missing_id', 'WorkBridge job has no work_id.'))

    return null
  }

  if (!title) {
    issues.push(issue('workbridge', 'missing_name', 'WorkBridge job has no title.', id))

    return null
  }

  if (seen.has(id)) {
    issues.push(issue('workbridge', 'duplicate_id', `Duplicate WORK-ID: ${id}`, id))

    return null
  }

  seen.add(id)
  const statusLabel = asTrimmedText(candidate.status)

  return {
    id,
    title,
    typeLabel: asTrimmedText(candidate.task_type),
    projectRef: asTrimmedText(candidate.project),
    status: statusLabel ? (TASK_STATUSES[statusLabel] ?? 'unknown') : 'unknown',
    statusLabel,
    priority: 'unset' satisfies TaskPriority,
    priorityLabel: null,
    deadline: null,
    nextAction: asTrimmedText(candidate.next_step),
    origin: null,
    artifactUrl: null,
    requiresHumanApproval: asNullableBoolean(candidate.requires_human_approval),
    createdAt: null,
    updatedAt: null,
    source: { system: 'workbridge', recordId: id }
  }
}

export function adaptWorkBridgeJobs(payload: unknown): AdapterResult<readonly Task[]> {
  const issues: AdapterIssue[] = []
  const seen = new Set<string>()
  let records: readonly unknown[] = recordsFromPayload(payload)

  if (isRecord(payload) && Array.isArray(payload.jobs)) {
    records = payload.jobs
  } else if (isRecord(payload) && isRecord(payload.bundle)) {
    records = [payload.bundle]
  }

  const tasks = records
    .map(record => adaptJob(record, issues, seen))
    .filter((task): task is Task => task !== null)

  return { data: tasks, issues }
}
