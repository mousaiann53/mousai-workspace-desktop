import { Codicon, useQuery } from '@hermes/plugin-sdk'
import { useMemo } from 'react'

import type { Task } from './domain'
import {
  type BriefTask,
  buildAfterWorkBrief,
  buildPlanningHistory,
  type NightPlanItem
} from './service-planning-review'
import {
  readWorkspaceSnapshot,
  type WorkspaceReadTransport,
  WorkspaceTransportUnavailableError
} from './service-workspace-read'

function BriefList({ items, onOpenTask }: { items: readonly BriefTask[]; onOpenTask?: (task: Task) => void }) {
  return items.length ? (
    <ul className="mt-3 space-y-2">
      {items.map(item => (
        <li key={item.task.id}>
          <button
            className="w-full rounded-md border border-(--ui-stroke-quaternary) p-3 text-left hover:bg-(--ui-hover-overlay) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            onClick={() => onOpenTask?.(item.task)}
            type="button"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="text-xs font-medium">{item.task.title}</span>
              <span className="text-[0.6875rem] text-(--ui-text-quaternary)">{item.task.id}</span>
            </div>
            <p className="mt-1 text-[0.6875rem] text-(--ui-text-tertiary)">{item.note}</p>
          </button>
        </li>
      ))}
    </ul>
  ) : (
    <p className="mt-3 text-xs text-(--ui-text-quaternary)">暂无真实数据</p>
  )
}

function BriefCard({
  icon,
  items,
  onOpenTask,
  title
}: {
  icon: string
  items: readonly BriefTask[]
  onOpenTask?: (task: Task) => void
  title: string
}) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-4">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Codicon className="text-(--ui-text-tertiary)" name={icon} size="0.85rem" />
        {title}
        <span className="ml-auto text-[0.6875rem] text-(--ui-text-quaternary)">{items.length}</span>
      </h2>
      <BriefList items={items} onOpenTask={onOpenTask} />
    </section>
  )
}

function NightPlan({ items }: { items: readonly NightPlanItem[] }) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-4">
      <h2 className="text-sm font-medium">下班后计划 / Night Safety</h2>
      <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
        只有低风险、可逆、非禁止且无需人工批准的 AI 任务才可 AUTO_OK。
      </p>
      {items.length ? (
        <ul className="mt-3 space-y-2">
          {items.map(item => (
            <li className="rounded-md border border-(--ui-stroke-quaternary) p-3" key={item.task.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs font-medium">{item.task.title}</div>
                  <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">{item.task.id}</div>
                </div>
                <span className="text-[0.6875rem] text-(--ui-text-tertiary)">{item.safety.state}</span>
              </div>
              <p className="mt-2 text-[0.6875rem] text-(--ui-text-tertiary)">
                {item.safety.reasons.length ? item.safety.reasons.join('；') : '安全证据完整'}
              </p>
              <div className="mt-2 text-[0.6875rem] text-(--ui-text-quaternary)">
                预期产物：{item.expectedOutput ?? '未设置'} · 完成窗口：{item.completionWindow ?? '未设置'} · 成本：
                {item.costEstimate ?? '未设置'}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-(--ui-text-quaternary)">暂无明确由 WorkBuddy 执行的活动任务。</p>
      )}
    </section>
  )
}

function ReviewState({ copy, title }: { copy: string; title: string }) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-6 text-center">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-2 text-xs text-(--ui-text-tertiary)">{copy}</p>
    </section>
  )
}

