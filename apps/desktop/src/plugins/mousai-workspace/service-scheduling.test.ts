import { describe, expect, it } from 'vitest'

import type { Project, Task, WorkspaceSnapshot } from './domain'
import { buildCapacitySummary, buildSchedulingProposals, parseEstimatedMinutes } from './service-scheduling'

function task(id: string, deadline: string | null, estimate: string | null, executor: string | null): Task {
  return {
    id,
    revision: 'a'.repeat(64),
    title: id,
    typeLabel: '行政',
    projectRef: 'PROJECT-1',
    status: 'classified',
    statusLabel: '已分类',
    priority: 'normal',
    priorityLabel: '普通',
    deadline,
    estimate,
    executor,
    nextAction: null,
    origin: 'WorkData',
    artifactUrl: null,
    requiresHumanApproval: null,
    createdAt: null,
    updatedAt: null,
    workBridgeState: 'not_applicable',
    source: { system: 'workdata', recordId: id }
  }
}

const project: Project = {
  id: 'PROJECT-1',
  name: '项目一',
  type: 'administrative',
  typeLabel: '行政',
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
  source: { system: 'workdata', recordId: 'PROJECT-1' }
}

function snapshot(tasks: readonly Task[]): WorkspaceSnapshot {
  return {
    projects: [project],
    tasks,
    events: [],
    deliverables: [],
    productionReviews: [],
    activities: [],
    loadedAt: '2026-08-29T00:00:00Z'
  }
}

describe('deterministic scheduling foundation', () => {
  it('parses only explicit duration formats', () => {
    expect(parseEstimatedMinutes('45m')).toBe(45)
    expect(parseEstimatedMinutes('1.5小时')).toBe(90)
    expect(parseEstimatedMinutes('大约一小时')).toBeNull()
  })

  it('reports capacity gaps instead of inventing free time', () => {
    const model = buildCapacitySummary(
      snapshot([task('WORK-1', '2026-08-29T18:00:00+08:00', null, null)]),
      'today',
      new Date('2026-08-29T04:00:00Z')
    )

    expect(model).toMatchObject({
      taskCount: 1,
      unknownEstimateCount: 1,
      scheduledMinutes: null,
      availableMinutes: null,
      sourceState: 'contract_gap'
    })
  })

  it('returns a blocked preview when canonical schedule contracts are absent', () => {
    const [proposal] = buildSchedulingProposals(
      snapshot([task('WORK-1', '2026-08-29T18:00:00+08:00', '1h', 'Mousai')]),
      {
        now: new Date('2026-08-29T01:00:00Z'),
        horizonEnd: new Date('2026-09-05T10:00:00Z'),
        scheduleBlocks: null,
        dependencies: null,
        workdayStartHour: 9,
        workdayEndHour: 18
      }
    )

    expect(proposal.proposedStart).toBeNull()
    expect(proposal.rationale).toContain('schedule_blocks 读取合同尚未提供')
    expect(proposal.sourceState).toBe('contract_gap')
  })

  it('allocates reproducible daytime slots when all canonical constraints are supplied', () => {
    const proposals = buildSchedulingProposals(
      snapshot([
        task('WORK-1', '2026-08-30T18:00:00+08:00', '1h', 'Mousai'),
        task('WORK-2', '2026-08-30T18:00:00+08:00', '30m', 'WorkBuddy')
      ]),
      {
        now: new Date('2026-08-29T01:00:00Z'),
        horizonEnd: new Date('2026-08-30T10:00:00Z'),
        scheduleBlocks: [{ id: 'EVENT-1', startsAt: '2026-08-29T09:30:00+08:00', endsAt: '2026-08-29T10:00:00+08:00' }],
        dependencies: new Map(),
        workdayStartHour: 9,
        workdayEndHour: 18
      }
    )

    expect(proposals.map(item => [item.workId, item.proposedStart, item.proposedEnd])).toEqual([
      ['WORK-1', '2026-08-29T02:00:00.000Z', '2026-08-29T03:00:00.000Z'],
      ['WORK-2', '2026-08-29T03:00:00.000Z', '2026-08-29T03:30:00.000Z']
    ])
  })
})
