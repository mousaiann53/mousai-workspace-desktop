import { Input } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import type { WorkspaceSnapshot } from './domain'
import { SOURCE_LABELS, type SourceType } from './service-source-identity'
import {
  buildUnifiedInbox,
  filterUnifiedInbox,
  type InboxDdlFilter,
  type UnifiedInboxFilters
} from './service-unified-inbox'

const SOURCES: readonly { readonly id: 'all' | SourceType; readonly label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'feishu', label: 'Feishu' },
  { id: 'qq', label: 'QQ' },
  { id: 'wechat', label: 'WeChat' },
  { id: 'hermes_session', label: 'Hermes Session' },
  { id: 'manual', label: 'Manual' }
]

function display(value: null | number | string): string {
  return value === null || value === '' ? '未设置' : String(value)
}

export function UnifiedInbox({
  onOpenSource,
  onOpenTask,
  snapshot
}: {
  onOpenSource?: (workId: string) => void
  onOpenTask?: (workId: string) => void
  snapshot: WorkspaceSnapshot
}) {
  const [query, setQuery] = useState('')
  const [projectId, setProjectId] = useState('')
  const [sourceType, setSourceType] = useState<UnifiedInboxFilters['sourceType']>('all')
  const [ddl, setDdl] = useState<InboxDdlFilter>('all')
  const [waitingOnly, setWaitingOnly] = useState(false)
  const allItems = useMemo(() => buildUnifiedInbox(snapshot), [snapshot])

  const items = useMemo(
    () =>
      filterUnifiedInbox(allItems, {
        query,
        projectId: projectId || null,
        sourceType,
        status: 'all',
        ddl,
        waitingOnly
      }),
    [allItems, ddl, projectId, query, sourceType, waitingOnly]
  )

  return (
    <div className="space-y-4">
      <div
        aria-label="收件箱来源"
        className="flex max-w-full gap-1 overflow-x-auto rounded-md bg-foreground/4 p-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
      >
        {SOURCES.map(source => (
          <button
            aria-selected={sourceType === source.id}
            className={`shrink-0 rounded px-2.5 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${
              sourceType === source.id ? 'bg-(--ui-control-active-background)' : 'text-(--ui-text-tertiary)'
            }`}
            key={source.id}
            onClick={() => setSourceType(source.id)}
            role="tab"
            type="button"
          >
            {source.label}
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs sm:col-span-2">
          <span className="sr-only">搜索收件箱</span>
          <Input
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索 WORK-ID、标题、项目、来源或下一步"
            value={query}
          />
        </label>
        <label className="text-xs">
          <span className="sr-only">项目筛选</span>
          <select
            aria-label="项目筛选"
            className="h-9 w-full rounded-md border border-(--ui-stroke-quaternary) bg-transparent px-2"
            onChange={event => setProjectId(event.target.value)}
            value={projectId}
          >
            <option value="">全部项目</option>
            {snapshot.projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className="sr-only">DDL 筛选</span>
          <select
            aria-label="DDL 筛选"
            className="h-9 w-full rounded-md border border-(--ui-stroke-quaternary) bg-transparent px-2"
            onChange={event => setDdl(event.target.value as InboxDdlFilter)}
            value={ddl}
          >
            <option value="all">全部 DDL</option>
            <option value="has">已设置 DDL</option>
            <option value="missing">DDL 未设置</option>
            <option value="overdue">已逾期</option>
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-xs text-(--ui-text-tertiary)">
        <input checked={waitingOnly} onChange={event => setWaitingOnly(event.target.checked)} type="checkbox" />
        只看等待 / 阻塞
      </label>

      {items.length ? (
        <ul className="space-y-2">
          {items.map(item => (
            <li className="rounded-lg border border-(--ui-stroke-quaternary) p-3" key={item.task.id}>
              <button
                aria-label={`打开任务：${item.task.title}`}
                className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={() => onOpenTask?.(item.task.id)}
                type="button"
              >
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.task.title}</div>
                    <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">{item.task.id}</div>
                  </div>
                  <span className="rounded-full border border-(--ui-stroke-quaternary) px-2 py-1 text-[0.6875rem] text-(--ui-text-tertiary)">
                    {SOURCE_LABELS[item.sourceIdentity.sourceType]}
                  </span>
                </div>
                <dl className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <dt className="text-(--ui-text-quaternary)">项目 / 状态</dt>
                    <dd className="mt-0.5 text-(--ui-text-secondary)">
                      {display(item.project?.name ?? item.task.projectRef)} · {display(item.task.statusLabel)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-(--ui-text-quaternary)">来源渠道 / sender</dt>
                    <dd className="mt-0.5 text-(--ui-text-secondary)">
                      {display(item.sourceIdentity.channel)} · {display(item.sourceIdentity.displayName)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-(--ui-text-quaternary)">Received / DDL</dt>
                    <dd className="mt-0.5 break-words text-(--ui-text-secondary)">
                      {display(item.sourceIdentity.receivedAt)} · {display(item.task.deadline)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-(--ui-text-quaternary)">Confidence / extraction</dt>
                    <dd className="mt-0.5 text-(--ui-text-secondary)">
                      {display(item.confidence)} · {display(item.extractionState)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-(--ui-text-quaternary)">重复 / 等待</dt>
                    <dd className="mt-0.5 text-(--ui-text-secondary)">
                      {item.duplicate.state.toUpperCase()} · {display(item.waiting)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-(--ui-text-quaternary)">下一步</dt>
                    <dd className="mt-0.5 line-clamp-2 text-(--ui-text-secondary)">{display(item.task.nextAction)}</dd>
                  </div>
                </dl>
              </button>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-(--ui-stroke-quaternary) pt-3">
                <button
                  className="rounded-md px-2 py-1 text-[0.6875rem] text-(--ui-text-tertiary) hover:bg-(--ui-hover-overlay) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  onClick={() => onOpenSource?.(item.task.id)}
                  type="button"
                >
                  来源记录
                </button>
                <button
                  className="rounded-md px-2 py-1 text-[0.6875rem] text-(--ui-text-quaternary) disabled:cursor-not-allowed disabled:opacity-60"
                  disabled
                  title="mergeMutation typed contract unavailable"
                  type="button"
                >
                  合并
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-(--ui-stroke-quaternary) p-6 text-center text-xs text-(--ui-text-tertiary)">
          当前筛选范围没有真实收件箱事项。
        </div>
      )}
    </div>
  )
}
