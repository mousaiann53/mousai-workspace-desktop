import { describe, expect, it } from 'vitest'

import { adaptS4Snapshot } from './adapter-s4'
import type { Project, Task, WorkspaceSnapshot } from './domain'
import { buildAiContribution, buildPlanActualRows } from './service-review-cost'

describe('adaptS4Snapshot', () => {
  it('adapts canonical review history, contribution, timing and usage', () => {
    const result = adaptS4Snapshot({
      reviewHistory: [
        {
          event_id: 'RH-1',
          work_id: 'WORK-1',
          project_id: null,
          type: 'deadline_changed',
          occurred_at: '2026-09-01T10:00:00+08:00',
          actor: 'workbridge:client',
          previous_value: '2026-09-01',
          next_value: '2026-09-10',
          source: 'task_mutation',
          revision: 1
        }
      ],
      aiContribution: [
        {
          work_id: 'WORK-1',
          state: 'AI_PRIMARY',
          evidence_refs: ['production:WORK-1:execution'],
          assessed_by: 'workbridge:s4-evidence-classifier',
          assessed_at: '2026-09-05T10:00:00+08:00',
          revision: 1
        }
      ],
      executionTiming: [
        {
          work_id: 'WORK-1',
          scheduled_start: '2026-09-02T14:00:00+08:00',
          scheduled_end: '2026-09-02T15:00:00+08:00',
          actual_start: '2026-09-02T14:05:00+08:00',
          actual_end: '2026-09-02T15:05:00+08:00',
          actual_duration_minutes: 60,
          measured_by: 'workbridge_execution_ledger',
          revision: 1
        }
      ],
      systemSettings: {
        workday_end: '18:00',
        night_budget: null,
        budget_currency: null,
        timezone: 'Asia/Shanghai',
        notification_preferences: null,
        work_scope_revision: null,
        provider_display: null,
        revision: 0
      },
      usageLedger: [
        {
          usage_id: 'u-1',
          occurred_at: '2026-09-04T10:00:00+08:00',
          provider: 'zhipu',
          model: 'glm-4.6',
          agent: 'workbuddy',
          project_id: null,
          work_id: null,
          requests: 2,
          input_tokens: 1000,
          output_tokens: 500,
          total_tokens: 1500,
          source: 'gateway'
        }
      ],
      usageLedgerTotal: 1,
      providerUsage: [
        {
          period_start: '2026-09-04T00:00:00+00:00',
          period_end: '2026-09-04T23:59:59+00:00',
          provider: 'zhipu',
          model: 'glm-4.6',
          agent: 'workbuddy',
          project_id: null,
          work_id: null,
          requests: 2,
          tokens: 1500,
          value: null,
          currency: null,
          value_kind: 'actual'
        }
      ],
      securityAlerts: [
        {
          alert_id: 'SA-1',
          type: 'usage_spike',
          severity: 'warning',
          state: 'open',
          detected_at: '2026-09-04T11:00:00+08:00',
          provider: 'zhipu',
          work_id: null,
          safe_summary: 'Daily token usage for zhipu exceeded 5x the trailing median',
          details: {}
        }
      ],
      backupStatus: {
        latest_backup_at: null,
        state: 'unknown',
        last_restore_test_at: null,
        last_restore_test_state: null,
        protected_components: [],
        last_error_code: null,
        checked_at: '2026-09-05T10:00:00+08:00'
      },
      notifications: [
        {
          notification_id: 'NT-WORK-1-task_state',
          kind: 'task_state',
          severity: 'info',
          work_id: 'WORK-1',
          title: '任务',
          state: '待验收',
          occurred_at: '2026-09-04T10:00:00+08:00'
        }
      ],
      sourceHealth: [
        {
          source_type: 'qq',
          health: 'unavailable',
          scope_state: 'disabled',
          reason: 'work scope state: disabled',
          checked_at: '2026-09-05T10:00:00+08:00'
        }
      ]
    })

    expect(result.issues).toEqual([])
    expect(result.fields.reviewHistory?.[0].type).toBe('deadline_changed')
    expect(result.fields.aiContribution?.[0].state).toBe('AI_PRIMARY')
    expect(result.fields.executionTiming?.[0].actualDurationMinutes).toBe(60)
    expect(result.fields.systemSettings?.workdayEnd).toBe('18:00')
    expect(result.fields.usageLedger?.[0].totalTokens).toBe(1500)
    expect(result.fields.providerUsage?.[0].value).toBeNull()
    expect(result.fields.securityAlerts?.[0].safeSummary).not.toContain('sk-')
    expect(result.fields.backupStatus?.state).toBe('unknown')
    expect(result.fields.sourceHealth?.[0].health).toBe('unavailable')
    // Contractual honest empties once usage facts exist.
    expect(result.fields.costAttribution).toEqual([])
    expect(result.fields.providerCredit).toEqual([])
  })

  it('drops records that violate the contract instead of coercing them', () => {
    const result = adaptS4Snapshot({
      reviewHistory: [{ event_id: 'RH-BAD', type: 'invented_type', work_id: 'WORK-1' }],
      aiContribution: [{ work_id: 'WORK-1', state: 'OBVIOUSLY_AI', assessed_by: 'x' }]
    })

    expect(result.issues).toEqual([])
    expect(result.fields.reviewHistory).toEqual([])
    expect(result.fields.aiContribution).toEqual([])
  })

  it('keeps every field absent when the gateway omits the projections (legacy)', () => {
    const result = adaptS4Snapshot({})

    expect(result.issues).toEqual([])
    expect(result.fields.reviewHistory).toBeUndefined()
    expect(result.fields.aiContribution).toBeUndefined()
    expect(result.fields.systemSettings).toBeUndefined()
    expect(result.fields.usageLedger).toBeUndefined()
    expect(result.fields.costAttribution).toBeUndefined()
  })
})

