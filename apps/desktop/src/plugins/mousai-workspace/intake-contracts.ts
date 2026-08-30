import type { WorkspaceSnapshot } from './domain'
import { buildSourceIdentity, type SourceType } from './service-source-identity'

export type IntakeSurface = 'health' | 'inbox' | 'notifications' | 'scope'

export interface WorkScopeEntry {
  readonly sourceType: SourceType
  readonly label: string
  readonly state: 'approval_required' | 'disabled' | 'enabled' | 'unconfigured'
}

export interface NotificationReadModel {
  readonly availability: 'contract_unavailable'
  readonly recent: readonly never[]
  readonly pending: readonly never[]
}

export interface SourceHealthEntry {
  readonly sourceType: SourceType
  readonly label: string
  readonly state: 'connected' | 'unavailable' | 'unknown'
  readonly lastSeen: string | null
  readonly error: string | null
  readonly scope: string | null
}

const SOURCES: readonly { type: SourceType; label: string }[] = [
  { type: 'workspace', label: 'Workspace' },
  { type: 'feishu', label: 'Feishu' },
  { type: 'qq', label: 'QQ' },
  { type: 'wechat', label: 'WeChat' },
  { type: 'hermes_session', label: 'Hermes Session' },
  { type: 'manual', label: 'Manual' }
]

export const WORK_SCOPE_ENTRIES: readonly WorkScopeEntry[] = SOURCES.map(source => ({
  sourceType: source.type,
  label: source.label,
  state: 'unconfigured'
}))

export const EMPTY_NOTIFICATION_READ_MODEL: NotificationReadModel = Object.freeze({
  availability: 'contract_unavailable',
  recent: [],
  pending: []
})

function latestSourceFact(snapshot: WorkspaceSnapshot, sourceType: SourceType): string | null {
  const timestamps = snapshot.tasks
    .map(buildSourceIdentity)
    .filter(identity => identity.sourceType === sourceType && identity.receivedAt)
    .map(identity => identity.receivedAt as string)
    .sort((left, right) => right.localeCompare(left))

  return timestamps[0] ?? null
}

export function sourceHealthFromSnapshot(
  snapshot: WorkspaceSnapshot | null,
  gatewayState: string,
  readError: string | null = null
): readonly SourceHealthEntry[] {
  return SOURCES.map(source => {
    if (source.type === 'workspace') {
      return {
        sourceType: source.type,
        label: source.label,
        state: snapshot ? ('connected' as const) : ('unavailable' as const),
        lastSeen: snapshot?.loadedAt ?? null,
        error: readError,
        scope: snapshot ? 'canonical workspace snapshot' : null
      }
    }

    if (source.type === 'hermes_session') {
      return {
        sourceType: source.type,
        label: source.label,
        state: gatewayState === 'open' ? ('connected' as const) : ('unavailable' as const),
        lastSeen: snapshot ? latestSourceFact(snapshot, source.type) : null,
        error: gatewayState === 'open' ? null : 'Hermes Gateway 当前不可用',
        scope: 'current authenticated Hermes Desktop connection'
      }
    }

    return {
      sourceType: source.type,
      label: source.label,
      state: 'unknown' as const,
      lastSeen: snapshot ? latestSourceFact(snapshot, source.type) : null,
      error: null,
      scope: null
    }
  })
}