export function PlanningReview({
  gatewayState,
  onOpenTask,
  transport
}: {
  gatewayState: string
  onOpenTask?: (task: Task) => void
  transport: WorkspaceReadTransport
}) {
  const result = useQuery({
    queryKey: ['mousai-workspace', 'planning-review', transport.scope],
    queryFn: ({ signal }) => readWorkspaceSnapshot(transport, { signal }),
    enabled: gatewayState === 'open',
    refetchOnMount: 'always',
    retry: false,
    staleTime: 0
  })

  const brief = useMemo(() => (result.data ? buildAfterWorkBrief(result.data.snapshot) : null), [result.data])
  const history = useMemo(() => (result.data ? buildPlanningHistory(result.data.snapshot) : []), [result.data])

  if (gatewayState !== 'open') {
    return <ReviewState copy="Gateway 恢复后将重新读取 canonical snapshot。" title="等待 Gateway 连接" />
  }

  if (result.isPending || result.isFetching) {
    return <ReviewState copy="正在读取任务与 Production 历史。" title="正在生成复盘" />
  }

  if (result.isError || !brief) {
    const unavailable = result.error instanceof WorkspaceTransportUnavailableError

    return (
      <ReviewState
        copy={unavailable ? '当前安全只读链路尚未接通；未展示缓存或 Demo 数据。' : '读取失败；未展示过期事实。'}
        title={unavailable ? '安全只读链路尚未接通' : '复盘读取失败'}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <BriefCard icon="pass-filled" items={brief.completedToday} onOpenTask={onOpenTask} title="今日完成" />
        <BriefCard icon="clock" items={brief.delayed} onOpenTask={onOpenTask} title="延期 / 逾期" />
        <BriefCard icon="warning" items={brief.risks} onOpenTask={onOpenTask} title="阻塞与风险" />
        <BriefCard icon="calendar" items={brief.tomorrow} onOpenTask={onOpenTask} title="明日重点" />
        <BriefCard icon="hubot" items={brief.aiCompleted} onOpenTask={onOpenTask} title="AI 今日完成" />
      </div>

      <NightPlan items={brief.nightPlans} />

      <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-4">
        <h2 className="text-sm font-medium">AI 贡献与成本</h2>
        <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>人工完成：{brief.aiContribution.HUMAN || '未设置'}</div>
          <div>AI 辅助：{brief.aiContribution.AI_ASSISTED || '未设置'}</div>
          <div>AI 主做：{brief.aiContribution.AI_PRIMARY || '未设置'}</div>
          <div>AI 全自动：{brief.aiContribution.AI_AUTONOMOUS || '未设置'}</div>
          <div>今日 API 成本：{brief.apiCostToday ?? '未设置'}</div>
          <div>今晚预计新增成本：{brief.nightEstimatedCost ?? '未设置'}</div>
        </div>
        <p className="mt-3 text-[0.6875rem] text-(--ui-text-quaternary)">
          成本仅接受 canonical usage ledger；没有数据时不显示 0 元。
        </p>
      </section>

      <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-4">
        <h2 className="text-sm font-medium">Planning History</h2>
        <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
          Production events 为 append-only；原始 DDL 与改期次数等待正式 planning history contract。
        </p>
        {history.length ? (
          <ul className="mt-3 space-y-2">
            {history.map(item => (
              <li className="rounded-md border border-(--ui-stroke-quaternary) p-3" key={item.workId}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-medium">{item.title}</div>
                    <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">{item.workId}</div>
                  </div>
                  <span className="text-[0.6875rem] text-(--ui-text-tertiary)">
                    Revision {item.revision ?? '未设置'}
                  </span>
                </div>
                <div className="mt-2 grid gap-2 text-[0.6875rem] text-(--ui-text-tertiary) sm:grid-cols-2 lg:grid-cols-4">
                  <span>当前 DDL：{item.currentDeadline ?? '未设置'}</span>
                  <span>原始 DDL：{item.originalDeadline ?? '未设置'}</span>
                  <span>改期次数：{item.rescheduleCount ?? '未设置'}</span>
                  <span>实际完成：{item.actualCompletionAt ?? '未设置'}</span>
                </div>
                {item.events.length > 0 && (
                  <ol className="mt-3 border-l border-(--ui-stroke-quaternary) pl-3">
                    {item.events.map((event, index) => (
                      <li className="py-1 text-[0.6875rem] text-(--ui-text-tertiary)" key={`${item.workId}:${index}`}>
                        {event.at ?? '时间未设置'} · {event.label} · {event.actor ?? '执行者未设置'}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-(--ui-text-quaternary)">暂无可读历史。</p>
        )}
      </section>
    </div>
  )
}
