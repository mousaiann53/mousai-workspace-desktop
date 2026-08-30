import { Codicon, type HermesPlugin, host, type RouteContribution, ROUTES_AREA, useValue } from '@hermes/plugin-sdk'
import { type ReactNode } from 'react'
import { useSearchParams } from 'react-router'

import { Dashboard } from './dashboard'
import type { IntakeSurface } from './intake-contracts'
import { IntakeAuxiliarySurface, IntakeSurfaceNav } from './intake-operations'
import { PlanningCalendar } from './planning-calendar'
import { ProjectDetail } from './project-detail'
import { ProjectGallery } from './project-gallery'
import { ResourceArchiveView } from './resource-archive'
import { ReviewCostCenter, type ReviewFoundationSurface } from './review-cost-center'
import { createLocalDeliverableAccess, type LocalDeliverableAccess } from './service-local-deliverables'
import type { WorkspacePlanningMutationTransport } from './service-planning-mutation'
import type { WorkspaceProductionActionTransport } from './service-production-actions'
import { createTaskCreateDraftStore, type TaskCreateDraftStore } from './service-task-create-draft'
import type { WorkspaceTaskMutationTransport } from './service-task-mutation'
import type { WorkspaceReadTransport } from './service-workspace-read'
import { TaskCenter } from './task-center'
import { createPluginWorkspaceReadTransport } from './transport-plugin-rest'
import { projectWorkspaceLink, type WorkspaceFocusPanel } from './workspace-links'

const ID = 'mousai-workspace'
const DEFAULT_ROUTE = '/workspace'

const WORKSPACE_SECTIONS = [
  { id: 'dashboard', label: '看板', path: DEFAULT_ROUTE, icon: 'dashboard' },
  { id: 'projects', label: '项目', path: '/workspace/projects', icon: 'project' },
  { id: 'todos', label: '待办', path: '/workspace/todos', icon: 'checklist' },
  { id: 'calendar', label: '日程', path: '/workspace/calendar', icon: 'calendar' },
  { id: 'review', label: '复盘', path: '/workspace/review', icon: 'history' },
  { id: 'resources', label: '资料', path: '/workspace/resources', icon: 'library' },
  { id: 'memory', label: '工作记忆', path: '/workspace/memory', icon: 'database' },
  { id: 'archive', label: '归档', path: '/workspace/archive', icon: 'archive' }
] as const

type WorkspaceSection = (typeof WORKSPACE_SECTIONS)[number]
type WorkspaceSectionId = WorkspaceSection['id']

let lastWorkspaceRoute = DEFAULT_ROUTE

function navigateWorkspace(path: string) {
  lastWorkspaceRoute = path
  host.navigate(path)
}

