import { Button, Codicon, Input, Textarea, useQuery } from '@hermes/plugin-sdk'
import { type FormEvent, useMemo, useRef, useState } from 'react'

import type { Task } from './domain'
import type { DurableTaskCreateDraft, TaskCreateDraftStore } from './service-task-create-draft'
import type { WorkspaceTaskMutationTransport } from './service-task-mutation'
import { type TaskReadView, tasksForView } from './service-task-views'
import { readWorkspaceSnapshot, type WorkspaceReadTransport } from './service-workspace-read'

const VIEWS: readonly { id: TaskReadView; label: string }[] = [
  { id: 'inbox', label: '收件箱' },
  { id: 'today', label: '今日' },
  { id: 'recent', label: '近期' }
]

const STATUS_LABEL: Readonly<Record<Task['status'], string>> = {
  archived: '已归档',
  classified: '已分类',
  claimed: '已领取',
  cloud_processing: '云端处理中',
  completed: '已完成',
  decision_required: '需要决策',
  execution_failed: '执行失败',
  inbox: '收件箱',
  local_processing: '本机处理中',
  material_missing: '资料缺失',
  model_failed: '模型失败',
  review: '待验收',
  unknown: '未设置',
  waiting_local: '等待本机'
}

function requestId(): string {
  return `desktop:create:${crypto.randomUUID()}`
}

function deadlineLabel(value: string | null): string {
  if (!value) {
    return 'DDL 未设置'
  }

  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeZone: 'Asia/Shanghai' }).format(new Date(value))
}

