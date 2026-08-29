import { Codicon, useQuery } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import type { Ownership, Project, WorkHorizon } from './domain'
import {
  filterProjectCards,
  groupProjectCards,
  PROJECT_TYPE_LABELS,
  projectCardModels,
  type ProjectTypeFilter
} from './service-project-gallery'
import {
  readWorkspaceSnapshot,
  type WorkspaceReadTransport,
  WorkspaceTransportUnavailableError
} from './service-workspace-read'

const HORIZON_LABELS: Readonly<Record<WorkHorizon, string>> = {
  long: '长期',
  medium: '中期',
  short: '短期',
  unset: '未设置'
}

const OWNERSHIP_LABELS: Readonly<Record<Ownership, string>> = {
  personal: '个人',
  team: '团队',
  unset: '未设置'
}

function display(value: null | number | string): string {
  if (value === null || value === '') {
    return '未设置'
  }

  return String(value)
}

function ProjectFact({ label, value }: { label: string; value: null | number | string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">{label}</dt>
      <dd className="mt-1 truncate text-xs text-(--ui-text-secondary)" title={display(value)}>
        {display(value)}
      </dd>
    </div>
  )
}

function ProjectCard({
  onOpen,
  project,
  openTaskCount
}: {
  onOpen?: () => void
  project: Project
  openTaskCount: number
}) {
  return (
    <button
      aria-label={`打开项目：${project.name}`}
      className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-4 text-left transition-colors hover:bg-(--ui-hover-overlay) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      onClick={onOpen}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[0.6875rem] font-medium tracking-[0.12em] text-(--ui-text-quaternary)">
            {project.id}
          </div>
          <h3 className="mt-1 truncate text-sm font-medium" title={project.name}>
            {project.name}
          </h3>
        </div>
        <span className="shrink-0 rounded-full border border-(--ui-stroke-quaternary) px-2 py-1 text-[0.6875rem] text-(--ui-text-tertiary)">
          {project.typeLabel}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        <ProjectFact label="当前状态" value={project.status} />
        <ProjectFact label="当前阶段" value={project.stage} />
        <ProjectFact label="时间范围" value={HORIZON_LABELS[project.horizon]} />
        <ProjectFact label="归属" value={OWNERSHIP_LABELS[project.ownership]} />
        <ProjectFact label="进度" value={project.progress === null ? null : `${project.progress}%`} />
        <ProjectFact label="下一 DDL" value={project.nextDeadline} />
        <ProjectFact label="风险" value={project.risk} />
        <ProjectFact label="未闭环任务" value={openTaskCount} />
        <ProjectFact label="标签" value={project.tags.length ? project.tags.join('、') : null} />
      </dl>

      <div className="mt-4 border-t border-(--ui-stroke-quaternary) pt-3">
        <div className="text-[0.6875rem] text-(--ui-text-quaternary)">下一步</div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-(--ui-text-secondary)">{display(project.nextAction)}</p>
      </div>
    </button>
  )
}

function GalleryLoading() {
  return (
    <div aria-label="正在读取项目" className="grid gap-3 md:grid-cols-2">
      {[0, 1].map(item => (
        <div
          className="h-64 animate-pulse rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background)"
          key={item}
        />
      ))}
    </div>
  )
}

function GalleryState({
  action,
  copy,
  icon,
  title
}: {
  action?: { label: string; onClick: () => void }
  copy: string
  icon: string
  title: string
}) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-6 text-center">
      <Codicon className="mx-auto text-(--ui-text-quaternary)" name={icon} size="1.2rem" />
      <h2 className="mt-3 text-sm font-medium">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-(--ui-text-tertiary)">{copy}</p>
      {action && (
        <button
          className="mt-4 rounded-md border border-(--ui-stroke-tertiary) px-3 py-1.5 text-xs hover:bg-(--ui-hover-overlay)"
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </button>
      )}
    </section>
  )
}

