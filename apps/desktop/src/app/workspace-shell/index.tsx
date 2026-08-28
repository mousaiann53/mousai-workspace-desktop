import { useLocation, useNavigate } from 'react-router'

import { findGroupOfPane } from '@/components/pane-shell/tree/model'
import { $layoutTree, reorderTreePanes } from '@/components/pane-shell/tree/store'
import type { Contribution } from '@/contrib/types'
import { useI18n } from '@/i18n'
import type { Locale } from '@/i18n'
import { Archive, Box, Brain, Clipboard, Clock, FileText, LayoutDashboard, RefreshCw } from '@/lib/icons'

import { navigateToWorkspacePage, ROUTES_AREA } from '../routes'

export const WORKSPACE_SHELL_PANE_ID = 'mousai-workspace:shell'

export type WorkspaceSectionId =
  'dashboard' | 'projects' | 'tasks' | 'calendar' | 'reviews' | 'resources' | 'memory' | 'archive'

export interface WorkspaceSectionDefinition {
  id: WorkspaceSectionId
  path: string
}

export const WORKSPACE_SECTIONS: readonly WorkspaceSectionDefinition[] = [
  { id: 'dashboard', path: '/workspace' },
  { id: 'projects', path: '/workspace-projects' },
  { id: 'tasks', path: '/workspace-tasks' },
  { id: 'calendar', path: '/workspace-calendar' },
  { id: 'reviews', path: '/workspace-reviews' },
  { id: 'resources', path: '/workspace-resources' },
  { id: 'memory', path: '/workspace-memory' },
  { id: 'archive', path: '/workspace-archive' }
] as const

interface WorkspaceShellCopy {
  ariaLabel: string
  eyebrow: string
  shellReady: string
  shellReadyDescription: string
  stage: string
  sections: Record<WorkspaceSectionId, string>
}

const COPY: Record<Locale, WorkspaceShellCopy> = {
  en: {
    ariaLabel: 'Workspace navigation',
    eyebrow: 'Mousai workspace',
    shellReady: 'Workspace shell is ready',
    shellReadyDescription: 'Project data and actions arrive in M3. This milestone only establishes navigation.',
    stage: 'M2-B · Shell',
    sections: {
      dashboard: 'Dashboard',
      projects: 'Projects',
      tasks: 'Tasks',
      calendar: 'Calendar',
      reviews: 'Reviews',
      resources: 'Resources',
      memory: 'Work memory',
      archive: 'Archive'
    }
  },
  zh: {
    ariaLabel: '工作区导航',
    eyebrow: 'Mousai workspace',
    shellReady: 'Workspace 基础壳已就绪',
    shellReadyDescription: '项目数据和操作将在 M3 接入。本阶段只建立导航与页面边界。',
    stage: 'M2-B · 基础壳',
    sections: {
      dashboard: '看板',
      projects: '项目',
      tasks: '待办',
      calendar: '日程',
      reviews: '复盘',
      resources: '资料',
      memory: '工作记忆',
      archive: '归档'
    }
  },
  'zh-hant': {
    ariaLabel: '工作區導覽',
    eyebrow: 'Mousai workspace',
    shellReady: 'Workspace 基礎殼已就緒',
    shellReadyDescription: '專案資料和操作將在 M3 接入。本階段只建立導覽與頁面邊界。',
    stage: 'M2-B · 基礎殼',
    sections: {
      dashboard: '看板',
      projects: '專案',
      tasks: '待辦',
      calendar: '日程',
      reviews: '複盤',
      resources: '資料',
      memory: '工作記憶',
      archive: '歸檔'
    }
  },
  ja: {
    ariaLabel: 'ワークスペースナビゲーション',
    eyebrow: 'Mousai workspace',
    shellReady: 'Workspace シェルの準備ができました',
    shellReadyDescription: 'プロジェクトデータと操作は M3 で接続します。この段階ではナビゲーションのみを構築します。',
    stage: 'M2-B · シェル',
    sections: {
      dashboard: 'ダッシュボード',
      projects: 'プロジェクト',
      tasks: 'タスク',
      calendar: 'カレンダー',
      reviews: 'レビュー',
      resources: '資料',
      memory: 'ワークメモリ',
      archive: 'アーカイブ'
    }
  },
  ar: {
    ariaLabel: 'التنقل في مساحة العمل',
    eyebrow: 'Mousai workspace',
    shellReady: 'غلاف مساحة العمل جاهز',
    shellReadyDescription: 'ستصل بيانات المشاريع والإجراءات في M3. تنشئ هذه المرحلة التنقل وحدود الصفحات فقط.',
    stage: 'M2-B · الغلاف',
    sections: {
      dashboard: 'لوحة التحكم',
      projects: 'المشاريع',
      tasks: 'المهام',
      calendar: 'التقويم',
      reviews: 'المراجعات',
      resources: 'المصادر',
      memory: 'ذاكرة العمل',
      archive: 'الأرشيف'
    }
  }
}

