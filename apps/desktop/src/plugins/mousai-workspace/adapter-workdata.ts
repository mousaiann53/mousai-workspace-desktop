import { adaptSourceIdentity } from './adapter-intake'
import {
  asIsoDateTime,
  asNullableBoolean,
  asNullableNumber,
  asTrimmedText,
  isRecord,
  issue,
  recordsFromPayload,
  type UnknownRecord
} from './adapter-shared'
import type {
  AdapterIssue,
  AdapterResult,
  CourseProfile,
  Project,
  ProjectType,
  Task,
  TaskPriority,
  TaskStatus,
  WorkBridgeState
} from './domain'

export interface WorkDataSnapshot {
  readonly projects: readonly Project[]
  readonly tasks: readonly Task[]
}

const PROJECT_TYPES: Readonly<Record<string, ProjectType>> = {
  教学: 'teaching',
  科研: 'research',
  行政: 'administrative',
  创意制作: 'creative'
}

const TASK_STATUSES: Readonly<Record<string, TaskStatus>> = {
  收件箱: 'inbox',
  已分类: 'classified',
  云端处理中: 'cloud_processing',
  等待本机: 'waiting_local',
  待验收: 'review',
  已完成: 'completed',
  已归档: 'archived',
  已领取: 'claimed',
  本机处理中: 'local_processing',
  模型失败: 'model_failed',
  执行失败: 'execution_failed',
  资料缺失: 'material_missing',
  需要决策: 'decision_required'
}

const TASK_PRIORITIES: Readonly<Record<string, TaskPriority>> = {
  低: 'low',
  普通: 'normal',
  正常: 'normal',
  高: 'high',
  紧急: 'urgent'
}

function workBridgeState(status: TaskStatus): WorkBridgeState {
  const states: Partial<Record<TaskStatus, WorkBridgeState>> = {
    waiting_local: 'waiting',
    claimed: 'claimed',
    local_processing: 'processing',
    review: 'review',
    model_failed: 'failed',
    execution_failed: 'failed',
    completed: 'completed',
    archived: 'archived',
    unknown: 'unknown'
  }

  return states[status] ?? 'not_applicable'
}

const EMPTY_COURSE_PROFILE: CourseProfile = {
  audience: null,
  assessmentMethod: null,
  assessmentRatio: null,
  courseMaterialRootUrl: null,
  grade: null,
  lessonPlanTemplateUrl: null,
  localCases: null,
  preferredCases: null,
  professionalBackground: null,
  referenceBooks: null,
  requiredTextbook: null,
  slideTemplateUrl: null,
  teachingWeeks: null,
  totalHours: null,
  weeklyHours: null,
  practiceBaseOrFinalSite: null
}

function fieldsOf(record: UnknownRecord): UnknownRecord {
  return isRecord(record.fields) ? record.fields : {}
}

function sourceRecordId(record: UnknownRecord): string | null {
  return asTrimmedText(record.record_id) ?? asTrimmedText(record.recordId)
}

function courseProfile(fields: UnknownRecord): CourseProfile {
  return {
    ...EMPTY_COURSE_PROFILE,
    audience: asTrimmedText(fields['授课对象']),
    grade: asTrimmedText(fields['年级']),
    professionalBackground: asTrimmedText(fields['专业背景']),
    totalHours: asNullableNumber(fields['总学时']),
    teachingWeeks: asNullableNumber(fields['教学周数']),
    weeklyHours: asNullableNumber(fields['周课时']),
    assessmentMethod: asTrimmedText(fields['考核方式']),
    assessmentRatio: asTrimmedText(fields['考核比例']),
    requiredTextbook: asTrimmedText(fields['指定教材']),
    referenceBooks: asTrimmedText(fields['参考书目']),
    preferredCases: asTrimmedText(fields['偏好案例']),
    localCases: asTrimmedText(fields['本地案例']),
    practiceBaseOrFinalSite: asTrimmedText(fields['实践基地 / 期末选址']),
    lessonPlanTemplateUrl: asTrimmedText(fields['教案模板链接']),
    slideTemplateUrl: asTrimmedText(fields['PPT模板链接']),
    courseMaterialRootUrl: asTrimmedText(fields['课程资料根链接'])
  }
}

