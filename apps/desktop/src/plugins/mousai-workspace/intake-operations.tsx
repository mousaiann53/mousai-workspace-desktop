import { Button, Codicon, useQuery } from '@hermes/plugin-sdk'

import type { IntakeSurface } from './intake-contracts'
import { EMPTY_NOTIFICATION_READ_MODEL, sourceHealthFromSnapshot, WORK_SCOPE_ENTRIES } from './intake-contracts'
import { readWorkspaceSnapshot, type WorkspaceReadTransport } from './service-workspace-read'

const SURFACES: readonly { id: IntakeSurface; label: string }[] = [
  { id: 'inbox', label: '统一收件箱' },
  { id: 'scope', label: '工作来源范围' },
  { id: 'notifications', label: '通知路由' },
  { id: 'health', label: '来源状态' }
]

export function IntakeSurfaceNav({
  active,
  onNavigate
}: {
  active: IntakeSurface
  onNavigate: (surface: IntakeSurface) => void
}) {
  return (
    <nav
      aria-label="Intake foundation"
      className="mb-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {SURFACES.map(surface => (
        <Button
          aria-pressed={active === surface.id}
          key={surface.id}
          onClick={() => onNavigate(surface.id)}
          size="sm"
          variant={active === surface.id ? 'default' : 'secondary'}
        >
          {surface.label}
        </Button>
      ))}
    </nav>
  )
}

function ContractUnavailable({ children, title }: { children: string; title: string }) {
  return (
    <section className="rounded-lg border border-(--ui-stroke-quaternary) bg-(--ui-sidebar-surface-background) p-5">
      <div className="flex items-start gap-3">
        <Codicon className="mt-0.5 text-(--ui-text-quaternary)" name="circle-slash" size="1rem" />
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-(--ui-text-tertiary)">{children}</p>
        </div>
      </div>
    </section>
  )
}

function WorkScopeView() {
  return (
    <div className="space-y-4">
      <ContractUnavailable title="来源 allowlist 尚无权威 contract">
        当前只显示范围候选，不读取浏览器或 localStorage，也不把这些项目保存为后端事实。写入能力保持关闭。
      </ContractUnavailable>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {WORK_SCOPE_ENTRIES.map(entry => (
          <article className="rounded-lg border border-(--ui-stroke-quaternary) p-4" key={entry.sourceType}>
            <h3 className="text-sm font-medium">{entry.label}</h3>
            <p className="mt-2 text-xs text-(--ui-text-tertiary)">未配置 · 等待 typed work scope contract</p>
            <Button className="mt-4" disabled size="sm" variant="secondary">
              配置范围
            </Button>
          </article>
        ))}
      </div>
    </div>
  )
}

function NotificationRouterView() {
  const model = EMPTY_NOTIFICATION_READ_MODEL

  return (
    <div className="space-y-4">
      <ContractUnavailable title="通知 read model 尚不可用">
        无 canonical notification contract，因此不会伪造最近通知、待发送通知或投递成功状态，也不会从 Desktop 发送消息。
      </ContractUnavailable>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-(--ui-stroke-quaternary) p-4">
          <h3 className="text-sm font-medium">最近通知</h3>
          <p className="mt-2 text-xs text-(--ui-text-tertiary)">
            {model.recent.length ? `${model.recent.length} 条` : '未设置 / 等待输入'}
          </p>
        </section>
        <section className="rounded-lg border border-(--ui-stroke-quaternary) p-4">
          <h3 className="text-sm font-medium">待发送</h3>
          <p className="mt-2 text-xs text-(--ui-text-tertiary)">
            {model.pending.length ? `${model.pending.length} 条` : '未设置 / 等待输入'}
          </p>
        </section>
      </div>
      <p className="text-xs text-(--ui-text-quaternary)">
        未来 contract 最小字段：channel、WORK-ID、reason、approval、state、created_at。
      </p>
    </div>
  )
}

function SourceHealthView({ gatewayState, transport }: { gatewayState: string; transport: WorkspaceReadTransport }) {
  const result = useQuery({
    queryKey: ['mousai-workspace', 'intake-source-health', transport.scope],
    queryFn: ({ signal }) => readWorkspaceSnapshot(transport, { signal }),
    enabled: gatewayState === 'open',
    retry: false,
    staleTime: 0
  })

  const entries = sourceHealthFromSnapshot(
    result.data?.snapshot ?? null,
    gatewayState,
    result.error instanceof Error ? result.error.message : null
  )

  return (
    <div className="space-y-4">
      <p className="text-xs leading-5 text-(--ui-text-tertiary)">
        只显示当前连接与 snapshot 能证明的事实；不主动 ping、不读取凭据，存在来源记录也不等于通道在线。
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(entry => (
          <article className="rounded-lg border border-(--ui-stroke-quaternary) p-4" key={entry.sourceType}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">{entry.label}</h2>
              <span className="text-[0.6875rem] text-(--ui-text-tertiary)">
                {entry.state === 'connected' ? '已连接' : entry.state === 'unavailable' ? '不可用' : '未知'}
              </span>
            </div>
            <dl className="mt-4 space-y-2 text-xs">
              <div>
                <dt className="text-(--ui-text-quaternary)">最后见到</dt>
                <dd className="mt-0.5 break-all">{entry.lastSeen ?? '未设置'}</dd>
              </div>
              <div>
                <dt className="text-(--ui-text-quaternary)">Scope</dt>
                <dd className="mt-0.5 break-words">{entry.scope ?? '未设置'}</dd>
              </div>
              {entry.error && <p className="break-words text-destructive">{entry.error}</p>}
            </dl>
          </article>
        ))}
      </div>
    </div>
  )
}

export function IntakeAuxiliarySurface({
  gatewayState,
  surface,
  transport
}: {
  gatewayState: string
  surface: Exclude<IntakeSurface, 'inbox'>
  transport: WorkspaceReadTransport
}) {
  if (surface === 'scope') {
    return <WorkScopeView />
  }

  if (surface === 'notifications') {
    return <NotificationRouterView />
  }

  return <SourceHealthView gatewayState={gatewayState} transport={transport} />
}
