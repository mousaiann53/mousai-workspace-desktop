import { Button, Codicon, Input, Textarea } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import type { PlanningProposal, WorkspaceSnapshot } from './domain'
import { planningClientRequestId, type WorkspacePlanningMutationTransport } from './service-planning-mutation'
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

function localInput(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {return ''}

  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'Asia/Shanghai'
  }).formatToParts(date)

  const valueOf = (type: string) => parts.find(item => item.type === type)?.value ?? ''

  return `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}T${valueOf('hour')}:${valueOf('minute')}`
}

function shanghaiIso(value: string): string {
  return value ? `${value}:00+08:00` : ''
}

function proposalInHorizon(proposal: SchedulingProposal, horizon: PlanningHorizon, now: Date): boolean {
  if (horizon === 'week') {return true}
  const target = new Date(now)
  target.setUTCDate(target.getUTCDate() + (horizon === 'tomorrow' ? 1 : 0))
  const format = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: 'Asia/Shanghai' })

  return proposal.deadline ? format.format(new Date(proposal.deadline)) === format.format(target) : false
}

function PreviewCard({
  proposal,
  transport,
  onRefetch
}: {
  proposal: SchedulingProposal
  transport: WorkspacePlanningMutationTransport
  onRefetch: () => Promise<unknown>
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const canSubmit = Boolean(proposal.proposedStart && proposal.proposedEnd && proposal.estimatedMinutes)

  async function submit() {
    if (!proposal.proposedStart || !proposal.proposedEnd || !proposal.estimatedMinutes) {return}
    setPending(true)
    setError(null)

    try {
      await transport.registerPlanningProposal({
        clientRequestId: planningClientRequestId(
          'register',
          proposal.workId,
          proposal.proposedStart,
          proposal.proposedEnd,
          proposal.estimatedMinutes
        ),
        workId: proposal.workId,
        startsAt: proposal.proposedStart,
        endsAt: proposal.proposedEnd,
        executor: proposal.executor,
        estimatedDurationMinutes: proposal.estimatedMinutes,
        actor: 'Mousai'
      })
      await onRefetch()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '提交排程建议失败。')
    } finally {
      setPending(false)
    }
  }

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
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      <Button
        className="mt-3"
        disabled={!canSubmit || pending}
        onClick={() => void submit()}
        size="sm"
        type="button"
        variant="outline"
      >
        {pending ? '提交中…' : '提交建议'}
      </Button>
    </article>
  )
}

function CanonicalProposalCard({
  proposal,
  transport,
  onRefetch
}: {
  proposal: PlanningProposal
  transport: WorkspacePlanningMutationTransport
  onRefetch: () => Promise<unknown>
}) {
  const [mode, setMode] = useState<'adjust' | 'ignore' | null>(null)
  const [startsAt, setStartsAt] = useState(localInput(proposal.startsAt))
  const [endsAt, setEndsAt] = useState(localInput(proposal.endsAt))
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function mutate(action: 'accept' | 'adjust' | 'ignore') {
    setPending(true)
    setError(null)

    try {
      const meta = {
        clientRequestId: planningClientRequestId(
          action,
          proposal.proposalId,
          proposal.proposalRevision,
          action === 'adjust' ? startsAt : reason
        ),
        expectedRevision: proposal.proposalRevision,
        actor: 'Mousai'
      }

      if (action === 'accept') {await transport.acceptPlanningProposal(proposal.proposalId, meta)}

      if (action === 'adjust') {
        await transport.adjustPlanningProposal(proposal.proposalId, {
          ...meta,
          startsAt: shanghaiIso(startsAt),
          endsAt: shanghaiIso(endsAt),
          reason: reason.trim()
        })
      }

      if (action === 'ignore') {
        await transport.ignorePlanningProposal(proposal.proposalId, { ...meta, reason: reason.trim() })
      }

      setMode(null)
      setReason('')
      await onRefetch()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '排程操作失败。')
    } finally {
      setPending(false)
    }
  }

  return (
    <article className="rounded-md border border-(--ui-stroke-quaternary) p-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h3 className="text-xs font-medium">{proposal.workId}</h3>
          <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
            {proposal.proposalId} · revision {proposal.proposalRevision}
          </p>
        </div>
        <span className="text-[0.6875rem] text-(--ui-text-secondary)">{proposal.status}</span>
      </div>
      <p className="mt-3 text-xs text-(--ui-text-secondary)">
        {proposal.startsAt} → {proposal.endsAt}
      </p>
      <p className="mt-1 text-[0.6875rem] text-(--ui-text-tertiary)">
        {display(proposal.executor)} · {proposal.estimatedDurationMinutes} 分钟
      </p>
      {proposal.status === 'pending' && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button disabled={pending} onClick={() => void mutate('accept')} size="sm" type="button">
            接受
          </Button>
          <Button disabled={pending} onClick={() => setMode('adjust')} size="sm" type="button" variant="outline">
            调整
          </Button>
          <Button disabled={pending} onClick={() => setMode('ignore')} size="sm" type="button" variant="outline">
            忽略
          </Button>
        </div>
      )}
      {mode && (
        <div className="mt-3 space-y-2 rounded-md bg-(--ui-hover-overlay) p-3">
          {mode === 'adjust' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="调整开始时间"
                onChange={event => setStartsAt(event.target.value)}
                type="datetime-local"
                value={startsAt}
              />
              <Input
                aria-label="调整结束时间"
                onChange={event => setEndsAt(event.target.value)}
                type="datetime-local"
                value={endsAt}
              />
            </div>
          )}
          <Textarea
            aria-label={mode === 'adjust' ? '调整原因' : '忽略原因'}
            onChange={event => setReason(event.target.value)}
            placeholder="填写原因（必填）"
            value={reason}
          />
          <div className="flex gap-2">
            <Button
              disabled={pending || !reason.trim() || (mode === 'adjust' && (!startsAt || !endsAt))}
              onClick={() => void mutate(mode)}
              size="sm"
              type="button"
            >
              确认{mode === 'adjust' ? '调整' : '忽略'}
            </Button>
            <Button disabled={pending} onClick={() => setMode(null)} size="sm" type="button" variant="ghost">
              取消
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </article>
  )
}