function WorkspaceNavPane() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-(--ui-sidebar-surface-background)">
      <div className="border-b border-(--ui-stroke-quaternary) px-3 py-3">
        <div className="text-[0.6875rem] font-medium tracking-[0.16em] text-(--ui-text-quaternary)">
          MOUSAI WORKSPACE
        </div>
      </div>

      <nav
        aria-label="Workspace"
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {WORKSPACE_SECTIONS.map(section => (
          <button
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[0.8125rem] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-hover-overlay) hover:text-foreground"
            key={section.id}
            onClick={() => navigateWorkspace(section.path)}
            type="button"
          >
            <Codicon className="shrink-0 text-(--ui-text-tertiary)" name={section.icon} size="0.85rem" />
            <span>{section.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function WorkspacePage({ title, eyebrow, children }: { title: string; eyebrow?: string; children: ReactNode }) {
  return (
    <main className="h-full min-h-0 overflow-y-auto bg-(--ui-editor-surface-background) px-3 pb-10 pt-10 text-foreground [-ms-overflow-style:none] [scrollbar-width:none] sm:px-6 sm:pt-14 [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto w-full max-w-6xl">
        {eyebrow && (
          <div className="mb-2 text-[0.6875rem] font-medium tracking-[0.16em] text-(--ui-text-quaternary)">
            {eyebrow}
          </div>
        )}
        <h1 className="text-xl font-medium tracking-tight">{title}</h1>
        <div className="mt-6">{children}</div>
      </div>
    </main>
  )
}

function EmptyPanel({ title, copy }: { title: string; copy: string }) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="mt-2 text-xs leading-5 text-(--ui-text-tertiary)">{copy}</p>
    </section>
  )
}

function DashboardPage({ transport }: { transport: WorkspaceTransport }) {
  const gatewayState = useValue(host.state.gateway)

  return (
    <WorkspacePage eyebrow="WORKSPACE" title="看板">
      <Dashboard
        gatewayState={gatewayState}
        onOpenItem={(item, panel) => {
          if (item.projectId) {
            navigateWorkspace(projectWorkspaceLink(item.projectId, { workId: item.task.id, panel }))
          }
        }}
        onOpenTask={(workId, projectId) =>
          navigateWorkspace(
            projectId
              ? projectWorkspaceLink(projectId, { workId, panel: 'task' })
              : `/workspace/todos?work=${encodeURIComponent(workId)}`
          )
        }
        transport={transport}
      />
    </WorkspacePage>
  )
}

function CalendarPage({ transport }: { transport: WorkspaceTransport }) {
  const gatewayState = useValue(host.state.gateway)

  return (
    <WorkspacePage eyebrow="WORKSPACE" title="日程">
      <PlanningCalendar
        gatewayState={gatewayState}
        onOpenItem={item => {
          if (item.projectId) {
            navigateWorkspace(
              projectWorkspaceLink(item.projectId, {
                workId: item.taskId,
                panel: item.deliverableWorkId ? 'deliverable' : item.taskId ? 'task' : null
              })
            )
          } else if (item.taskId) {
            navigateWorkspace(`/workspace/todos?work=${encodeURIComponent(item.taskId)}`)
          }
        }}
        onOpenTask={(workId, projectId) =>
          navigateWorkspace(
            projectId
              ? projectWorkspaceLink(projectId, { workId, panel: 'task' })
              : `/workspace/todos?work=${encodeURIComponent(workId)}`
          )
        }
        transport={transport}
      />
    </WorkspacePage>
  )
}

function ReviewPage({ transport }: { transport: WorkspaceTransport }) {
  const gatewayState = useValue(host.state.gateway)
  const [searchParams] = useSearchParams()
  const surfaceValue = searchParams.get('surface')

  const surface: ReviewFoundationSurface = [
    'backup',
    'brief',
    'cost',
    'providers',
    'release',
    'security',
    'settings'
  ].includes(surfaceValue ?? '')
    ? (surfaceValue as ReviewFoundationSurface)
    : 'review'

  return (
    <WorkspacePage eyebrow="WORKSPACE" title="复盘">
      <ReviewCostCenter
        gatewayState={gatewayState}
        onNavigate={next =>
          navigateWorkspace(next === 'review' ? '/workspace/review' : `/workspace/review?surface=${next}`)
        }
        onOpenTask={task => navigateWorkspace(`/workspace/todos?work=${encodeURIComponent(task.id)}`)}
        surface={surface}
        transport={transport}
      />
    </WorkspacePage>
  )
}

type WorkspaceTransport = WorkspaceReadTransport &
  WorkspaceTaskMutationTransport &
  WorkspaceProductionActionTransport &
  WorkspacePlanningMutationTransport

function ProjectsPage({
  localAccess,
  transport
}: {
  localAccess: LocalDeliverableAccess
  transport: WorkspaceTransport
}) {
  const gatewayState = useValue(host.state.gateway)
  const [searchParams] = useSearchParams()
  const projectId = searchParams.get('project')
  const workId = searchParams.get('work')
  const panelValue = searchParams.get('panel')

  const panel: WorkspaceFocusPanel | null = ['deliverable', 'history', 'skill', 'source', 'task'].includes(
    panelValue ?? ''
  )
    ? (panelValue as WorkspaceFocusPanel)
    : null

  return (
    <WorkspacePage eyebrow="WORKSPACE" title={projectId ? '项目详情' : '项目'}>
      {projectId ? (
        <ProjectDetail
          focusPanel={panel}
          focusWorkId={workId}
          gatewayState={gatewayState}
          localAccess={localAccess}
          mutationTransport={transport}
          onBack={() => navigateWorkspace('/workspace/projects')}
          onClearFocus={() => navigateWorkspace(projectWorkspaceLink(projectId))}
          onNavigateFocus={(nextWorkId, nextPanel) =>
            navigateWorkspace(projectWorkspaceLink(projectId, { workId: nextWorkId, panel: nextPanel }))
          }
          projectId={projectId}
          transport={transport}
        />
      ) : (
        <ProjectGallery
          gatewayState={gatewayState}
          onOpenProject={id => navigateWorkspace(`/workspace/projects?project=${encodeURIComponent(id)}`)}
          transport={transport}
        />
      )}
    </WorkspacePage>
  )
}

function TasksPage({ draftStore, transport }: { draftStore: TaskCreateDraftStore; transport: WorkspaceTransport }) {
  const gatewayState = useValue(host.state.gateway)
  const [searchParams] = useSearchParams()
  const focusWorkId = searchParams.get('work')
  const panelValue = searchParams.get('panel')
  const focusPanel = panelValue === 'source' ? 'source' : 'task'
  const surfaceValue = searchParams.get('surface')

  const surface: IntakeSurface = ['health', 'notifications', 'scope'].includes(surfaceValue ?? '')
    ? (surfaceValue as IntakeSurface)
    : 'inbox'

  return (
    <WorkspacePage eyebrow="WORKSPACE" title="待办">
      <IntakeSurfaceNav
        active={surface}
        onNavigate={next =>
          navigateWorkspace(next === 'inbox' ? '/workspace/todos' : `/workspace/todos?surface=${next}`)
        }
      />
      {surface === 'inbox' ? (
        <TaskCenter
          draftStore={draftStore}
          focusPanel={focusPanel}
          focusWorkId={focusWorkId}
          gatewayState={gatewayState}
          onNavigateTask={(workId, panel = 'task') =>
            navigateWorkspace(
              workId
                ? `/workspace/todos?work=${encodeURIComponent(workId)}&panel=${encodeURIComponent(panel)}`
                : '/workspace/todos'
            )
          }
          onOpenDeliverable={(workId, projectId) => {
            if (projectId) {
              navigateWorkspace(projectWorkspaceLink(projectId, { workId, panel: 'deliverable' }))
            }
          }}
          transport={transport}
        />
      ) : (
        <IntakeAuxiliarySurface gatewayState={gatewayState} surface={surface} transport={transport} />
      )}
    </WorkspacePage>
  )
}

function ResourceArchivePage({
  localAccess,
  mode,
  transport
}: {
  localAccess: LocalDeliverableAccess
  mode: 'archive' | 'resources'
  transport: WorkspaceTransport
}) {
  const gatewayState = useValue(host.state.gateway)

  return (
    <WorkspacePage eyebrow="WORKSPACE" title={mode === 'resources' ? '资料' : '归档'}>
      <ResourceArchiveView
        gatewayState={gatewayState}
        localAccess={localAccess}
        mode={mode}
        onOpenResource={entry => {
          if (entry.project) {
            navigateWorkspace(
              projectWorkspaceLink(entry.project.id, { workId: entry.deliverable.workId, panel: 'deliverable' })
            )
          }
        }}
        onOpenTask={(task, projectId) =>
          navigateWorkspace(projectWorkspaceLink(projectId, { workId: task.id, panel: 'task' }))
        }
        transport={transport}
      />
    </WorkspacePage>
  )
}

function PendingPage({ section }: { section: WorkspaceSection }) {
  return (
    <WorkspacePage eyebrow="WORKSPACE" title={section.label}>
      <EmptyPanel copy="该入口已经纳入 Workspace 路由，但本阶段不提前扩张功能范围。" title="尚未建设" />
    </WorkspacePage>
  )
}

function renderSection(
  section: WorkspaceSection,
  transport: WorkspaceTransport,
  localAccess: LocalDeliverableAccess,
  draftStore: TaskCreateDraftStore
) {
  if (section.id === 'dashboard') {
    return <DashboardPage transport={transport} />
  }

  if (section.id === 'projects') {
    return <ProjectsPage localAccess={localAccess} transport={transport} />
  }

  if (section.id === 'todos') {
    return <TasksPage draftStore={draftStore} transport={transport} />
  }

  if (section.id === 'calendar') {
    return <CalendarPage transport={transport} />
  }

  if (section.id === 'review') {
    return <ReviewPage transport={transport} />
  }

  if (section.id === 'resources') {
    return <ResourceArchivePage localAccess={localAccess} mode="resources" transport={transport} />
  }

  if (section.id === 'archive') {
    return <ResourceArchivePage localAccess={localAccess} mode="archive" transport={transport} />
  }

  return <PendingPage section={section} />
}

function routeContribution(
  section: WorkspaceSection,
  transport: WorkspaceTransport,
  localAccess: LocalDeliverableAccess,
  draftStore: TaskCreateDraftStore
) {
  return {
    id: `route-${section.id}`,
    area: ROUTES_AREA,
    data: { path: section.path } satisfies RouteContribution,
    render: () => renderSection(section, transport, localAccess, draftStore)
  }
}

const plugin: HermesPlugin = {
  id: ID,
  name: 'Mousai Workspace',
  description: 'Mousai work shell: Workspace navigation and V1-S1 page routes.',
  defaultEnabled: true,
  register(ctx) {
    const workspaceReadTransport = createPluginWorkspaceReadTransport(ctx.rest)
    const localAccess = createLocalDeliverableAccess(ctx.os.revealPath)
    const draftStore = createTaskCreateDraftStore(ctx.storage)

    ctx.registerMany([
      {
        id: 'pane',
        area: 'panes',
        order: -100,
        title: 'Workspace',
        data: {
          placement: 'left',
          width: '260px',
          collapsible: true,
          showCloseButton: false,
          hideOnly: true,
          dock: { pane: 'sessions', pos: 'center', before: 'sessions', enforce: true }
        },
        render: () => <WorkspaceNavPane />
      },
      ...WORKSPACE_SECTIONS.map(section => routeContribution(section, workspaceReadTransport, localAccess, draftStore))
    ])

    if (typeof host.paneVisibility === 'function') {
      const visible = host.paneVisibility(`${ID}:pane`)

      const stop = visible.listen(isVisible => {
        if (isVisible) {
          host.navigate(lastWorkspaceRoute)
        }
      })

      ctx.onDispose(stop)
    }
  }
}

export { DEFAULT_ROUTE, WORKSPACE_SECTIONS, type WorkspaceSectionId }
export default plugin
