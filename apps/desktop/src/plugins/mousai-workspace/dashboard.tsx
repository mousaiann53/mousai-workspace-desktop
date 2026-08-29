import { Codicon, useQuery } from '@hermes/plugin-sdk'
import { useMemo } from 'react'

import { buildDashboardModel, type DashboardTaskItem } from './service-dashboard'
import {
  readWorkspaceSnapshot,
  type WorkspaceReadTransport,
  WorkspaceTransportUnavailableError
} from './service-workspace-read'

const SECTIONS = [
  { id: 'today', title: '今日任务', icon: 'calendar' },
  { id: 'upcoming', title: '近期 DDL', icon: 'clock' },
  { id: 'review', title: '等待 Mousai 审阅', icon: 'eye' },
  { id: 'missing', title: '资料缺失', icon: 'warning' },
  { id: 'decision', title: '需要决策', icon: 'question' },
  { id: 'waitingLocal', title: '等待本机', icon: 'device-desktop' },
  { id: 'processing', title: '正在处理', icon: 'run' },
  { id: 'recentDelivered', title: '最近交付', icon: 'package' },
  { id: 'recentCompleted', title: '最近完成', icon: 'pass-filled' }
] as const

function display(value: string | null): string {
  return value?.trim() || '未设置'
}

function DashboardRow({
  item,
  fileCount,
  onOpen
}: {
  item: DashboardTaskItem
  fileCount?: number
  onOpen?: () => void
}) {
  const { review, task } = item

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium" title={task.title}>
            {task.title}
          </div>
          <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">{task.id}</div>
        </div>
        <span className="shrink-0 text-[0.6875rem] text-(--ui-text-tertiary)">
          {review?.gateState ?? display(task.statusLabel)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-(--ui-text-quaternary)">
        <span>DDL {display(task.deadline)}</span>
        <span>下一步 {display(task.nextAction)}</span>
        {fileCount !== undefined && <span>{fileCount} 个文件</span>}
      </div>
    </>
  )

  return (
    <li className="border-t border-(--ui-stroke-quaternary) py-2 first:border-t-0 first:pt-0 last:pb-0">
      {onOpen ? (
        <button
          aria-label={`打开任务：${task.title}`}
          className="w-full rounded-md p-1 text-left hover:bg-(--ui-hover-overlay) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={onOpen}
          type="button"
        >
          {content}
        </button>
      ) : (
        content
      )}
    </li>
  )
}

function DashboardCard({
  icon,
  items,
  title,
  files,
  onOpenItem
}: {
  icon: string
  items: readonly DashboardTaskItem[]
  title: string
  files?: ReadonlyMap<string, readonly unknown[]>
  onOpenItem?: (item: DashboardTaskItem, panel: 'deliverable' | 'task') => void
}) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Codicon className="text-(--ui-text-tertiary)" name={icon} size="0.8rem" />
          {title}
        </h2>
        <span className="text-[0.6875rem] text-(--ui-text-quaternary)">{items.length}</span>
      </div>
      {items.length ? (
        <ul className="mt-3">
          {items.slice(0, 6).map(item => (
            <DashboardRow
              fileCount={files?.get(item.task.id)?.length}
              item={item}
              key={item.task.id}
              onOpen={item.projectId ? () => onOpenItem?.(item, files ? 'deliverable' : 'task') : undefined}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-(--ui-text-quaternary)">暂无真实数据</p>
      )}
    </section>
  )
}

function DashboardState({ title, copy }: { title: string; copy: string }) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-6 text-center">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-2 text-xs text-(--ui-text-tertiary)">{copy}</p>
    </section>
  )
}

export function Dashboard({
  gatewayState,
  onOpenItem,
  transport
}: {
  gatewayState: string
  onOpenItem?: (item: DashboardTaskItem, panel: 'deliverable' | 'task') => void
  transport: WorkspaceReadTransport
}) {
  const result = useQuery({
    queryKey: ['mousai-workspace', 'dashboard', transport.scope],
    queryFn: ({ signal }) => readWorkspaceSnapshot(transport, { signal }),
    enabled: gatewayState === 'open',
    refetchOnMount: 'always',
    retry: false,
    staleTime: 0
  })

  const model = useMemo(() => (result.data ? buildDashboardModel(result.data.snapshot) : null), [result.data])

  if (gatewayState !== 'open') {
    return <DashboardState copy="Gateway 恢复后将重新读取 canonical snapshot。" title="等待 Gateway 连接" />
  }

  if (result.isPending || result.isFetching) {
    return <DashboardState copy="正在读取 Workspace snapshot。" title="正在读取看板" />
  }

  if (result.isError) {
    const unavailable = result.error instanceof WorkspaceTransportUnavailableError

    return (
      <DashboardState
        copy={unavailable ? '当前安全只读链路尚未接通；未展示缓存或 Demo 数据。' : '读取失败；未展示过期事实。'}
        title={unavailable ? '安全只读链路尚未接通' : '看板读取失败'}
      />
    )
  }

  if (!model) {
    return <DashboardState copy="snapshot 没有返回可用事实。" title="暂无看板数据" />
  }

  return (
    <div>
      {result.data.issues.length > 0 && (
        <div className="mb-3 rounded-md border border-(--ui-stroke-quaternary) px-3 py-2 text-xs text-(--ui-text-tertiary)">
          已忽略 {result.data.issues.length} 条无效或重复记录；未将其合并为看板事实。
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {SECTIONS.map(section => (
          <DashboardCard
            files={section.id === 'recentDelivered' ? model.deliveredFilesByWorkId : undefined}
            icon={section.icon}
            items={model[section.id]}
            key={section.id}
            onOpenItem={onOpenItem}
            title={section.title}
          />
        ))}
      </div>
    </div>
  )
}
