import {
  Button,
  Codicon,
  ConfirmDialog,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Textarea,
  useQuery
} from '@hermes/plugin-sdk'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import type { Deliverable, Project, Task } from './domain'
import { ProductionReviewCard } from './production-review'
import type { LocalDeliverableAccess } from './service-local-deliverables'
import type { WorkspaceProductionActionTransport } from './service-production-actions'
import { projectDetailModel, type TimelineLayerModel } from './service-project-detail'
import { taskActionCapability } from './service-task-actions'
import { isRevisionConflict, type TaskEditChanges, type WorkspaceTaskMutationTransport } from './service-task-mutation'
import {
  readWorkspaceSnapshot,
  type WorkspaceReadTransport,
  WorkspaceTransportUnavailableError
} from './service-workspace-read'

const TASK_STATUS_LABELS: Readonly<Record<Task['status'], string>> = {
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
  waiting_local: '等待本机',
  unknown: '未设置'
}

const PRIORITY_LABELS: Readonly<Record<Task['priority'], string>> = {
  high: '高',
  low: '低',
  normal: '普通',
  urgent: '紧急',
  unset: '未设置'
}

const WORKBRIDGE_LABELS: Readonly<Record<Task['workBridgeState'], string>> = {
  archived: '已归档',
  claimed: '已领取',
  completed: '已完成',
  failed: '失败',
  not_applicable: '不适用',
  processing: '处理中',
  review: '待验收',
  unknown: '未知',
  waiting: '等待本机'
}

const TIMELINE_LABELS: Readonly<Record<TimelineLayerModel['key'], string>> = {
  stage: '阶段',
  milestone: '里程碑',
  deadline: 'DDL',
  event: '重要事件'
}

function display(value: boolean | null | number | string): string {
  if (value === null || value === '') {
    return '未设置'
  }

  if (typeof value === 'boolean') {
    return value ? '是' : '否'
  }

  return String(value)
}

function dateLabel(value: string | null): string {
  if (!value) {
    return '未设置'
  }

  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function deadlineInputValue(value: string | null): string {
  if (!value) {
    return ''
  }

  const parts = new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric'
  }).formatToParts(new Date(value))

  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')}`
}

function requestId(): string {
  return `desktop:${crypto.randomUUID()}`
}

function Fact({ label, value }: { label: string; value: boolean | null | number | string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] text-(--ui-text-quaternary)">{label}</dt>
      <dd className="mt-1 break-words text-xs text-(--ui-text-secondary)">{display(value)}</dd>
    </div>
  )
}

function EmptyReadState({ copy }: { copy: string }) {
  return (
    <div className="rounded-md bg-foreground/4 px-3 py-4 text-center text-xs leading-5 text-(--ui-text-tertiary)">
      {copy}
    </div>
  )
}

function Section({ children, title }: { children: ReactNode; title: string }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {children}
    </section>
  )
}

