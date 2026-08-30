import { Codicon, useQuery } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import { DailyTimeline } from './daily-timeline'
import { PlanningPreview } from './planning-preview'
import type { AgendaItem } from './service-planning-calendar'
import {
  agendaItemsForView,
  buildAgendaItems,
  type CalendarView,
  PLANNING_TIME_ZONE,
  planningDateKey
} from './service-planning-calendar'
import type { WorkspacePlanningMutationTransport } from './service-planning-mutation'
import {
  readWorkspaceSnapshot,
  type WorkspaceReadTransport,
  WorkspaceTransportUnavailableError
} from './service-workspace-read'

const VIEWS: readonly { readonly id: CalendarView; readonly label: string }[] = [
  { id: 'today', label: '今天' },
  { id: 'week', label: '本周' },
  { id: 'month', label: '本月' },
  { id: 'agenda', label: 'Agenda' }
]

function dateTime(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '时间未设置'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: PLANNING_TIME_ZONE
  }).format(date)
}

function AgendaRow({ item, onOpen }: { item: AgendaItem; onOpen?: (item: AgendaItem) => void }) {
  const label = {
    production_event: '生产事件',
    project_deadline: '项目日期',
    schedule_block: '正式排程',
    task_deadline: '任务 DDL',
    workspace_event: '正式日程'
  }[item.kind]

  return (
    <li className="border-t border-(--ui-stroke-quaternary) py-3 first:border-t-0 first:pt-0">
      <button
        className="flex w-full min-w-0 flex-col items-start justify-between gap-2 rounded-md p-1 text-left hover:bg-(--ui-hover-overlay) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:flex-row sm:gap-4"
        onClick={() => onOpen?.(item)}
        type="button"
      >
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">{item.title}</div>
          <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
            {label} · {item.source}
          </div>
        </div>
        <time className="shrink-0 text-[0.6875rem] text-(--ui-text-tertiary)" dateTime={item.startsAt}>
          {dateTime(item.startsAt)}
        </time>
      </button>
    </li>
  )
}

function CalendarState({ copy, title }: { copy: string; title: string }) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-6 text-center">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-2 text-xs text-(--ui-text-tertiary)">{copy}</p>
    </section>
  )
}

export function PlanningCalendar({
  gatewayState,
  onOpenItem,
  onOpenTask,
  transport
}: {
  gatewayState: string
  onOpenItem?: (item: AgendaItem) => void
  onOpenTask?: (workId: string, projectId: string | null) => void
  transport: WorkspaceReadTransport & WorkspacePlanningMutationTransport
}) {
  const [view, setView] = useState<CalendarView>('today')

  const result = useQuery({
    queryKey: ['mousai-workspace', 'planning-calendar', transport.scope],
    queryFn: ({ signal }) => readWorkspaceSnapshot(transport, { signal }),
    enabled: gatewayState === 'open',
    refetchOnMount: 'always',
    retry: false,
    staleTime: 0
  })

  const agenda = useMemo(
    () => (result.data ? agendaItemsForView(buildAgendaItems(result.data.snapshot), view) : []),
    [result.data, view]
  )

  const grouped = useMemo(() => {
    const result = new Map<string, AgendaItem[]>()

    for (const item of agenda) {
      const key = planningDateKey(item.startsAt) ?? '日期未设置'
      const entries = result.get(key) ?? []
      entries.push(item)
      result.set(key, entries)
    }

    return result
  }, [agenda])

  if (gatewayState !== 'open') {
    return <CalendarState copy="Gateway 恢复后将重新读取 canonical snapshot。" title="等待 Gateway 连接" />
  }

  if (result.isPending || result.isFetching) {
    return <CalendarState copy="正在读取正式 DDL、项目日期与生产事件。" title="正在读取日程" />
  }

  if (result.isError) {
    const unavailable = result.error instanceof WorkspaceTransportUnavailableError

    return (
      <CalendarState
        copy={unavailable ? '当前安全只读链路尚未接通；未展示缓存或 Demo 数据。' : '读取失败；未展示过期事实。'}
        title={unavailable ? '安全只读链路尚未接通' : '日程读取失败'}
      />
    )
  }

  if (!result.data) {
    return <CalendarState copy="snapshot 没有返回可用事实。" title="暂无日程数据" />
  }

  return (
    <div className="space-y-4">
      <DailyTimeline onOpenTask={onOpenTask} snapshot={result.data.snapshot} />
      <PlanningPreview
        onRefetch={async () => {
          await result.refetch()
        }}
        snapshot={result.data.snapshot}
        transport={transport}
      />

      <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Codicon className="text-(--ui-text-tertiary)" name="calendar" size="0.85rem" />
              日程 / Agenda
            </h2>
            <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">时区：Asia/Shanghai</p>
          </div>
          <div
            aria-label="日程范围"
            className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-(--ui-stroke-quaternary) p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
          >
            {VIEWS.map(item => (
              <button
                aria-selected={view === item.id}
                className={`shrink-0 rounded px-2.5 py-1 text-xs ${
                  view === item.id
                    ? 'bg-(--ui-hover-overlay) text-foreground'
                    : 'text-(--ui-text-tertiary) hover:text-foreground'
                }`}
                key={item.id}
                onClick={() => setView(item.id)}
                role="tab"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {agenda.length ? (
          <div className="mt-4 space-y-4">
            {[...grouped.entries()].map(([key, items]) => (
              <section key={key}>
                <h3 className="mb-2 text-xs font-medium text-(--ui-text-secondary)">{key}</h3>
                <ul>
                  {items.map(item => (
                    <AgendaRow item={item} key={item.id} onOpen={onOpenItem} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs text-(--ui-text-quaternary)">当前范围没有正式日程事实。</p>
        )}
      </section>
    </div>
  )
}
