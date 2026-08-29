import type { Task } from './domain'

export type TaskReadView = 'inbox' | 'recent' | 'today'

const TERMINAL = new Set<Task['status']>(['archived', 'completed'])

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

export function tasksForView(tasks: readonly Task[], view: TaskReadView, now = new Date()): readonly Task[] {
  const today = shanghaiDateKey(now)
  const recentEnd = addDays(today, 7)

  const selected = tasks.filter(task => {
    if (view === 'inbox') {
      return task.status === 'inbox'
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
