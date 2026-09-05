import { Button, Input, useQuery, useQueryClient } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import type { BackupStatusRecord, Project, WorkspaceSnapshot } from './domain'
import { PlanningReview } from './planning-review'
import {
  buildAiContribution,
  buildPlanActualRows,
  buildProjectReview,
  buildReviewSummary,
  RELEASE_READINESS_FOUNDATION,
  type ReviewScope
} from './service-review-cost'
import { WorkspaceSettingsError } from './service-settings'
import type { WorkspaceSettingsTransport } from './service-settings'
import {
  readWorkspaceSnapshot,
  type WorkspaceReadTransport,
  WorkspaceTransportUnavailableError
} from './service-workspace-read'

export type ReviewFoundationSurface =
  'backup' | 'brief' | 'cost' | 'providers' | 'release' | 'review' | 'security' | 'settings'

const SURFACES: readonly { id: ReviewFoundationSurface; label: string }[] = [
  { id: 'review', label: '复盘中心' },
  { id: 'brief', label: '下班简报' },
  { id: 'cost', label: 'AI 用量与成本' },
  { id: 'providers', label: 'Provider' },
  { id: 'security', label: '安全中心' },
  { id: 'backup', label: '备份与恢复' },
  { id: 'release', label: 'Release Readiness' },
  { id: 'settings', label: '设置' }
]

const REVIEW_SCOPES: readonly { id: ReviewScope; label: string }[] = [
  { id: 'today', label: '今日复盘' },
  { id: 'week', label: '周复盘' },
  { id: 'month', label: '月复盘' },
  { id: 'project', label: '项目复盘' }
]

function display(value: null | number | string): string {
  return value === null || value === '' ? '未设置' : String(value)
}

function FoundationState({ copy, title }: { copy: string; title: string }) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-6 text-center">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-2 text-xs leading-5 text-(--ui-text-tertiary)">{copy}</p>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: null | number | string }) {
  return (
    <div className="rounded-lg border border-(--ui-stroke-quaternary) p-3">
      <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">{label}</dt>
      <dd className="mt-1 break-words text-sm">{display(value)}</dd>
    </div>
  )
}