const SECTION_ICONS = {
  dashboard: LayoutDashboard,
  projects: Box,
  tasks: Clipboard,
  calendar: Clock,
  reviews: RefreshCw,
  resources: FileText,
  memory: Brain,
  archive: Archive
} as const

export function workspaceShellCopy(locale: Locale): WorkspaceShellCopy {
  return COPY[locale]
}

function WorkspaceNavigation() {
  const location = useLocation()
  const navigate = useNavigate()
  const { locale } = useI18n()
  const copy = workspaceShellCopy(locale)

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="px-3 pb-2 pt-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--ui-text-tertiary)">
          {copy.eyebrow}
        </div>
      </div>
      <nav aria-label={copy.ariaLabel} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
        {WORKSPACE_SECTIONS.map(section => {
          const Icon = SECTION_ICONS[section.id]
          const active = location.pathname === section.path

          return (
            <button
              aria-current={active ? 'page' : undefined}
              className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors ${
                active
                  ? 'bg-(--chrome-action-hover) font-medium text-foreground'
                  : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground'
              }`}
              key={section.id}
              onClick={() => navigateToWorkspacePage(navigate, section.path)}
              type="button"
            >
              <Icon aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{copy.sections[section.id]}</span>
            </button>
          )
        })}
      </nav>
      <div className="border-t border-border/60 px-3 py-2 text-[10px] text-(--ui-text-tertiary)">{copy.stage}</div>
    </div>
  )
}

function WorkspaceSectionPage({ sectionId }: { sectionId: WorkspaceSectionId }) {
  const { locale } = useI18n()
  const copy = workspaceShellCopy(locale)

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background text-foreground">
      <header className="border-b border-border/70 px-6 py-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-(--ui-text-tertiary)">
          {copy.eyebrow}
        </div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">{copy.sections[sectionId]}</h1>
      </header>
      <main className="grid flex-1 place-items-center px-6 py-10">
        <section className="w-full max-w-xl rounded-lg border border-border/70 bg-card p-5 shadow-sm">
          <h2 className="text-sm font-semibold">{copy.shellReady}</h2>
          <p className="mt-2 text-sm leading-6 text-(--ui-text-secondary)">{copy.shellReadyDescription}</p>
        </section>
      </main>
    </div>
  )
}

export const workspaceShellContributions: Contribution[] = [
  {
    id: WORKSPACE_SHELL_PANE_ID,
    area: 'panes',
    title: 'WORKSPACE',
    order: -100,
    data: {
      placement: 'left',
      collapsible: true,
      dock: { pane: 'sessions', pos: 'center', enforce: true },
      showCloseButton: false,
      hideOnly: true
    },
    render: () => <WorkspaceNavigation />
  },
  ...WORKSPACE_SECTIONS.map((section, index) => ({
    id: `mousai-workspace:${section.id}`,
    area: ROUTES_AREA,
    title: COPY.en.sections[section.id],
    order: index,
    data: { path: section.path },
    render: () => <WorkspaceSectionPage sectionId={section.id} />
  }))
]

/** Keep the product-level strip deterministic on persisted M1 layouts without
 *  stealing the active SESSIONS/BOTS tab. Runs once after pane adoption. */
export function ensureWorkspaceShellTabOrder(): void {
  const tree = $layoutTree.get()

  if (!tree) {
    return
  }

  const host = findGroupOfPane(tree, WORKSPACE_SHELL_PANE_ID)

  if (host && host.panes[0] !== WORKSPACE_SHELL_PANE_ID) {
    reorderTreePanes(host.id, [WORKSPACE_SHELL_PANE_ID], 0)
  }
}
