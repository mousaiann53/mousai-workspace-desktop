import type { ProductionReviewItem } from './service-production-review'
import { buildSkillEvidence } from './service-skill-evidence'

function display(value: null | number | string): string {
  return value === null || value === '' ? '未设置' : String(value)
}

function list(items: readonly string[]): string {
  return items.length ? items.join('；') : '未设置'
}

export function SkillEvidence({ item }: { item: ProductionReviewItem }) {
  const evidence = buildSkillEvidence(item)

  return (
    <div aria-label="Skill candidate evidence">
      <dl className="grid gap-x-5 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">Skill name</dt>
          <dd className="mt-1 text-xs text-(--ui-text-secondary)">{display(evidence.skillName)}</dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">Mode</dt>
          <dd className="mt-1 text-xs text-(--ui-text-secondary)">{display(evidence.mode)}</dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">First real run</dt>
          <dd className="mt-1 text-xs text-(--ui-text-secondary)">{evidence.firstRealRun ?? 'NOT RUN'}</dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">Approved scope</dt>
          <dd className="mt-1 text-xs text-(--ui-text-secondary)">{list(evidence.approvedScope)}</dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">Source files</dt>
          <dd className="mt-1 break-words text-xs text-(--ui-text-secondary)">{list(evidence.sourceFiles)}</dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">Generated artifact</dt>
          <dd className="mt-1 break-words text-xs text-(--ui-text-secondary)">{list(evidence.generatedArtifacts)}</dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">Mousai revision count</dt>
          <dd className="mt-1 text-xs text-(--ui-text-secondary)">{evidence.mousaiRevisionCount}</dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">Acceptance state</dt>
          <dd className="mt-1 text-xs text-(--ui-text-secondary)">{evidence.acceptanceState}</dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">Rerun count</dt>
          <dd className="mt-1 text-xs text-(--ui-text-secondary)">{evidence.rerunCount}</dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">Candidate / ready / stable</dt>
          <dd className="mt-1 text-xs text-(--ui-text-secondary)">{display(evidence.candidateState)}</dd>
        </div>
      </dl>

      {!evidence.firstRealRun && (
        <p className="mt-3 rounded-md bg-foreground/4 px-3 py-2 text-xs text-(--ui-text-tertiary)">
          WorkBuddy run = NOT RUN。没有 canonical WorkBuddy production evidence，不计为 first real run。
        </p>
      )}
    </div>
  )
}
