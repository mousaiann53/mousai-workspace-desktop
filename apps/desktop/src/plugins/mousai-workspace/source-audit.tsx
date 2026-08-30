import type { CanonicalDuplicateEvidence, IngestEvent, Task } from './domain'
import { buildIngestAudit, SOURCE_LABELS } from './service-source-identity'

function display(value: boolean | null | string): string {
  if (value === true) {
    return '是'
  }

  if (value === false) {
    return '否'
  }

  return value?.trim() || '未设置'
}

export function SourceAudit({
  duplicateEvidence,
  ingestEvents,
  task
}: {
  duplicateEvidence: readonly CanonicalDuplicateEvidence[]
  ingestEvents: readonly IngestEvent[]
  task: Task
}) {
  const audit = buildIngestAudit(task, ingestEvents, duplicateEvidence)

  return (
    <section aria-label="来源 / 摄取记录" className="mt-5 border-t border-(--ui-stroke-quaternary) pt-4">
      <h3 className="text-xs font-medium">来源 / 摄取记录</h3>
      <dl className="mt-3 grid gap-x-4 gap-y-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-(--ui-text-quaternary)">从哪里来</dt>
          <dd className="mt-0.5 text-(--ui-text-secondary)">
            {SOURCE_LABELS[audit.identity.sourceType]} · {display(audit.identity.displayName)}
          </dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">进入系统时间</dt>
          <dd className="mt-0.5 text-(--ui-text-secondary)">{display(audit.identity.receivedAt)}</dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">自动提取 / 提取状态</dt>
          <dd className="mt-0.5 text-(--ui-text-secondary)">
            {display(audit.automaticExtraction)} · {display(audit.extractionState)}
          </dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">人工创建</dt>
          <dd className="mt-0.5 text-(--ui-text-secondary)">{display(audit.manuallyCreated)}</dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">已归入项目</dt>
          <dd className="mt-0.5 text-(--ui-text-secondary)">{display(audit.assignedToProject)}</dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">来源合并 / 重复状态</dt>
          <dd className="mt-0.5 text-(--ui-text-secondary)">
            {display(audit.sourceMerged)} · {audit.duplicate.state.toUpperCase()}
          </dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">Canonical WORK-ID</dt>
          <dd className="mt-0.5 text-(--ui-text-secondary)">{audit.workId}</dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">Source reference</dt>
          <dd className="mt-0.5 break-all text-(--ui-text-secondary)">{display(audit.identity.originReference)}</dd>
        </div>
      </dl>
      {!audit.historyAvailable && (
        <p className="mt-3 rounded-md bg-foreground/4 px-3 py-2 text-[0.6875rem] text-(--ui-text-tertiary)">
          当前任务没有 canonical ingest event；仅展示现有来源事实，没有回填或伪造历史。
        </p>
      )}
      {audit.events.length > 0 && (
        <ol aria-label="摄取事件" className="mt-3 space-y-2">
          {audit.events.map(event => (
            <li className="rounded-md bg-foreground/4 px-3 py-2 text-[0.6875rem]" key={event.eventId}>
              <span className="font-medium">{event.type}</span> · {event.occurredAt} · {event.actor}
              {event.reason ? ` · ${event.reason}` : ''}
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
