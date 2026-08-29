import { describe, expect, it } from 'vitest'

import type { Deliverable, ProductionReview } from './domain'
import type { ProductionReviewItem } from './service-production-review'
import { buildSkillEvidence } from './service-skill-evidence'

function deliverable(): Deliverable {
  return {
    id: 'WORK-1:plan.docx',
    workId: 'WORK-1',
    taskId: 'WORK-1',
    projectId: null,
    name: 'plan.docx',
    filename: 'plan.docx',
    format: '.docx',
    relativePath: 'plan.docx',
    extension: '.docx',
    sizeBytes: 10,
    sha256: 'a'.repeat(64),
    modifiedAt: '2026-08-29T01:00:00Z',
    updatedAt: '2026-08-29T01:00:00Z',
    submissionState: 'submitted',
    deliveryState: 'delivered',
    reviewState: 'pending',
    localOutputRoot: null,
    source: { system: 'manifest', recordId: 'plan.docx' }
  }
}

function item(review: ProductionReview, files: readonly Deliverable[] = []): ProductionReviewItem {
  return {
    deliverables: files,
    producer: null,
    provenance: null,
    project: {} as never,
    task: {} as never,
    review
  }
}

function review(overrides: Partial<ProductionReview> = {}): ProductionReview {
  return {
    workId: 'WORK-1',
    authority: 'workbridge',
    gateState: 'WAITING_ACCEPTANCE',
    missingInformation: [],
    decisionRequired: false,
    approvedScope: {
      scopeId: 'scope-1',
      version: 1,
      items: ['教学计划'],
      approvedBy: 'Mousai',
      approvedAt: '2026-08-29T00:00:00Z',
      scopeHash: 'b'.repeat(64)
    },
    scopeHistory: [],
    revision: 1,
    manifestVersion: 'manifest-v1',
    acceptance: null,
    bundleMeta: {
      missingInformation: [],
      decisionRequired: false,
      inputSources: [{ filename: '课程标准.md' }],
      outputRequirements: { task_type: 'teaching_plan' },
      acceptanceCriteria: [],
      deliverables: null,
      decisionNote: null,
      dueDate: null,
      revision: 1,
      revisionReason: null
    },
    events: [],
    source: { system: 'workbridge', recordId: 'WORK-1' },
    ...overrides
  }
}

describe('Skill evidence model', () => {
  it('keeps an external M4 record at NOT RUN and does not infer WorkBuddy evidence', () => {
    const model = buildSkillEvidence(
      item(
        review({
          events: [
            {
              state: 'WAITING_ACCEPTANCE',
              at: '2026-08-29T01:00:00Z',
              actor: 'GPT-PM',
              note: 'external production',
              approvedScopeVersion: 1,
              revision: 1,
              revisionReason: null,
              reviewerComment: null,
              manifestVersion: 'manifest-v1',
              acceptance: null
            }
          ]
        }),
        [deliverable()]
      )
    )

    expect(model.firstRealRun).toBeNull()
    expect(model.candidateState).toBeNull()
    expect(model.rerunCount).toBe(0)
  })

  it('recognizes course-production only from explicit mode plus canonical WorkBuddy evidence', () => {
    const workBuddyStart = {
      state: 'READY_FOR_PRODUCTION' as const,
      at: '2026-08-29T01:00:00Z',
      actor: '司木 Moss',
      note: 'production started',
      approvedScopeVersion: 1,
      revision: 1,
      revisionReason: null,
      reviewerComment: null,
      manifestVersion: null,
      acceptance: null
    }

    const mousaiRevision = {
      ...workBuddyStart,
      state: 'REVISION_REQUIRED' as const,
      actor: 'Mousai',
      revisionReason: '补充说明',
      reviewerComment: '请修订'
    }

    const model = buildSkillEvidence(
      item(review({ events: [workBuddyStart, mousaiRevision, { ...workBuddyStart, at: '2026-08-29T03:00:00Z' }] }), [
        deliverable()
      ])
    )

    expect(model).toMatchObject({
      skillName: 'course-production',
      mode: 'teaching_plan',
      firstRealRun: '2026-08-29T01:00:00Z',
      sourceFiles: ['课程标准.md'],
      generatedArtifacts: ['plan.docx'],
      mousaiRevisionCount: 1,
      rerunCount: 1,
      candidateState: 'candidate'
    })
  })

  it('uses an explicit stable state instead of deriving a stronger claim', () => {
    const baseline = review()

    const model = buildSkillEvidence(
      item({
        ...baseline,
        bundleMeta: baseline.bundleMeta
          ? {
              ...baseline.bundleMeta,
              outputRequirements: { skill: 'course-production', mode: 'course_ppt', skill_candidate_state: 'stable' }
            }
          : null
      })
    )

    expect(model.skillName).toBe('course-production')
    expect(model.mode).toBe('course_ppt')
    expect(model.candidateState).toBe('stable')
  })
})