export function TaskCenter({
  draftStore,
  gatewayState,
  transport
}: {
  draftStore: TaskCreateDraftStore
  gatewayState: string
  transport: WorkspaceReadTransport & WorkspaceTaskMutationTransport
}) {
  const initialDraft = useRef(draftStore.load()).current
  const [view, setView] = useState<TaskReadView>('inbox')
  const [createOpen, setCreateOpen] = useState(initialDraft !== null)
  const [title, setTitle] = useState(initialDraft?.task.title ?? '')
  const [type, setType] = useState(initialDraft?.task.type ?? '行政')
  const [projectRef, setProjectRef] = useState(initialDraft?.task.projectRef ?? '')
  const [priority, setPriority] = useState(initialDraft?.task.priority ?? '普通')
  const [deadline, setDeadline] = useState(initialDraft?.task.deadline ?? '')
  const [nextAction, setNextAction] = useState(initialDraft?.task.nextAction ?? '')
  const [durableDraft, setDurableDraft] = useState<DurableTaskCreateDraft | null>(initialDraft)
  const [pending, setPending] = useState(false)

  const [message, setMessage] = useState<string | null>(
    initialDraft ? '检测到未确认结果的创建请求；请使用同一请求安全重试。' : null
  )

  const result = useQuery({
    queryKey: ['mousai-workspace', 'task-center', transport.scope],
    queryFn: ({ signal }) => readWorkspaceSnapshot(transport, { signal }),
    enabled: gatewayState === 'open',
    refetchOnMount: 'always',
    retry: false,
    staleTime: 0
  })

  const tasks = useMemo(
    () => tasksForView(result.data?.snapshot.tasks ?? [], view),
    [result.data?.snapshot.tasks, view]
  )

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (pending || !title.trim()) {
      return
    }

    const draft =
      durableDraft ??
      ({
        clientRequestId: requestId(),
        task: {
          title: title.trim(),
          type,
          projectRef: projectRef || null,
          priority,
          deadline: deadline || null,
          nextAction: nextAction.trim() || null
        }
      } satisfies DurableTaskCreateDraft)

    if (!durableDraft) {
      if (!draftStore.save(draft)) {
        setMessage('无法持久保存创建请求；为避免重复任务，本次未提交。')

        return
      }

      setDurableDraft(draft)
    }

    setPending(true)
    setMessage(null)

    try {
      const created = await transport.createTask(draft)

      await result.refetch()
      draftStore.clear()
      setDurableDraft(null)
      setView('inbox')
      setMessage(`已创建 ${created.workId}`)
      setTitle('')
      setProjectRef('')
      setDeadline('')
      setNextAction('')
      setCreateOpen(false)
    } catch {
      setMessage('创建失败；表单和幂等请求标识已保留，可安全重试。')
    } finally {
      setPending(false)
    }
  }

  const createLocked = durableDraft !== null

  if (gatewayState !== 'open') {
    return <p className="text-xs text-(--ui-text-tertiary)">等待 Gateway 连接后读取任务。</p>
  }

  if (result.isPending) {
    return <p className="text-xs text-(--ui-text-tertiary)">正在读取任务…</p>
  }

  if (result.isError || !result.data) {
    return <p className="text-xs text-destructive">任务读取失败；没有展示演示数据或过期事实。</p>
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-md bg-foreground/4 p-1" role="tablist">
          {VIEWS.map(item => (
            <button
              aria-selected={view === item.id}
              className={`rounded px-3 py-1.5 text-xs ${view === item.id ? 'bg-(--ui-control-active-background)' : 'text-(--ui-text-tertiary)'}`}
              key={item.id}
              onClick={() => setView(item.id)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        <Button onClick={() => setCreateOpen(value => createLocked || !value)} size="sm" type="button">
          <Codicon name="add" size="0.75rem" /> {createLocked ? '待重试' : '新建任务'}
        </Button>
      </div>

      {createOpen && (
        <form
          className="grid gap-3 rounded-lg border border-(--ui-stroke-quaternary) p-4 sm:grid-cols-2"
          onSubmit={submit}
        >
          <label className="text-xs sm:col-span-2">
            <span className="mb-1 block text-(--ui-text-tertiary)">任务名称</span>
            <Input
              disabled={pending || createLocked}
              maxLength={240}
              onChange={event => setTitle(event.target.value)}
              required
              value={title}
            />
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-(--ui-text-tertiary)">类型</span>
            <select
              className="h-9 w-full rounded-md border border-(--ui-stroke-quaternary) bg-transparent px-2"
              disabled={pending || createLocked}
              onChange={event => setType(event.target.value)}
              value={type}
            >
              {['教学', '科研', '行政', '创意制作'].map(value => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-(--ui-text-tertiary)">所属项目</span>
            <select
              className="h-9 w-full rounded-md border border-(--ui-stroke-quaternary) bg-transparent px-2"
              disabled={pending || createLocked}
              onChange={event => setProjectRef(event.target.value)}
              value={projectRef}
            >
              <option value="">未设置</option>
              {result.data.snapshot.projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-(--ui-text-tertiary)">优先级</span>
            <select
              className="h-9 w-full rounded-md border border-(--ui-stroke-quaternary) bg-transparent px-2"
              disabled={pending || createLocked}
              onChange={event => setPriority(event.target.value)}
              value={priority}
            >
              {['低', '普通', '高', '紧急'].map(value => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-xs">
            <span className="mb-1 block text-(--ui-text-tertiary)">DDL</span>
            <Input
              disabled={pending || createLocked}
              onChange={event => setDeadline(event.target.value)}
              type="date"
              value={deadline}
            />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className="mb-1 block text-(--ui-text-tertiary)">下一步</span>
            <Textarea
              disabled={pending || createLocked}
              maxLength={4096}
              onChange={event => setNextAction(event.target.value)}
              value={nextAction}
            />
          </label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            {!createLocked && (
              <Button disabled={pending} onClick={() => setCreateOpen(false)} type="button" variant="outline">
                取消
              </Button>
            )}
            <Button disabled={pending || !title.trim()} type="submit">
              {pending ? '创建中…' : createLocked ? '安全重试' : '创建'}
            </Button>
          </div>
        </form>
      )}

      {message && <p className="text-xs text-(--ui-text-tertiary)">{message}</p>}

      {tasks.length === 0 ? (
        <div className="rounded-lg border border-(--ui-stroke-quaternary) p-6 text-center text-xs text-(--ui-text-tertiary)">
          当前视图没有任务。无 DDL 的任务不会被补入“今日”或“近期”。
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks.map(task => (
            <li className="rounded-lg border border-(--ui-stroke-quaternary) p-3" key={task.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{task.title}</div>
                  <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">{task.id}</div>
                </div>
                <span className="text-xs text-(--ui-text-tertiary)">{STATUS_LABEL[task.status]}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-(--ui-text-tertiary)">
                <span>{deadlineLabel(task.deadline)}</span>
                <span>{task.projectRef ?? '项目未设置'}</span>
                <span>{task.nextAction ?? '下一步未设置'}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