function ReviewCenter({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const [scope, setScope] = useState<ReviewScope>('today')
  const [projectId, setProjectId] = useState(snapshot.projects[0]?.id ?? '')

  const summary = useMemo(
    () => buildReviewSummary(snapshot, scope, { projectId: scope === 'project' ? projectId : null }),
    [projectId, scope, snapshot]
  )

  const planActual = useMemo(
    () => buildPlanActualRows(snapshot, scope === 'project' ? projectId : null),
    [projectId, scope, snapshot]
  )

  const contribution = useMemo(
    () => buildAiContribution(snapshot, scope === 'project' ? projectId : null),
    [projectId, scope, snapshot]
  )

  return (
    <div className="space-y-5">
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {REVIEW_SCOPES.map(item => (
          <Button
            aria-pressed={scope === item.id}
            key={item.id}
            onClick={() => setScope(item.id)}
            size="sm"
            variant={scope === item.id ? 'default' : 'secondary'}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {scope === 'project' && (
        <label className="block max-w-sm text-xs">
          <span className="mb-1 block text-(--ui-text-tertiary)">项目</span>
          <select
            aria-label="复盘项目"
            className="h-9 w-full rounded-md border border-(--ui-stroke-quaternary) bg-transparent px-2"
            onChange={event => setProjectId(event.target.value)}
            value={projectId}
          >
            {snapshot.projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {!summary.historySufficient && scope !== 'project' && (
        <FoundationState
          copy="当前没有足够的 canonical completion/review history；没有使用 updatedAt 冒充完成时间。"
          title="历史数据不足以统计"
        />
      )}

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="完成任务" value={summary.completedTasks} />
        <Metric label="未完成任务" value={summary.unfinishedTasks} />
        <Metric label="延期 / 逾期" value={summary.overdueTasks} />
        <Metric label="当前 blocker" value={summary.blockers} />
        <Metric label="等待 Mousai 审阅" value={summary.waitingReview} />
        <Metric label="已接受 Deliverable" value={summary.acceptedDeliverables} />
        <Metric label="Revision 次数" value={summary.revisions} />
        <Metric label="当前活跃项目" value={summary.activeProjects} />
      </dl>

      <section className="rounded-lg border border-(--ui-stroke-quaternary) p-4">
        <h2 className="text-sm font-medium">计划 vs 实际</h2>
        <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
          仅展示 canonical evidence；计划 DDL、排时、实际时长与改期次数缺失时保持 unavailable。
        </p>
        {planActual.length ? (
          <ul className="mt-3 space-y-2">
            {planActual.map(item => (
              <li className="min-w-0 rounded-md border border-(--ui-stroke-quaternary) p-3" key={item.task.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{item.task.title}</div>
                    <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">{item.task.id}</div>
                  </div>
                  <span className="text-[0.6875rem] text-(--ui-text-tertiary)">
                    实际完成 {display(item.actualCompletion)}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-[0.6875rem] text-(--ui-text-tertiary) sm:grid-cols-2 lg:grid-cols-4">
                  <span>Planned DDL：{display(item.plannedDeadline)}</span>
                  <span>Current DDL：{display(item.currentDeadline)}</span>
                  <span>Scheduled：{display(item.scheduledTime)}</span>
                  <span>Estimated：{display(item.estimatedDuration)}</span>
                  <span>Actual duration：{display(item.actualDuration)}</span>
                  <span>Reschedule：{display(item.rescheduleCount)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-(--ui-text-quaternary)">暂无真实任务。</p>
        )}
      </section>

      <section className="rounded-lg border border-(--ui-stroke-quaternary) p-4">
        <h2 className="text-sm font-medium">AI 贡献</h2>
        <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
          只依据 production provenance 与 Manifest；任务来自 AI 系统本身不构成 AI 主做证据。
        </p>
        {contribution.length ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {contribution.map(item => (
              <li className="rounded-md border border-(--ui-stroke-quaternary) p-3" key={item.workId}>
                <div className="flex flex-wrap justify-between gap-2 text-xs">
                  <span className="font-medium">{item.title}</span>
                  <span>{item.state}</span>
                </div>
                <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">{item.workId}</div>
                <p className="mt-2 text-[0.6875rem] text-(--ui-text-tertiary)">
                  {item.evidence.length ? item.evidence.join('；') : '证据不足'}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-(--ui-text-quaternary)">暂无真实任务。</p>
        )}
      </section>
    </div>
  )
}

function formatMinutes(value: number | null): string {
  return value === null ? '未设置' : `${value} 分钟`
}

function CostCenter({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  if (!snapshot.providerUsage || !snapshot.usageLedger) {
    return (
      <FoundationState
        copy="usageLedger 尚未进入 canonical snapshot。Desktop 不读取 Provider Secret、不请求 billing API，也不扫描日志造成本事实。"
        title="AI 用量与成本 unavailable"
      />
    )
  }

  const totalTokens = snapshot.usageLedger.reduce((sum, entry) => sum + entry.totalTokens, 0)
  const totalRequests = snapshot.usageLedger.reduce((sum, entry) => sum + entry.requests, 0)

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Ledger 条目（快照内）" value={snapshot.usageLedger.length} />
        <Metric label="Ledger 条目（全量）" value={snapshot.usageLedgerTotal ?? null} />
        <Metric label="请求合计" value={totalRequests} />
        <Metric label="Token 合计" value={totalTokens} />
      </dl>
      <section className="rounded-lg border border-(--ui-stroke-quaternary) p-4">
        <h2 className="text-sm font-medium">按 Provider / Model 的实际用量（近 30 日）</h2>
        {snapshot.providerUsage.length ? (
          <ul className="mt-3 space-y-2">
            {snapshot.providerUsage.slice(0, 20).map(rollup => (
              <li
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-(--ui-stroke-quaternary) p-3 text-[0.6875rem]"
                key={`${rollup.periodStart}:${rollup.provider}:${rollup.model}:${rollup.workId ?? ''}`}
              >
                <span className="font-medium">
                  {rollup.provider} · {rollup.model}
                  {rollup.workId ? ` · ${rollup.workId}` : ''}
                </span>
                <span className="text-(--ui-text-tertiary)">
                  {rollup.periodStart.slice(0, 10)} · {rollup.requests} 请求 · {rollup.tokens} tokens ·
                  实际计数（无成本换算）
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-(--ui-text-quaternary)">
            Ledger 目前没有真实用量条目；等待网关按 ingestion 契约写入。
          </p>
        )}
        <p className="mt-3 text-[0.6875rem] text-(--ui-text-tertiary)">
          costAttribution 保持不可用：没有核准的定价来源，token 数不等于账单。
        </p>
      </section>
    </div>
  )
}

function ProviderCenter({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  if (!snapshot.providerUsage) {
    return (
      <FoundationState
        copy="当前 snapshot 没有 canonical providerUsage / providerCredit。未写死 Gemini、DeepSeek 或任何赠金额度，也没有把配置中出现过的 Provider 当成健康事实。"
        title="Provider 状态 unavailable"
      />
    )
  }

  const byProvider = new Map<string, { requests: number; tokens: number }>()

  for (const rollup of snapshot.providerUsage) {
    const current = byProvider.get(rollup.provider) ?? { requests: 0, tokens: 0 }
    current.requests += rollup.requests
    current.tokens += rollup.tokens
    byProvider.set(rollup.provider, current)
  }

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...byProvider.entries()].map(([provider, totals]) => (
          <Metric
            key={provider}
            label={`${provider} · requests / tokens`}
            value={`${totals.requests} / ${totals.tokens}`}
          />
        ))}
        {byProvider.size === 0 && <Metric label="Provider 用量" value={null} />}
      </dl>
      <FoundationState
        copy="providerCredit 保持不可用：没有核准的 billing/credit 适配器，不猜测赠余额。"
        title="Credit unavailable"
      />
    </div>
  )
}

function SecurityCenter({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  if (!snapshot.securityAlerts) {
    return (
      <FoundationState
        copy="securityAlerts contract 尚不可用。Desktop 不读取或吊销 Key，不根据本地日志自行判定消耗暴涨、陌生模型或 Secret 泄露。"
        title="AI 用量安全告警 unavailable"
      />
    )
  }

  const alerts = snapshot.securityAlerts

  return (
    <div className="space-y-3">
      {alerts.length ? (
        <ul className="space-y-2">
          {alerts.map(alert => (
            <li className="rounded-md border border-(--ui-stroke-quaternary) p-3" key={alert.alertId}>
              <div className="flex flex-wrap justify-between gap-2 text-xs">
                <span className="font-medium">
                  {alert.type}
                  {alert.provider ? ` · ${alert.provider}` : ''}
                </span>
                <span className="text-[0.6875rem] text-(--ui-text-tertiary)">
                  {alert.severity} · {alert.state}
                </span>
              </div>
              <p className="mt-2 text-[0.6875rem] text-(--ui-text-tertiary)">{alert.safeSummary}</p>
              <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">{alert.detectedAt}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-(--ui-text-tertiary)">
          当前没有 canonical 告警。安全事实只来自真实 ledger 异常检测与可信安全事件。
        </p>
      )}
    </div>
  )
}

function BackupCenter({ snapshot }: { snapshot: WorkspaceSnapshot }) {
  const backup: BackupStatusRecord | null = snapshot.backupStatus ?? null

  if (!backup) {
    return (
      <div className="space-y-4">
        <FoundationState
          copy="backupStatus contract 尚不可用。Desktop 没有复制数据库、扫描用户目录、备份 Secret 或创建云存储。"
          title="备份与恢复状态 unavailable"
        />
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {['Latest backup', 'Backup state', 'Last restore test', 'Protected components', 'Last error'].map(label => (
            <Metric key={label} label={label} value={null} />
          ))}
        </dl>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Latest backup" value={backup.latestBackupAt} />
        <Metric label="Backup state" value={backup.state} />
        <Metric label="Last restore test" value={backup.lastRestoreTestAt} />
        <Metric label="Protected components" value={backup.protectedComponents.length || null} />
        <Metric label="Last error" value={backup.lastErrorCode} />
      </dl>
      <p className="text-[0.6875rem] text-(--ui-text-tertiary)">
        状态 unknown 表示尚无核准的备份/恢复系统事实；不伪造备份成功。checked_at：{backup.checkedAt}
      </p>
    </div>
  )
}

function ReleaseCenter() {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-(--ui-text-tertiary)">
        代码存在不等于产品 PASS；只有正式 acceptance evidence 才能升级状态。
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {RELEASE_READINESS_FOUNDATION.map(item => (
          <section className="rounded-lg border border-(--ui-stroke-quaternary) p-4" key={item.area}>
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-sm font-medium">{item.area}</h2>
              <span className="text-[0.6875rem] text-(--ui-text-tertiary)">{item.state}</span>
            </div>
            <p className="mt-2 text-xs text-(--ui-text-tertiary)">{item.reason}</p>
          </section>
        ))}
      </div>
    </div>
  )
}

function SettingsCenter({ snapshot, transport }: { snapshot: WorkspaceSnapshot; transport: WorkspaceSettingsTransport }) {
  const queryClient = useQueryClient()
  const settings = snapshot.systemSettings ?? null
  const [workdayEnd, setWorkdayEnd] = useState('')
  const [nightBudget, setNightBudget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  if (!settings) {
    return (
      <div className="space-y-4">
        <FoundationState
          copy="systemSettings contract 尚不可用。以下值不写入 localStorage，也不作为系统事实。"
          title="设置只读 / unavailable"
        />
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {['18:00 下班线', '夜间自动预算', '默认时区', '通知偏好', '工作来源范围', 'Provider display preferences'].map(
            label => (
              <Metric key={label} label={label} value={null} />
            )
          )}
        </dl>
      </div>
    )
  }

  const save = async () => {
    setError(null)
    const changes: Record<string, string | number> = {}

    if (workdayEnd.trim()) {
      changes.workday_end = workdayEnd.trim()
    }

    if (nightBudget.trim()) {
      const parsed = Number(nightBudget)

      if (!Number.isFinite(parsed) || parsed < 0) {
        setError('夜间预算必须是非负数字。')

        return
      }

      changes.night_budget = parsed
    }

    if (!Object.keys(changes).length) {
      setError('请先填写要修改的设置。')

      return
    }

    setSaving(true)

    try {
      await transport.updateSettings({
        clientRequestId: `settings-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        expectedRevision: settings.revision,
        actor: 'Mousai',
        changes
      })
      // Canonical server result → full snapshot refetch (no optimistic truth).
      await queryClient.invalidateQueries({ queryKey: ['mousai-workspace'] })
      setWorkdayEnd('')
      setNightBudget('')
    } catch (submitError) {
      const statusCode = submitError instanceof WorkspaceSettingsError ? submitError.statusCode : null
      setError(
        statusCode === 409
          ? '设置已被其他端修改（revision 冲突）；请重试。'
          : '设置保存失败；未在本地做任何回写。'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Metric label="18:00 下班线（canonical workday_end）" value={settings.workdayEnd} />
        <Metric label="夜间自动预算" value={settings.nightBudget} />
        <Metric label="默认时区" value={settings.timezone} />
        <Metric label="预算币种" value={settings.budgetCurrency} />
        <Metric label="工作来源范围 revision" value={settings.workScopeRevision} />
        <Metric label="Settings revision" value={settings.revision} />
      </dl>
      <section className="rounded-lg border border-(--ui-stroke-quaternary) p-4">
        <h2 className="text-sm font-medium">类型化设置修改</h2>
        <p className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
          仅允许核准字段；服务器端乐观 revision 校验（409 = 冲突），全部改动进入 append-only 审计。
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="mb-1 block text-(--ui-text-tertiary)">workday_end（HH:MM）</span>
            <Input
              aria-label="workday_end"
              className="h-9 w-full"
              onChange={event => setWorkdayEnd(event.target.value)}
              placeholder={settings.workdayEnd}
              value={workdayEnd}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-(--ui-text-tertiary)">night_budget（未设置则留空）</span>
            <Input
              aria-label="night_budget"
              className="h-9 w-full"
              onChange={event => setNightBudget(event.target.value)}
              placeholder={settings.nightBudget === null ? '未设置' : String(settings.nightBudget)}
              value={nightBudget}
            />
          </label>
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        <Button className="mt-3" disabled={saving} onClick={() => void save()} size="sm">
          {saving ? '保存中…' : '保存设置'}
        </Button>
      </section>
    </div>
  )
}

export function ReviewCostCenter({
  gatewayState,
  onNavigate,
  onOpenTask,
  surface,
  transport
}: {
  gatewayState: string
  onNavigate: (surface: ReviewFoundationSurface) => void
  onOpenTask?: Parameters<typeof PlanningReview>[0]['onOpenTask']
  surface: ReviewFoundationSurface
  transport: WorkspaceReadTransport & WorkspaceSettingsTransport
}) {
  const result = useQuery({
    queryKey: ['mousai-workspace', 'review-cost-center', transport.scope],
    queryFn: ({ signal }) => readWorkspaceSnapshot(transport, { signal }),
    enabled: gatewayState === 'open',
    retry: false,
    staleTime: 0
  })

  const hasSnapshot = gatewayState === 'open' && !result.isPending && !result.isError && Boolean(result.data)
  const snapshot = result.data?.snapshot ?? null

  let content

  if (surface === 'brief') {
    content = <PlanningReview gatewayState={gatewayState} onOpenTask={onOpenTask} transport={transport} />
  } else if (surface === 'cost') {
    content = snapshot ? <CostCenter snapshot={snapshot} /> : <FoundationLoadingOrError result={result} surface="cost" />
  } else if (surface === 'providers') {
    content = snapshot ? <ProviderCenter snapshot={snapshot} /> : <FoundationLoadingOrError result={result} surface="providers" />
  } else if (surface === 'security') {
    content = snapshot ? <SecurityCenter snapshot={snapshot} /> : <FoundationLoadingOrError result={result} surface="security" />
  } else if (surface === 'backup') {
    content = snapshot ? <BackupCenter snapshot={snapshot} /> : <FoundationLoadingOrError result={result} surface="backup" />
  } else if (surface === 'settings') {
    content = snapshot ? <SettingsCenter snapshot={snapshot} transport={transport} /> : <FoundationLoadingOrError result={result} surface="settings" />
  } else if (surface === 'release') {
    content = <ReleaseCenter />
  } else if (gatewayState !== 'open') {
    content = <FoundationState copy="Gateway 恢复后重新读取 canonical snapshot。" title="等待 Gateway 连接" />
  } else if (result.isPending || result.isFetching) {
    content = <FoundationState copy="正在读取任务、项目与 Production history。" title="正在生成复盘" />
  } else if (result.isError || !result.data) {
    const unavailable = result.error instanceof WorkspaceTransportUnavailableError
    content = (
      <FoundationState
        copy={unavailable ? '安全只读链路尚未接通；未展示缓存或 Demo。' : '读取失败；未展示过期事实。'}
        title={unavailable ? '复盘数据 unavailable' : '复盘读取失败'}
      />
    )
  } else {
    content = <ReviewCenter snapshot={result.data.snapshot} />
  }

  void hasSnapshot

  return (
    <div className="space-y-5">
      <nav
        aria-label="Review and release foundation"
        className="flex max-w-full gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SURFACES.map(item => (
          <Button
            aria-pressed={surface === item.id}
            key={item.id}
            onClick={() => onNavigate(item.id)}
            size="sm"
            variant={surface === item.id ? 'default' : 'secondary'}
          >
            {item.label}
          </Button>
        ))}
      </nav>
      {content}
    </div>
  )
}

function FoundationLoadingOrError({
  result,
  surface
}: {
  result: { isPending: boolean; isFetching: boolean; isError: boolean; error: unknown }
  surface: string
}): ReturnType<typeof FoundationState> {
  if (result.isPending || result.isFetching) {
    return <FoundationState copy="正在读取 canonical snapshot。" title="正在生成" />
  }

  const unavailable = result.error instanceof WorkspaceTransportUnavailableError

  return (
    <FoundationState
      copy={unavailable ? '安全只读链路尚未接通；未展示缓存或 Demo。' : `${surface} 读取失败；未展示过期事实。`}
      title={unavailable ? '数据 unavailable' : '读取失败'}
    />
  )
}

export function ProjectReviewPanel({ project, snapshot }: { project: Project; snapshot: WorkspaceSnapshot }) {
  const model = buildProjectReview(snapshot, project)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-(--ui-text-tertiary)">
          项目状态：{model.state === 'ongoing' ? '进行中' : '已结束'} · 周期：{display(model.lifecycle)}
        </p>
        <span className="text-[0.6875rem] text-(--ui-text-quaternary)">API cost：{display(model.apiCost)}</span>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="任务完成" value={`${model.completedTasks}/${model.totalTasks}`} />
        <Metric label="延期" value={model.overdueTasks} />
        <Metric label="Revision" value={model.revisions} />
        <Metric label="Deliverables" value={model.deliverables} />
        <Metric label="人工完成" value={model.contribution.HUMAN || null} />
        <Metric label="AI 辅助" value={model.contribution.AI_ASSISTED || null} />
        <Metric label="AI 主做" value={model.contribution.AI_PRIMARY || null} />
        <Metric label="AI 全自动" value={model.contribution.AI_AUTONOMOUS || null} />
      </dl>
      <section className="rounded-md border border-(--ui-stroke-quaternary) p-3">
        <h3 className="text-xs font-medium">Blockers</h3>
        <p className="mt-2 text-[0.6875rem] text-(--ui-text-tertiary)">
          {model.blockers.length
            ? model.blockers.map(item => `${item.workId}：${item.reason}`).join('；')
            : '暂无 canonical blocker'}
        </p>
      </section>
      <section className="rounded-md border border-(--ui-stroke-quaternary) p-3">
        <h3 className="text-xs font-medium">重要事件</h3>
        {model.importantEvents.length ? (
          <ul className="mt-2 space-y-1 text-[0.6875rem] text-(--ui-text-tertiary)">
            {model.importantEvents.slice(0, 8).map((event, index) => (
              <li key={`${event.at ?? 'unset'}:${event.label}:${index}`}>
                {display(event.at)} · {event.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[0.6875rem] text-(--ui-text-quaternary)">暂无正式事件。</p>
        )}
      </section>
    </div>
  )
}