export function ProjectGallery({
  gatewayState,
  onOpenProject,
  transport
}: {
  gatewayState: string
  onOpenProject?: (projectId: string) => void
  transport: WorkspaceReadTransport
}) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState<ProjectTypeFilter>('all')

  const result = useQuery({
    queryKey: ['mousai-workspace', 'project-gallery', transport.scope],
    queryFn: ({ signal }) => readWorkspaceSnapshot(transport, { signal }),
    enabled: gatewayState === 'open',
    refetchOnMount: 'always',
    retry: false,
    staleTime: 0
  })

  const cards = useMemo(() => (result.data ? projectCardModels(result.data.snapshot) : []), [result.data])
  const filtered = useMemo(() => filterProjectCards(cards, { query, type }), [cards, query, type])
  const groups = useMemo(() => groupProjectCards(filtered), [filtered])

  if (gatewayState !== 'open') {
    return (
      <GalleryState
        copy="Workspace 会在当前 Remote Gateway 恢复后重新读取。现有缓存不会被当作最新事实展示。"
        icon="debug-disconnect"
        title="等待 Gateway 连接"
      />
    )
  }

  if (result.isPending || result.isFetching) {
    return <GalleryLoading />
  }

  if (result.isError) {
    const unavailable = result.error instanceof WorkspaceTransportUnavailableError

    return (
      <GalleryState
        action={unavailable ? undefined : { label: '重试', onClick: () => void result.refetch() }}
        copy={
          unavailable
            ? '当前生产 Gateway 尚无 WorkData 项目只读接口；WorkBridge 任务接口需要服务端 Token，不能由 renderer 直接调用。本页未加载或伪造任何项目。'
            : '项目读取失败。没有展示过期缓存或演示数据；可重试当前安全 transport。'
        }
        icon={unavailable ? 'lock' : 'warning'}
        title={unavailable ? '安全只读链路尚未接通' : '项目读取失败'}
      />
    )
  }

  if (!result.data || cards.length === 0) {
    return (
      <GalleryState
        copy="数据源返回了零个有效项目。Workspace 不会自动创建示例项目，也不会把缺失字段补成事实。"
        icon="folder"
        title="当前没有可显示的项目"
      />
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">搜索项目</span>
          <Codicon
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--ui-text-quaternary)"
            name="search"
            size="0.8rem"
          />
          <input
            className="h-9 w-full rounded-md border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) pl-9 pr-3 text-xs outline-none focus:border-(--ui-stroke-secondary)"
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索名称、阶段或下一步"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span className="sr-only">按项目类型筛选</span>
          <select
            className="h-9 rounded-md border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) px-3 text-xs outline-none focus:border-(--ui-stroke-secondary)"
            onChange={event => setType(event.target.value as ProjectTypeFilter)}
            value={type}
          >
            <option value="all">全部类型</option>
            {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="flex h-9 items-center justify-center gap-2 rounded-md border border-(--ui-stroke-quaternary) px-3 text-xs hover:bg-(--ui-hover-overlay)"
          onClick={() => void result.refetch()}
          type="button"
        >
          <Codicon name="refresh" size="0.75rem" />
          刷新
        </button>
      </div>

      {result.data.issues.length > 0 && (
        <div className="mt-3 rounded-md border border-(--ui-stroke-quaternary) px-3 py-2 text-xs text-(--ui-text-tertiary)">
          已忽略 {result.data.issues.length} 条无效或重复记录；未将其合并为项目事实。
        </div>
      )}

      {groups.length === 0 ? (
        <div className="mt-6">
          <GalleryState copy="当前筛选条件没有匹配项目。" icon="search" title="没有匹配结果" />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {groups.map(group => (
            <section key={group.key}>
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="text-sm font-medium">{group.label}</h2>
                <span className="text-[0.6875rem] text-(--ui-text-quaternary)">{group.projects.length}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.projects.map(card => (
                  <ProjectCard
                    key={card.project.id}
                    onOpen={() => onOpenProject?.(card.project.id)}
                    openTaskCount={card.openTaskCount}
                    project={card.project}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
