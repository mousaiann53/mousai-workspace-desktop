import { Button, Codicon, useQuery } from '@hermes/plugin-sdk'
import { useMemo, useState } from 'react'

import type { Task } from './domain'
import type { LocalDeliverableAccess } from './service-local-deliverables'
import { buildArchiveModel, buildResourceGroups, type ResourceEntry } from './service-resource-archive'
import {
  readWorkspaceSnapshot,
  type WorkspaceReadTransport,
  WorkspaceTransportUnavailableError
} from './service-workspace-read'

function display(value: null | number | string): string {
  return value === null || value === '' ? '未设置' : String(value)
}

function ReadState({ copy, title }: { copy: string; title: string }) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) p-6 text-center">
      <Codicon className="mx-auto text-(--ui-text-quaternary)" name="files" size="1rem" />
      <h2 className="mt-3 text-sm font-medium">{title}</h2>
      <p className="mt-2 text-xs text-(--ui-text-tertiary)">{copy}</p>
    </section>
  )
}

function ResourceRow({ entry, onOpen, onReveal }: { entry: ResourceEntry; onOpen?: () => void; onReveal: () => void }) {
  const { deliverable, project, review, task } = entry

  return (
    <li className="rounded-lg border border-(--ui-stroke-quaternary) p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium" title={deliverable.filename}>
            {deliverable.filename}
          </div>
          <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
            {deliverable.extension} · {deliverable.sizeBytes} bytes · {deliverable.workId}
          </div>
        </div>
        <span className="text-[0.6875rem] text-(--ui-text-tertiary)">
          {deliverable.deliveryState} / {review?.gateState ?? deliverable.reviewState}
        </span>
      </div>
      <dl className="mt-3 grid gap-2 text-[0.6875rem] text-(--ui-text-tertiary) sm:grid-cols-3">
        <div>项目：{display(project?.name ?? null)}</div>
        <div>Revision：{display(review?.revision ?? null)}</div>
        <div>Producer：{display(entry.producer)}</div>
        <div>Manifest：{display(review?.manifestVersion ?? null)}</div>
        <div>Task：{display(task?.title ?? null)}</div>
        <div>Provenance：{display(entry.provenance)}</div>
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button disabled={!onOpen} onClick={onOpen} size="sm" type="button" variant="outline">
          进入交付物
        </Button>
        <Button onClick={onReveal} size="sm" type="button" variant="outline">
          打开本地产物
        </Button>
      </div>
    </li>
  )
}

function TaskRow({ task, onOpen }: { task: Task; onOpen?: () => void }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--ui-stroke-quaternary) p-3">
      <div>
        <div className="text-xs font-medium">{task.title}</div>
        <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
          {task.id} · {display(task.statusLabel)}
        </div>
      </div>
      <Button disabled={!onOpen} onClick={onOpen} size="sm" type="button" variant="outline">
        进入任务
      </Button>
    </li>
  )
}

export function ResourceArchiveView({
  gatewayState,
  localAccess,
  mode,
  onOpenResource,
  onOpenTask,
  transport
}: {
  gatewayState: string
  localAccess: LocalDeliverableAccess
  mode: 'archive' | 'resources'
  onOpenResource: (entry: ResourceEntry) => void
  onOpenTask: (task: Task, projectId: string) => void
  transport: WorkspaceReadTransport
}) {
  const [localMessage, setLocalMessage] = useState<string | null>(null)

  const result = useQuery({
    queryKey: ['mousai-workspace', mode, transport.scope],
    queryFn: ({ signal }) => readWorkspaceSnapshot(transport, { signal }),
    enabled: gatewayState === 'open',
    refetchOnMount: 'always',
    retry: false,
    staleTime: 0
  })

  const resources = useMemo(() => (result.data ? buildResourceGroups(result.data.snapshot) : []), [result.data])
  const archive = useMemo(() => (result.data ? buildArchiveModel(result.data.snapshot) : null), [result.data])

  if (gatewayState !== 'open') {
    return <ReadState copy="Gateway 恢复后重新读取，不展示过期缓存。" title="等待 Gateway 连接" />
  }

  if (result.isPending || result.isFetching) {
    return <ReadState copy="正在读取 canonical Workspace snapshot。" title="正在读取" />
  }

  if (result.isError) {
    const unavailable = result.error instanceof WorkspaceTransportUnavailableError

    return (
      <ReadState
        copy="没有使用 Demo、缓存或 renderer credential 替代。"
        title={unavailable ? '安全只读链路不可用' : '读取失败'}
      />
    )
  }

  const reveal = (workId: string) => {
    setLocalMessage(null)
    void localAccess.revealOutbox(workId).then(opened => {
      if (!opened) {
        setLocalMessage('本机产物目录不可用；未尝试其他路径。')
      }
    })
  }

  if (mode === 'resources') {
    return (
      <div>
        {resources.length ? (
          <div className="space-y-6">
            {resources.map(group => (
              <section key={group.key}>
                <h2 className="mb-3 text-sm font-medium">{group.project?.name ?? '未关联项目'}</h2>
                <ul className="space-y-2">
                  {group.entries.map(entry => (
                    <ResourceRow
                      entry={entry}
                      key={entry.deliverable.id}
                      onOpen={entry.project ? () => onOpenResource(entry) : undefined}
                      onReveal={() => reveal(entry.deliverable.workId)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ReadState copy="当前 snapshot 没有 Deliverable / Manifest metadata。" title="暂无资料" />
        )}
        {localMessage && <p className="mt-3 text-xs text-destructive">{localMessage}</p>}
      </div>
    )
  }

  const archived = archive?.archivedTasks ?? []
  const completed = archive?.completedTasks ?? []
  const accepted = archive?.acceptedDeliverables ?? []

  if (!archived.length && !completed.length && !accepted.length) {
    return <ReadState copy="当前 snapshot 没有已归档、已完成或已验收事实。" title="归档为空" />
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-medium">已归档任务</h2>
        {archived.length ? (
          <ul className="space-y-2">
            {archived.map(item => (
              <TaskRow
                key={item.task.id}
                onOpen={item.project ? () => onOpenTask(item.task, item.project!.id) : undefined}
                task={item.task}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-(--ui-text-quaternary)">暂无真实数据</p>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-sm font-medium">最近完成</h2>
        {completed.length ? (
          <ul className="space-y-2">
            {completed.map(item => (
              <TaskRow
                key={item.task.id}
                onOpen={item.project ? () => onOpenTask(item.task, item.project!.id) : undefined}
                task={item.task}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-(--ui-text-quaternary)">暂无真实数据</p>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-sm font-medium">已验收交付物</h2>
        {accepted.length ? (
          <ul className="space-y-2">
            {accepted.map(entry => (
              <ResourceRow
                entry={entry}
                key={entry.deliverable.id}
                onOpen={entry.project ? () => onOpenResource(entry) : undefined}
                onReveal={() => reveal(entry.deliverable.workId)}
              />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-(--ui-text-quaternary)">暂无真实数据</p>
        )}
      </section>
      {localMessage && <p className="text-xs text-destructive">{localMessage}</p>}
    </div>
  )
}
