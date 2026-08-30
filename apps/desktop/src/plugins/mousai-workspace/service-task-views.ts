import type { ProductionReview, Task } from './domain'

export type TaskReadView = 'completed' | 'inbox' | 'recent' | 'shelved' | 'today' | 'waiting'

const TERMINAL = new Set<Task['status']>(['archived', 'completed'])
const WAITING = new Set<Task['status']>(['decision_required', 'material_missing', 'review', 'waiting_local'])

const WAITING_GATES = new Set<ProductionReview['gateState']>([
  'DECISION_REQUIRED',
  'MATERIAL_MISSING',
  'WAITING_ACCEPTANCE',
  'WAITING_HUMAN_APPROVAL'
])

function shanghaiDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric'
  }).formatToParts(value)

  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? ''

  return `${part('year')}-${part('month')}-${part('day')}`
}

function addDays(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))

  return value.toISOString().slice(0, 10)
}

function deadlineKey(task: Task): string | null {
  return task.deadline ? shanghaiDateKey(new Date(task.deadline)) : null
}

export function waitingReason(task: Task, review: ProductionReview | null): string | null {
  if (review?.gateState === 'MATERIAL_MISSING' || task.status === 'material_missing') {
    return review?.missingInformation.length ? review.missingInformation.join('；') : '资料缺失'
  }

  if (review?.gateState === 'DECISION_REQUIRED' || task.status === 'decision_required') {
    return review?.bundleMeta?.decisionNote ?? '需要 Mousai 决策'
  }

  if (review?.gateState === 'WAITING_HUMAN_APPROVAL') {
    return '等待 Mousai 批准 Scope'
  }

  if (review?.gateState === 'WAITING_ACCEPTANCE' || task.status === 'review') {
    return '等待 Mousai 人工验收'
  }

  if (task.status === 'waiting_local') {
    return '等待本机领取或处理'
  }

  return null
}

export function tasksForView(
  tasks: readonly Task[],
  view: TaskReadView,
  now = new Date(),
  reviews: readonly ProductionReview[] = []
): readonly Task[] {
  const today = shanghaiDateKey(now)
  const recentEnd = addDays(today, 7)
  const reviewsByWorkId = new Map(reviews.map(review => [review.workId, review]))

  const selected = tasks.filter(task => {
    if (view === 'inbox') {
      return task.status === 'inbox'
    }

    if (view === 'waiting') {
      const review = reviewsByWorkId.get(task.id)

      return WAITING.has(task.status) || (review ? WAITING_GATES.has(review.gateState) : false)
    }

    if (view === 'shelved') {
      return task.status === 'archived'
    }

    if (view === 'completed') {
      return task.status === 'completed'
    }

    if (TERMINAL.has(task.status)) {
      return false
    }

    const deadline = deadlineKey(task)

    if (!deadline) {
      return false
    }

    return view === 'today' ? deadline === today : deadline > today && deadline <= recentEnd
  })

  return selected.toSorted((left, right) => {
    const leftDeadline = deadlineKey(left) ?? '9999-12-31'
    const rightDeadline = deadlineKey(right) ?? '9999-12-31'

    return leftDeadline.localeCompare(rightDeadline) || left.id.localeCompare(right.id)
  })
}