function adaptProjects(payload: unknown, issues: AdapterIssue[]): Project[] {
  const projects: Project[] = []
  const seen = new Set<string>()

  for (const candidate of recordsFromPayload(payload)) {
    if (!isRecord(candidate)) {
      issues.push(issue('workdata', 'invalid_record', 'Project record is not an object.'))

      continue
    }

    const fields = fieldsOf(candidate)
    const sourceId = sourceRecordId(candidate)
    const id = asTrimmedText(fields['PROJECT-ID'])
    const name = asTrimmedText(fields['名称'])

    if (!id) {
      issues.push(issue('workdata', 'missing_id', 'Project record has no PROJECT-ID.', sourceId))

      continue
    }

    if (!name) {
      issues.push(issue('workdata', 'missing_name', 'Project record has no name.', sourceId ?? id))

      continue
    }

    if (seen.has(id)) {
      issues.push(issue('workdata', 'duplicate_id', `Duplicate PROJECT-ID: ${id}`, sourceId ?? id))

      continue
    }

    seen.add(id)
    const typeLabel = asTrimmedText(fields['类型']) ?? '未设置'

    projects.push({
      id,
      name,
      type: PROJECT_TYPES[typeLabel] ?? 'other',
      typeLabel,
      status: asTrimmedText(fields['当前状态']),
      stage: asTrimmedText(fields['当前阶段']),
      nextAction: asTrimmedText(fields['下一步']),
      officialSourceUrl: asTrimmedText(fields['正式资料链接']),
      lastReview: asTrimmedText(fields['最后复盘']),
      updatedAt: asIsoDateTime(fields['更新时间']),
      horizon: 'unset',
      ownership: 'unset',
      progress: null,
      nextDeadline: null,
      risk: null,
      tags: [],
      courseProfile: courseProfile(fields),
      source: { system: 'workdata', recordId: sourceId }
    })
  }

  return projects
}

function adaptTasks(payload: unknown, issues: AdapterIssue[]): Task[] {
  const tasks: Task[] = []
  const seen = new Set<string>()

  for (const candidate of recordsFromPayload(payload)) {
    if (!isRecord(candidate)) {
      issues.push(issue('workdata', 'invalid_record', 'Task record is not an object.'))

      continue
    }

    const fields = fieldsOf(candidate)
    const sourceId = sourceRecordId(candidate)
    const id = asTrimmedText(fields['WORK-ID'])
    const title = asTrimmedText(fields['任务名称'])

    if (!id) {
      issues.push(issue('workdata', 'missing_id', 'Task record has no WORK-ID.', sourceId))

      continue
    }

    if (!title) {
      issues.push(issue('workdata', 'missing_name', 'Task record has no title.', sourceId ?? id))

      continue
    }

    if (seen.has(id)) {
      issues.push(issue('workdata', 'duplicate_id', `Duplicate WORK-ID: ${id}`, sourceId ?? id))

      continue
    }

    seen.add(id)
    const statusLabel = asTrimmedText(fields['状态'])
    const priorityLabel = asTrimmedText(fields['优先级'])
    const status = statusLabel ? (TASK_STATUSES[statusLabel] ?? 'unknown') : 'unknown'
    const deadline = asIsoDateTime(fields.DDL)

    if (statusLabel && !TASK_STATUSES[statusLabel]) {
      issues.push(issue('workdata', 'invalid_field', `Unknown task status: ${statusLabel}`, sourceId ?? id))
    }

    if (priorityLabel && !TASK_PRIORITIES[priorityLabel]) {
      issues.push(issue('workdata', 'invalid_field', `Unknown task priority: ${priorityLabel}`, sourceId ?? id))
    }

    if (asTrimmedText(fields.DDL) && deadline === null) {
      issues.push(issue('workdata', 'invalid_field', 'Task DDL is invalid.', sourceId ?? id))
    }

    tasks.push({
      id,
      revision: asTrimmedText(candidate.revision),
      intakeRevision: asTrimmedText(candidate.intake_revision),
      sourceIdentity: adaptSourceIdentity(candidate.sourceIdentity),
      title,
      typeLabel: asTrimmedText(fields['类型']),
      projectRef: asTrimmedText(fields['所属项目']),
      status,
      statusLabel,
      priority: priorityLabel ? (TASK_PRIORITIES[priorityLabel] ?? 'unset') : 'unset',
      priorityLabel,
      deadline,
      estimate: null,
      estimatedMinutes:
        Number.isInteger(candidate.estimated_duration_minutes) &&
        Number(candidate.estimated_duration_minutes) >= 1 &&
        Number(candidate.estimated_duration_minutes) <= 720
          ? Number(candidate.estimated_duration_minutes)
          : null,
      executor: null,
      nextAction: asTrimmedText(fields['下一步']),
      origin: asTrimmedText(fields['来源']),
      artifactUrl: asTrimmedText(fields['产物链接']),
      requiresHumanApproval: asNullableBoolean(fields['需要人工验收']),
      createdAt: asIsoDateTime(fields['创建时间']),
      updatedAt: asIsoDateTime(fields['最后更新时间']),
      workBridgeState: workBridgeState(status),
      source: { system: 'workdata', recordId: sourceId }
    })
  }

  return tasks
}

export function adaptWorkDataSnapshot(input: {
  readonly projectRecords: unknown
  readonly taskRecords: unknown
}): AdapterResult<WorkDataSnapshot> {
  const issues: AdapterIssue[] = []

  return {
    data: {
      projects: adaptProjects(input.projectRecords, issues),
      tasks: adaptTasks(input.taskRecords, issues)
    },
    issues
  }
}
