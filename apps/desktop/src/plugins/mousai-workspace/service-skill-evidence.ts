import type { ProductionJsonValue } from './domain'
import type { ProductionReviewItem } from './service-production-review'

const COURSE_PRODUCTION_MODES = new Set(['course_standard', 'teaching_plan', 'lesson_plan', 'course_ppt'])
const FIELDWORK_MANUAL_MODES = new Set(['requirements', 'outline', 'draft', 'revision', 'finalize'])
const CANDIDATE_STATES = new Set(['candidate', 'ready', 'stable'])

export interface SkillEvidenceModel {
  readonly skillName: string | null
  readonly mode: string | null
  readonly firstRealRun: string | null
  readonly approvedScope: readonly string[]
  readonly sourceFiles: readonly string[]
  readonly generatedArtifacts: readonly string[]
  readonly mousaiRevisionCount: number
  readonly acceptanceState: string
  readonly rerunCount: number
  readonly candidateState: 'candidate' | 'ready' | 'stable' | null
}

function record(value: ProductionJsonValue | undefined): Readonly<Record<string, ProductionJsonValue>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, ProductionJsonValue>>)
    : null
}

function explicitText(value: ProductionJsonValue | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function sourceLabel(value: ProductionJsonValue): string | null {
  const direct = explicitText(value)

  if (direct) {
    return direct
  }

  const source = record(value)

  if (!source) {
    return null
  }

  return (
    explicitText(source.filename) ??
    explicitText(source.relative_path) ??
    explicitText(source.path) ??
    explicitText(source.name) ??
    explicitText(source.id)
  )
}

function isWorkBuddy(actor: string | null): boolean {
  return actor !== null && /^(workbuddy|司木(?:\s+moss)?)$/i.test(actor.trim())
}

function isMousai(actor: string | null): boolean {
  return actor !== null && /^mousai$/i.test(actor.trim())
}

function explicitSkill(output: Readonly<Record<string, ProductionJsonValue>>): string | null {
  return explicitText(output.skill_name) ?? explicitText(output.skill)
}

function explicitMode(output: Readonly<Record<string, ProductionJsonValue>>): string | null {
  return explicitText(output.mode) ?? explicitText(output.task_type)
}

function skillForMode(mode: string | null): string | null {
  if (mode && COURSE_PRODUCTION_MODES.has(mode)) {
    return 'course-production'
  }

  if (mode && FIELDWORK_MANUAL_MODES.has(mode)) {
    return 'fieldwork-manual'
  }

  return null
}

export function buildSkillEvidence(item: ProductionReviewItem): SkillEvidenceModel {
  const review = item.review
  const output = review?.bundleMeta?.outputRequirements ?? {}
  const mode = explicitMode(output)

  const workBuddyStarts =
    review?.events.filter(event => event.state === 'READY_FOR_PRODUCTION' && isWorkBuddy(event.actor)) ?? []

  const firstRealRun = workBuddyStarts.find(event => event.at)?.at ?? null
  const explicitCandidateState = explicitText(output.skill_candidate_state)
  const approvedScope = review?.approvedScope?.items ?? []
  const generatedArtifacts = item.deliverables.map(deliverable => deliverable.filename)
  const hasCandidateEvidence = firstRealRun !== null && approvedScope.length > 0 && generatedArtifacts.length > 0

  return {
    skillName: explicitSkill(output) ?? skillForMode(mode),
    mode,
    firstRealRun,
    approvedScope,
    sourceFiles: review?.bundleMeta?.inputSources.flatMap(source => sourceLabel(source) ?? []) ?? [],
    generatedArtifacts,
    mousaiRevisionCount:
      review?.events.filter(event => event.state === 'REVISION_REQUIRED' && isMousai(event.actor)).length ?? 0,
    acceptanceState: review?.acceptance?.verdict ?? review?.gateState ?? '未设置',
    rerunCount: Math.max(0, workBuddyStarts.length - 1),
    candidateState:
      explicitCandidateState && CANDIDATE_STATES.has(explicitCandidateState)
        ? (explicitCandidateState as SkillEvidenceModel['candidateState'])
        : hasCandidateEvidence
          ? 'candidate'
          : null
  }
}