function TimelineLayer({ layer }: { layer: TimelineLayerModel }) {
  return (
    <div className="rounded-lg border border-(--ui-stroke-quaternary) p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium">{TIMELINE_LABELS[layer.key]}</h3>
        <span className="text-[0.6875rem] text-(--ui-text-quaternary)">{layer.items.length}</span>
      </div>
      {layer.items.length === 0 ? (
        <p className="text-xs text-(--ui-text-tertiary)">暂无正式数据</p>
      ) : (
        <ol className="space-y-2">
          {layer.items.map(item => (
            <li className="flex items-start gap-2 text-xs" key={item.id}>
              <span
                aria-hidden="true"
                className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                  item.timing === 'overdue' ? 'bg-destructive' : 'bg-primary'
                }`}
              />
              <div className="min-w-0">
                <div className="break-words text-(--ui-text-secondary)">{item.title}</div>
                {item.occurredAt && (
                  <div className="mt-0.5 text-[0.6875rem] text-(--ui-text-quaternary)">
                    {dateLabel(item.occurredAt)}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function TaskInspector({
  deliverables,
  mutationTransport,
  onClose,
  onRefresh,
  onSelectTask,
  open,
  project,
  projects,
  task,
  tasks
}: {
  deliverables: readonly Deliverable[]
  mutationTransport: WorkspaceTaskMutationTransport
  onClose: () => void
  onRefresh: () => Promise<unknown>
  onSelectTask: (taskId: string) => void
  open: boolean
  project: Project
  projects: readonly Project[]
  task: Task | null
  tasks: readonly Task[]
}) {
  const [mode, setMode] = useState<'defer' | 'edit' | 'view'>('view')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [type, setType] = useState('')
  const [projectRef, setProjectRef] = useState('')
  const [priority, setPriority] = useState('')
  const [deadline, setDeadline] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [deferDate, setDeferDate] = useState('')
  const taskDeliverables = task ? deliverables.filter(item => item.taskId === task.id) : []
  const capability = task ? taskActionCapability(task) : null

  useEffect(() => {
    setMode('view')
    setPending(false)
    setError(null)
    setCompleteOpen(false)
    setTitle(task?.title ?? '')
    setType(task?.typeLabel ?? '')
    setProjectRef(
      task?.projectRef
        ? (projects.find(item => item.id === task.projectRef || item.name === task.projectRef)?.id ?? '')
        : ''
    )
    setPriority(task?.priorityLabel ?? '')
    setDeadline(deadlineInputValue(task?.deadline ?? null))
    setNextAction(task?.nextAction ?? '')
    setDeferDate(deadlineInputValue(task?.deadline ?? null))
    // A same-task refetch after a 409 must not erase the user's failed draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, task?.id])

  const currentProjectRef = task?.projectRef
    ? (projects.find(item => item.id === task.projectRef || item.name === task.projectRef)?.id ?? '')
    : ''

  const editChanges: TaskEditChanges = task
    ? {
        ...(title.trim() !== task.title ? { title: title.trim() } : {}),
        ...(type !== (task.typeLabel ?? '') ? { type: type || null } : {}),
        ...(projectRef !== currentProjectRef ? { projectRef: projectRef || null } : {}),
        ...(priority !== (task.priorityLabel ?? '') ? { priority: priority || null } : {}),
        ...(deadline !== deadlineInputValue(task.deadline) ? { deadline: deadline || null } : {}),
        ...(nextAction.trim() !== (task.nextAction ?? '') ? { nextAction: nextAction.trim() || null } : {})
      }
    : {}

  const hasEditChanges = Object.keys(editChanges).length > 0

  async function runMutation(action: () => Promise<unknown>, successMode: 'view' | null = 'view') {
    if (pending) {
      return
    }

    setPending(true)
    setError(null)

    try {
      await action()

      if (successMode) {
        setMode(successMode)
      }

      await onRefresh()
    } catch (mutationError) {
      if (isRevisionConflict(mutationError)) {
        setError('任务数据已变化，已重新读取最新事实；请核对后再次提交。')
        await onRefresh()
      } else {
        setError('任务更新失败，当前权威数据未被乐观覆盖。')
      }

      throw mutationError
    } finally {
      setPending(false)
    }
  }

  async function saveEdit() {
    if (!task?.revision || !hasEditChanges || !title.trim()) {
      return
    }

    try {
      await runMutation(() =>
        mutationTransport.editTask(task.id, {
          clientRequestId: requestId(),
          expectedRevision: task.revision!,
          changes: editChanges
        })
      )
    } catch {
      // Inline state above is authoritative; keep the inspector and form open.
    }
  }

  async function saveDefer() {
    if (!task?.revision || !deferDate) {
      return
    }

    try {
      await runMutation(() =>
        mutationTransport.deferTask(task.id, {
          clientRequestId: requestId(),
          expectedRevision: task.revision!,
          deadline: deferDate
        })
      )
    } catch {
      // Preserve the selected task and explicit date for correction/retry.
    }
  }

  async function completeTask() {
    if (!task?.revision) {
      return
    }

    await runMutation(
      () =>
        mutationTransport.completeTask(task.id, {
          clientRequestId: requestId(),
          expectedRevision: task.revision!
        }),
      null
    )
  }

  return (
    <Sheet onOpenChange={next => !next && onClose()} open={open}>
      <SheetContent aria-label="任务详情" className="sm:max-w-md" side="right">
        {task && (
          <>
            <SheetHeader className="border-b border-(--ui-stroke-quaternary) pr-10">
              <SheetTitle>{task.title}</SheetTitle>
              <SheetDescription>{task.id} · 受控任务事实</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
              {tasks.length > 1 && (
                <div className="border-b border-(--ui-stroke-quaternary) py-3">
                  <div className="mb-2 text-[0.6875rem] text-(--ui-text-quaternary)">同项目任务</div>
                  <div className="flex flex-wrap gap-1.5">
                    {tasks.map(candidate => (
                      <button
                        aria-pressed={candidate.id === task.id}
                        className={`rounded-md px-2 py-1 text-[0.6875rem] ${
                          candidate.id === task.id
                            ? 'bg-(--ui-control-active-background) text-foreground'
                            : 'bg-foreground/5 text-(--ui-text-tertiary) hover:text-foreground'
                        }`}
                        disabled={pending}
                        key={candidate.id}
                        onClick={() => onSelectTask(candidate.id)}
                        type="button"
                      >
                        {candidate.id}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {mode === 'edit' ? (
                <div className="space-y-4 pt-4">
                  <label className="block text-xs">
                    <span className="mb-1 block text-(--ui-text-tertiary)">任务名称</span>
                    <Input disabled={pending} onChange={event => setTitle(event.target.value)} value={title} />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block text-(--ui-text-tertiary)">类型</span>
                    <Select
                      disabled={pending}
                      onValueChange={value => setType(value === 'unset' ? '' : value)}
                      value={type || 'unset'}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">未设置</SelectItem>
                        {['教学', '科研', '行政', '创意制作'].map(value => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block text-(--ui-text-tertiary)">所属项目</span>
                    <Select
                      disabled={pending}
                      onValueChange={value => setProjectRef(value === 'unset' ? '' : value)}
                      value={projectRef || 'unset'}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">未设置</SelectItem>
                        {projects.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block text-(--ui-text-tertiary)">优先级</span>
                    <Select
                      disabled={pending}
                      onValueChange={value => setPriority(value === 'unset' ? '' : value)}
                      value={priority || 'unset'}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unset">未设置</SelectItem>
                        {['低', '普通', '高', '紧急'].map(value => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block text-(--ui-text-tertiary)">DDL</span>
                    <Input
                      disabled={pending}
                      onChange={event => setDeadline(event.target.value)}
                      type="date"
                      value={deadline}
                    />
                  </label>
                  <label className="block text-xs">
                    <span className="mb-1 block text-(--ui-text-tertiary)">下一步行动</span>
                    <Textarea
                      disabled={pending}
                      onChange={event => setNextAction(event.target.value)}
                      value={nextAction}
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button disabled={pending} onClick={() => setMode('view')} size="sm" variant="ghost">
                      取消
                    </Button>
                    <Button
                      disabled={pending || !hasEditChanges || !title.trim()}
                      onClick={() => void saveEdit()}
                      size="sm"
                    >
                      {pending ? '提交中' : '保存'}
                    </Button>
                  </div>
                </div>
              ) : mode === 'defer' ? (
                <div className="space-y-4 pt-4">
                  <label className="block text-xs">
                    <span className="mb-1 block text-(--ui-text-tertiary)">明确的新 DDL</span>
                    <Input
                      disabled={pending}
                      onChange={event => setDeferDate(event.target.value)}
                      type="date"
                      value={deferDate}
                    />
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button disabled={pending} onClick={() => setMode('view')} size="sm" variant="ghost">
                      取消
                    </Button>
                    <Button disabled={pending || !deferDate} onClick={() => void saveDefer()} size="sm">
                      {pending ? '提交中' : '确认延期'}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-4 pt-3">
                    <Fact label="项目" value={project.name} />
                    <Fact label="类型" value={task.typeLabel} />
                    <Fact label="状态" value={task.statusLabel ?? TASK_STATUS_LABELS[task.status]} />
                    <Fact label="优先级" value={task.priorityLabel ?? PRIORITY_LABELS[task.priority]} />
                    <Fact label="DDL" value={task.deadline ? dateLabel(task.deadline) : null} />
                    <Fact label="估时" value={task.estimate} />
                    <Fact label="执行者" value={task.executor} />
                    <Fact label="WorkBridge 状态" value={WORKBRIDGE_LABELS[task.workBridgeState]} />
                    <Fact label="需要人工确认" value={task.requiresHumanApproval} />
                    <Fact label="来源" value={task.origin} />
                    <Fact label="创建时间" value={task.createdAt ? dateLabel(task.createdAt) : null} />
                    <Fact label="更新时间" value={task.updatedAt ? dateLabel(task.updatedAt) : null} />
                  </dl>
                  <div className="mt-5 space-y-4 border-t border-(--ui-stroke-quaternary) pt-4">
                    <Fact label="下一步行动" value={task.nextAction} />
                    <Fact label="Artifact URL" value={task.artifactUrl} />
                    <Fact
                      label="Deliverable relation"
                      value={taskDeliverables.length ? taskDeliverables.map(item => item.filename).join('、') : null}
                    />
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2 border-t border-(--ui-stroke-quaternary) pt-4">
                    <Button
                      disabled={pending || !capability?.canEdit}
                      onClick={() => setMode('edit')}
                      size="sm"
                      variant="secondary"
                    >
                      编辑
                    </Button>
                    <Button
                      disabled={pending || !capability?.canDefer}
                      onClick={() => setMode('defer')}
                      size="sm"
                      variant="secondary"
                    >
                      延期
                    </Button>
                    <Button
                      disabled={pending || !capability?.canComplete}
                      onClick={() => setCompleteOpen(true)}
                      size="sm"
                    >
                      完成
                    </Button>
                  </div>
                  {capability?.reason === 'active_execution' && (
                    <p className="mt-3 text-xs text-(--ui-text-tertiary)">
                      任务正在由 WorkBridge 执行，Workspace 写操作已锁定。
                    </p>
                  )}
                  {capability?.reason === 'state_protected' && (
                    <p className="mt-3 text-xs text-(--ui-text-tertiary)">当前状态不允许编辑、延期或最终完成。</p>
                  )}
                  {capability?.reason === 'missing_revision' && (
                    <p className="mt-3 text-xs text-(--ui-text-tertiary)">
                      当前 snapshot 缺少 revision，写操作已关闭。
                    </p>
                  )}
                </>
              )}
              {error && (
                <p className="mt-4 text-xs text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
            <ConfirmDialog
              confirmLabel="确认完成"
              description="这会把 WorkData 任务状态最终写为“已完成”；不会调用 WorkBridge worker-complete。"
              onClose={() => setCompleteOpen(false)}
              onConfirm={completeTask}
              open={completeOpen}
              title="确认任务最终完成"
            />
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function ReadState({
  action,
  copy,
  title
}: {
  action?: { label: string; onClick: () => void }
  copy: string
  title: string
}) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) p-6 text-center">
      <Codicon className="mx-auto text-(--ui-text-quaternary)" name="warning" size="1.1rem" />
      <h2 className="mt-3 text-sm font-medium">{title}</h2>
      <p className="mt-2 text-xs text-(--ui-text-tertiary)">{copy}</p>
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

export function ProjectDetail({
  gatewayState,
  localAccess,
  mutationTransport,
  onBack,
  projectId,
  transport
}: {
  gatewayState: string
  localAccess: LocalDeliverableAccess
  mutationTransport: WorkspaceTaskMutationTransport & WorkspaceProductionActionTransport
  onBack: () => void
  projectId: string
  transport: WorkspaceReadTransport
}) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [localAccessMessage, setLocalAccessMessage] = useState<string | null>(null)

  const result = useQuery({
    queryKey: ['mousai-workspace', 'project-gallery', transport.scope],
    queryFn: ({ signal }) => readWorkspaceSnapshot(transport, { signal }),
    enabled: gatewayState === 'open',
    refetchOnMount: 'always',
    retry: false,
    staleTime: 0
  })

  const model = useMemo(
    () => (result.data ? projectDetailModel(result.data.snapshot, projectId) : null),
    [projectId, result.data]
  )

  const selectedTask = model?.tasks.find(task => task.id === selectedTaskId) ?? null

  if (gatewayState !== 'open') {
    return <ReadState copy="Remote Gateway 恢复后将重新读取当前项目。" title="等待 Gateway 连接" />
  }

  if (result.isPending || result.isFetching) {
    return <div aria-label="正在读取项目详情" className="h-64 animate-pulse rounded-lg bg-foreground/5" />
  }

  if (result.isError) {
    const unavailable = result.error instanceof WorkspaceTransportUnavailableError

    return (
      <ReadState
        action={unavailable ? undefined : { label: '重试', onClick: () => void result.refetch() }}
        copy="项目详情读取失败；没有用缓存或演示数据替代。"
        title={unavailable ? '安全只读链路不可用' : '项目详情读取失败'}
      />
    )
  }

  if (!model) {
    return (
      <ReadState
        action={{ label: '返回项目', onClick: onBack }}
        copy="当前 snapshot 中没有该 Project ID；可能已删除或关系已变更。"
        title="项目不存在"
      />
    )
  }

  const { project } = model

  return (
    <div>
      <button
        className="mb-4 flex items-center gap-1 text-xs text-(--ui-text-tertiary) hover:text-foreground"
        onClick={onBack}
        type="button"
      >
        <Codicon name="arrow-left" size="0.75rem" />
        返回项目
      </button>

      <header className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[0.6875rem] tracking-[0.12em] text-(--ui-text-quaternary)">{project.id}</div>
            <h2 className="mt-1 text-lg font-medium">{project.name}</h2>
          </div>
          <span className="rounded-full border border-(--ui-stroke-quaternary) px-2 py-1 text-xs text-(--ui-text-tertiary)">
            {project.typeLabel}
          </span>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 md:grid-cols-4">
          <Fact label="当前状态" value={project.status} />
          <Fact label="当前阶段" value={project.stage} />
          <Fact label="总体进度" value={project.progress === null ? null : `${project.progress}%`} />
          <Fact label="下一个 DDL" value={project.nextDeadline ? dateLabel(project.nextDeadline) : null} />
          <Fact label="下一步" value={project.nextAction} />
          <Fact label="风险" value={project.risk} />
          <Fact
            label="个人 / 团队"
            value={project.ownership === 'unset' ? null : project.ownership === 'team' ? '团队' : '个人'}
          />
          <Fact label="标签" value={project.tags.length ? project.tags.join('、') : null} />
        </dl>
      </header>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.75fr)]">
        <div className="space-y-7">
          <Section title="当前任务">
            {model.tasks.length === 0 ? (
              <EmptyReadState copy="当前项目没有关联的正式任务。" />
            ) : (
              <div className="space-y-2">
                {model.tasks.map(task => (
                  <button
                    className="grid w-full gap-2 rounded-lg border border-(--ui-stroke-quaternary) p-3 text-left hover:bg-(--ui-hover-overlay) sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                    key={task.id}
                    onClick={() => setSelectedTaskId(task.id)}
                    type="button"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{task.title}</div>
                      <div className="mt-1 truncate text-[0.6875rem] text-(--ui-text-quaternary)">{task.id}</div>
                    </div>
                    <div className="text-xs text-(--ui-text-tertiary)">
                      <div>{task.statusLabel ?? TASK_STATUS_LABELS[task.status]}</div>
                      <div className="mt-1 text-[0.6875rem] text-(--ui-text-quaternary)">
                        {task.priorityLabel ?? PRIORITY_LABELS[task.priority]} ·{' '}
                        {WORKBRIDGE_LABELS[task.workBridgeState]}
                      </div>
                    </div>
                    <div className="text-xs text-(--ui-text-quaternary)">
                      <div>{task.deadline ? dateLabel(task.deadline) : 'DDL 未设置'}</div>
                      <div className="mt-1">
                        估时 {display(task.estimate)} · 执行者 {display(task.executor)}
                      </div>
                    </div>
                    <div className="sm:col-span-3">
                      <div className="text-[0.6875rem] text-(--ui-text-quaternary)">下一步</div>
                      <div className="mt-1 line-clamp-2 text-xs text-(--ui-text-secondary)">
                        {display(task.nextAction)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Section>

          <Section title="Deliverable / Production Center">
            {model.productionReviewItems.length === 0 ? (
              <EmptyReadState copy="当前项目没有可确认关联的正式任务。" />
            ) : (
              <div className="space-y-3">
                {model.productionReviewItems.map(item => (
                  <ProductionReviewCard
                    item={item}
                    key={item.task.id}
                    onOpenLocal={workId => {
                      setLocalAccessMessage(null)
                      void localAccess.revealOutbox(workId).then(opened => {
                        if (!opened) {
                          setLocalAccessMessage('本机产物目录不可用；未尝试其他路径。')
                        }
                      })
                    }}
                    onRefresh={() => result.refetch()}
                    transport={mutationTransport}
                  />
                ))}
              </div>
            )}
            {localAccessMessage && <p className="mt-2 text-xs text-destructive">{localAccessMessage}</p>}
          </Section>

          <Section title="最近活动">
            {model.activities.length === 0 ? (
              <EmptyReadState copy="当前没有正式 Activity source。" />
            ) : (
              <ul className="space-y-2">
                {model.activities.map(item => (
                  <li className="text-xs" key={item.id}>
                    {item.summary}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-7">
          <Section title="四层时间轴">
            <div className="space-y-3">
              {model.timeline.map(layer => (
                <TimelineLayer key={layer.key} layer={layer} />
              ))}
            </div>
          </Section>
          <Section title="对接人 / 等待事项">
            <dl className="grid grid-cols-2 gap-4 rounded-lg border border-(--ui-stroke-quaternary) p-3">
              <Fact label="对接人" value={null} />
              <Fact label="等待事项" value={null} />
            </dl>
          </Section>
        </div>
      </div>

      <TaskInspector
        deliverables={model.deliverables}
        mutationTransport={mutationTransport}
        onClose={() => setSelectedTaskId(null)}
        onRefresh={() => result.refetch()}
        onSelectTask={setSelectedTaskId}
        open={selectedTask !== null}
        project={project}
        projects={result.data?.snapshot.projects ?? []}
        task={selectedTask}
        tasks={model.tasks}
      />
    </div>
  )
}