export function PlanningPreview({
  snapshot,
  transport,
  onRefetch
}: {
  snapshot: WorkspaceSnapshot
  transport: WorkspacePlanningMutationTransport
  onRefetch: () => Promise<unknown>
}) {
  const [horizon, setHorizon] = useState<PlanningHorizon>('today')
  const now = useMemo(() => new Date(), [])
  const capacity = buildCapacitySummary(snapshot, horizon === 'week' ? 'week' : 'today', now)

  const scheduleBlocks = useMemo(
    () => [...(snapshot.scheduleBlocks ?? []), ...(snapshot.fixedEvents ?? [])],
    [snapshot.fixedEvents, snapshot.scheduleBlocks]
  )

  const proposals = useMemo(
    () =>
      buildSchedulingProposals(snapshot, {
        now,
        horizonEnd: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        scheduleBlocks,
        dependencies: null,
        workdayStartHour: 9,
        workdayEndHour: 18
      }),
    [now, scheduleBlocks, snapshot]
  )

  const visible = proposals.filter(proposal => proposalInHorizon(proposal, horizon, now))
  const canonical = snapshot.planningProposals ?? []

  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Codicon className="text-(--ui-text-tertiary)" name="wand" size="0.85rem" />
            排程建议
          </h2>
          <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
            确定性规则 · 18:00 工作边界 · 接受必须由 Mousai 明确确认
          </p>
        </div>
        <div
          aria-label="排程建议范围"
          className="flex max-w-full gap-1 overflow-x-auto rounded-md border border-(--ui-stroke-quaternary) p-1"
          role="tablist"
        >
          {HORIZONS.map(item => (
            <button
              aria-selected={horizon === item.id}
              className={`shrink-0 rounded px-2.5 py-1 text-xs ${horizon === item.id ? 'bg-(--ui-hover-overlay) text-foreground' : 'text-(--ui-text-tertiary) hover:text-foreground'}`}
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
          <dt className="text-(--ui-text-quaternary)">已占用</dt>
          <dd className="mt-1">{capacity.scheduledMinutes} 分钟</dd>
        </div>
        <div>
          <dt className="text-(--ui-text-quaternary)">可用容量</dt>
          <dd className="mt-1">{capacity.availableMinutes} 分钟</dd>
        </div>
      </dl>
      {canonical.length > 0 && (
        <div className="mt-4 space-y-3">
          <h3 className="text-xs font-medium">正式建议</h3>
          {canonical.map(proposal => (
            <CanonicalProposalCard
              key={proposal.proposalId}
              onRefetch={onRefetch}
              proposal={proposal}
              transport={transport}
            />
          ))}
        </div>
      )}
      <div className="mt-4 space-y-3">
        <h3 className="text-xs font-medium">可提交预览</h3>
        {visible.length ? (
          visible.map(proposal => (
            <PreviewCard key={proposal.workId} onRefetch={onRefetch} proposal={proposal} transport={transport} />
          ))
        ) : (
          <p className="text-xs text-(--ui-text-quaternary)">当前范围没有可规划任务。</p>
        )}
      </div>
    </section>
  )
}
