import { Codicon } from '@hermes/plugin-sdk'

import type { WorkspaceSnapshot } from './domain'
import { buildDailyTimeline } from './service-planning-calendar'

function value(value: string | null): string {
  return value?.trim() || '未设置'
}

export function DailyTimeline({
  onOpenTask,
  snapshot
}: {
  onOpenTask?: (workId: string, projectId: string | null) => void
  snapshot: WorkspaceSnapshot
}) {
  const items = buildDailyTimeline(snapshot)

  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Codicon className="text-(--ui-text-tertiary)" name="timeline-view-icon" size="0.85rem" />
          今日时间轴
        </h2>
        <span className="text-[0.6875rem] text-(--ui-text-quaternary)">Asia/Shanghai · {items.length}</span>
      </div>

      {items.length ? (
        <ol className="mt-3 space-y-2">
          {items.map(item => (
            <li className="relative border-l border-(--ui-stroke-quaternary) pl-4" key={item.task.id}>
              <span className="absolute -left-1 top-2 size-2 rounded-full bg-(--ui-text-quaternary)" />
              <button
                className="w-full rounded-md p-2 text-left hover:bg-(--ui-hover-overlay) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={() => onOpenTask?.(item.task.id, item.projectId)}
                type="button"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{item.task.title}</div>
                    <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
                      {item.task.id} · {value(item.projectName)}
                    </div>
                  </div>
                  <span className="shrink-0 text-[0.6875rem] text-(--ui-text-tertiary)">{item.timeRange}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-(--ui-text-tertiary)">
                  <span>预计 {item.estimatedDuration ?? '未估算'}</span>
                  <span>执行者 {value(item.task.executor)}</span>
                  <span>下一步 {value(item.task.nextAction)}</span>
                  {item.blockingState && <span>阻塞 {item.blockingState}</span>}
                </div>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-xs text-(--ui-text-quaternary)">今天没有带正式 DDL 的未完成任务。</p>
      )}
    </section>
  )
}
