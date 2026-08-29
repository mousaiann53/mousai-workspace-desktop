import type { ProductionEvent, ProductionReview } from './domain'

function display(value: null | number | string): string {
  return value === null || value === '' ? '未设置' : String(value)
}

function eventDetails(event: ProductionEvent): readonly string[] {
  return [
    event.actor ? `Actor：${event.actor}` : null,
    event.approvedScopeVersion === null ? null : `Scope v${event.approvedScopeVersion}`,
    event.revision === null ? null : `Revision r${event.revision}`,
    event.manifestVersion ? `Manifest ${event.manifestVersion}` : null,
    event.revisionReason ? `Reason：${event.revisionReason}` : null,
    event.reviewerComment ? `Reviewer：${event.reviewerComment}` : null,
    event.acceptance ? `Acceptance：${event.acceptance.verdict}` : null,
    event.acceptance?.reviewerComment ? `Comment：${event.acceptance.reviewerComment}` : null,
    event.note ? `Note：${event.note}` : null
  ].filter((item): item is string => item !== null)
}

export function ProductionHistory({ review }: { review: ProductionReview | null }) {
  if (!review || (!review.scopeHistory.length && !review.events.length)) {
    return <p className="text-xs text-(--ui-text-tertiary)">尚无 canonical scope / production history。</p>
  }

  return (
    <div aria-label="Revision / Acceptance History" className="space-y-4">
      <div>
        <h4 className="text-xs font-medium">Scope approval history</h4>
        {review.scopeHistory.length ? (
          <ol className="mt-2 space-y-2">
            {review.scopeHistory.map(scope => (
              <li className="rounded-md border border-(--ui-stroke-quaternary) p-3 text-xs" key={scope.scopeHash}>
                <div className="font-medium">Scope v{scope.version}</div>
                <div className="mt-1 text-(--ui-text-tertiary)">
                  {scope.approvedBy} · {scope.approvedAt}
                </div>
                <div className="mt-1 text-(--ui-text-secondary)">{scope.items.join('；')}</div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-(--ui-text-tertiary)">未设置</p>
        )}
      </div>

      <div>
        <h4 className="text-xs font-medium">Append-only production events</h4>
        {review.events.length ? (
          <ol className="mt-2 space-y-2">
            {review.events.map((event, index) => {
              const details = eventDetails(event)

              return (
                <li
                  className="rounded-md border border-(--ui-stroke-quaternary) p-3 text-xs"
                  key={`${index}:${event.at ?? 'unset'}:${event.state ?? 'event'}`}
                >
                  <div className="font-medium">
                    {index + 1}. {display(event.state)}
                  </div>
                  <div className="mt-1 text-(--ui-text-tertiary)">{display(event.at)}</div>
                  <div className="mt-1 text-(--ui-text-secondary)">
                    {details.length ? details.join(' · ') : '未设置'}
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-(--ui-text-tertiary)">未设置</p>
        )}
      </div>
    </div>
  )
}