const task: Task = {
  id: 'WORK-1',
  revision: 'a'.repeat(64),
  title: '测试任务',
  typeLabel: '教学',
  projectRef: null,
  status: 'completed',
  statusLabel: '已完成',
  priority: 'normal',
  priorityLabel: '普通',
  deadline: '2026-09-10',
  estimate: null,
  executor: null,
  nextAction: null,
  origin: null,
  artifactUrl: null,
  requiresHumanApproval: null,
  createdAt: null,
  updatedAt: null,
  workBridgeState: 'completed',
  source: { system: 'workdata', recordId: 'rec-task' }
}

const project: Project = {
  id: 'PROJECT-1',
  name: '项目一',
  type: 'teaching',
  typeLabel: '教学',
  status: null,
  stage: null,
  nextAction: null,
  officialSourceUrl: null,
  lastReview: null,
  updatedAt: null,
  horizon: 'unset',
  ownership: 'unset',
  progress: null,
  nextDeadline: null,
  risk: null,
  tags: [],
  courseProfile: {
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
  },
  source: { system: 'workdata', recordId: 'P1' }
}

function baseSnapshot(): WorkspaceSnapshot {
  return {
    projects: [project],
    tasks: [task],
    events: [],
    deliverables: [],
    productionReviews: [],
    activities: [],
    loadedAt: '2026-09-05T12:00:00Z'
  }
}

describe('canonical S4 wiring in review-cost services', () => {
  it('uses the canonical aiContribution projection when present', () => {
    const snapshot = {
      ...baseSnapshot(),
      aiContribution: [
        {
          workId: 'WORK-1',
          state: 'AI_PRIMARY' as const,
          evidenceRefs: ['production:WORK-1:execution'],
          assessedBy: 'workbridge:s4-evidence-classifier',
          assessedAt: null,
          revision: 1
        }
      ]
    }

    const items = buildAiContribution(snapshot)

    expect(items).toEqual([
      {
        workId: 'WORK-1',
        title: '测试任务',
        state: 'AI_PRIMARY',
        evidence: ['production:WORK-1:execution']
      }
    ])
  })

  it('fills plan-vs-actual from canonical timing and review history', () => {
    const snapshot = {
      ...baseSnapshot(),
      executionTiming: [
        {
          workId: 'WORK-1',
          scheduledStart: '2026-09-02T14:00:00+08:00',
          scheduledEnd: '2026-09-02T15:00:00+08:00',
          actualStart: '2026-09-02T14:05:00+08:00',
          actualEnd: '2026-09-02T15:05:00+08:00',
          actualDurationMinutes: 60,
          measuredBy: 'workbridge_execution_ledger',
          revision: 1
        }
      ],
      reviewHistory: [
        {
          eventId: 'RH-1',
          workId: 'WORK-1',
          projectId: null,
          type: 'deadline_changed' as const,
          occurredAt: '2026-09-01T10:00:00+08:00',
          actor: 'workbridge:client',
          previousValue: '2026-09-01',
          nextValue: '2026-09-10',
          source: 'task_mutation' as const,
          revision: 1
        }
      ]
    }

    const rows = buildPlanActualRows(snapshot)

    expect(rows).toHaveLength(1)
    expect(rows[0].scheduledTime).toBe('2026-09-02T14:00:00+08:00')
    expect(rows[0].actualDuration).toBe(60)
    expect(rows[0].rescheduleCount).toBe(1)
    expect(rows[0].plannedDeadline).toBe('2026-09-01')
    expect(rows[0].currentDeadline).toBe('2026-09-10')
  })
})
