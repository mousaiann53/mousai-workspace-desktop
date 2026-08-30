import { Button, useQuery } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import type { Project, WorkspaceSnapshot } from './domain'
import { PlanningReview } from './planning-review'
import {
  buildAiContribution,
  buildPlanActualRows,
  buildProjectReview,
  buildReviewSummary,
  RELEASE_READINESS_FOUNDATION,
  type ReviewScope
} from './service-review-cost'
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

const COST_FIELDS = [
  'requests',
  'tokens',
  'estimated_cost',
  'actual_cost',
  'currency',
  'credit_remaining',
  'reset_at',
  'credit_expires_at'
] as const

function CostCenter() {
  return (
    <div className="space-y-4">
      <FoundationState
        copy="usageLedger / costAttribution 尚未进入 canonical snapshot。Desktop 不读取 Provider Secret、不请求 billing API，也不扫描日志造成本事实。"
        title="AI 用量与成本 unavailable"
      />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {['今日', '7 日', '当前周期', '按 Provider / Model / Agent / Project / WORK-ID'].map(period => (
          <section className="rounded-lg border border-(--ui-stroke-quaternary) p-4" key={period}>
            <h2 className="text-sm font-medium">{period}</h2>
            <dl className="mt-3 space-y-2">
              {COST_FIELDS.map(field => (
                <div className="flex justify-between gap-3 text-[0.6875rem]" key={field}>
                  <dt className="text-(--ui-text-quaternary)">{field}</dt>
                  <dd>未设置</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  )
}

function ProviderCenter() {
  return (
    <FoundationState
      copy="当前 snapshot 没有 canonical providerUsage / providerCredit。未写死 Gemini、DeepSeek 或任何赠金额度，也没有把配置中出现过的 Provider 当成健康事实。"
      title="Provider 状态 unavailable"
    />
  )
}

function SecurityCenter() {
  return (
    <FoundationState
      copy="securityAlerts contract 尚不可用。Desktop 不读取或吊销 Key，不根据本地日志自行判定消耗暴涨、陌生模型或 Secret 泄露。"
      title="AI 用量安全告警 unavailable"
    />
  )
}

function BackupCenter() {
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

function SettingsCenter() {
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
  transport: WorkspaceReadTransport
}) {
  const result = useQuery({
    queryKey: ['mousai-workspace', 'review-cost-center', transport.scope],
    queryFn: ({ signal }) => readWorkspaceSnapshot(transport, { signal }),
    enabled: gatewayState === 'open' && surface === 'review',
    retry: false,
    staleTime: 0
  })

  let content

  if (surface === 'brief') {
    content = <PlanningReview gatewayState={gatewayState} onOpenTask={onOpenTask} transport={transport} />
  } else if (surface === 'cost') {
    content = <CostCenter />
  } else if (surface === 'providers') {
    content = <ProviderCenter />
  } else if (surface === 'security') {
    content = <SecurityCenter />
  } else if (surface === 'backup') {
    content = <BackupCenter />
  } else if (surface === 'release') {
    content = <ReleaseCenter />
  } else if (surface === 'settings') {
    content = <SettingsCenter />
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
