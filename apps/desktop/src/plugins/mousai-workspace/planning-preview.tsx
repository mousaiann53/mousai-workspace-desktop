import { Codicon } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import type { WorkspaceSnapshot } from './domain'
import {
  buildCapacitySummary,
  buildSchedulingProposals,
  type PlanningHorizon,
  type SchedulingProposal
} from './service-scheduling'

const HORIZONS: readonly { readonly id: PlanningHorizon; readonly label: string }[] = [
  { id: 'today', label: '今天' },
  { id: 'tomorrow', label: '明天' },
  { id: 'week', label: '本周' }
]

function display(value: string | null): string {
  return value?.trim() || '未设置'
}

function proposalInHorizon(proposal: SchedulingProposal, horizon: PlanningHorizon, now: Date): boolean {
  if (horizon === 'week') {
    return true
  }

  const target = new Date(now)
  target.setUTCDate(target.getUTCDate() + (horizon === 'tomorrow' ? 1 : 0))

  const targetKey = new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'short',
    timeZone: 'Asia/Shanghai'
  }).format(target)

  const deadlineKey = proposal.deadline
    ? new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: 'Asia/Shanghai' }).format(
        new Date(proposal.deadline)
      )
    : null

  return deadlineKey === targetKey
}

function ProposalCard({ proposal }: { proposal: SchedulingProposal }) {
  return (
    <article className="rounded-md border border-(--ui-stroke-quaternary) p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-xs font-medium">{proposal.title}</h3>
          <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">{proposal.workId}</p>
        </div>
        <span className="text-[0.6875rem] text-(--ui-text-tertiary)">
          {proposal.proposedStart && proposal.proposedEnd
            ? `${proposal.proposedStart} → ${proposal.proposedEnd}`
            : '尚未形成可提交时段'}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-[0.6875rem] sm:grid-cols-2">
        <div>
          <dt className="text-(--ui-text-quaternary)">执行者</dt>
          <dd className="mt-0.5 text-(--ui-text-secondary)">{display(proposal.executor)}</dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">预计工时</dt>
          <dd className="mt-0.5 text-(--ui-text-secondary)">
            {proposal.estimatedMinutes === null ? '未估算' : `${proposal.estimatedMinutes} 分钟`}
          </dd>
        </div>
      </dl>
      <div className="mt-3 rounded-md bg-(--ui-hover-overlay) px-3 py-2 text-[0.6875rem] text-(--ui-text-tertiary)">
        {proposal.rationale.length ? proposal.rationale.join('；') : '依据正式 DDL、工时、执行者与占用时段生成。'}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {['接受', '调整', '忽略'].map(action => (
          <button
            className="rounded-md border border-(--ui-stroke-quaternary) px-2.5 py-1 text-[0.6875rem] text-(--ui-text-quaternary) disabled:cursor-not-allowed disabled:opacity-60"
            disabled
            key={action}
            title="schedule_mutation 写合同尚未提供"
            type="button"
          >
            {action}
          </button>
        ))}
      </div>
    </article>
  )
}

export function PlanningPreview({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const [horizon, setHorizon] = useState<PlanningHorizon>('today')
  const now = useMemo(() => new Date(), [])
  const capacity = buildCapacitySummary(snapshot, horizon === 'week' ? 'week' : 'today', now)

  const proposals = useMemo(
    () =>
      buildSchedulingProposals(snapshot, {
        now,
        horizonEnd: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        scheduleBlocks: null,
        dependencies: null,
        workdayStartHour: 9,
        workdayEndHour: 18
      }),
    [now, snapshot]
  )

  const visible = proposals.filter(proposal => proposalInHorizon(proposal, horizon, now))

  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Codicon className="text-(--ui-text-tertiary)" name="wand" size="0.85rem" />
            排程建议预览
          </h2>
          <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
            确定性规则 · 18:00 工作边界 · 所有提交均需人工批准
          </p>
        </div>
        <div
          aria-label="排程建议范围"
          className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-(--ui-stroke-quaternary) p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
        >
          {HORIZONS.map(item => (
            <button
              aria-selected={horizon === item.id}
              className={`shrink-0 rounded px-2.5 py-1 text-xs ${
                horizon === item.id
                  ? 'bg-(--ui-hover-overlay) text-foreground'
                  : 'text-(--ui-text-tertiary) hover:text-foreground'
              }`}
              key={item.id}
              onClick={() => setHorizon(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-(--ui-text-quaternary)">任务</dt>
          <dd className="mt-1">{capacity.taskCount}</dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">已知工时</dt>
          <dd className="mt-1">{capacity.knownEstimateMinutes} 分钟</dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">未估算</dt>
          <dd className="mt-1">{capacity.unknownEstimateCount}</dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">可用容量</dt>
          <dd className="mt-1">未设置</dd>
        </div>
      </dl>

      <div className="mt-4 rounded-md border border-(--ui-stroke-quaternary) px-3 py-2 text-xs text-(--ui-text-tertiary)">
        schedule_blocks、task_dependencies 与 schedule_mutation canonical contract
        尚未提供；当前仅展示可审计预览，不写入本地事实。
      </div>

      <div className="mt-4 space-y-3">
        {visible.length ? (
          visible.map(proposal => <ProposalCard key={proposal.workId} proposal={proposal} />)
        ) : (
          <p className="text-xs text-(--ui-text-quaternary)">当前范围没有可规划任务。</p>
        )}
      </div>
    </section>
  )
}
