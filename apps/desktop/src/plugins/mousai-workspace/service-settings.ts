import type { SystemSettingsRecord } from './domain'

export class WorkspaceSettingsError extends Error {
  readonly statusCode: number | null
  readonly code: string

  constructor(message: string, statusCode: number | null, code: string) {
    super(message)
    this.name = 'WorkspaceSettingsError'
    this.statusCode = statusCode
    this.code = code
  }
}

export type SettingsChangeValue = number | readonly string[] | string

export interface SettingsUpdateRequest {
  readonly clientRequestId: string
  readonly expectedRevision: number
  readonly actor: string
  readonly changes: Readonly<Record<string, SettingsChangeValue>>
}

export interface SettingsUpdateResult {
  readonly systemSettings: SystemSettingsRecord
  readonly idempotent: boolean
}

export interface WorkspaceSettingsTransport {
  /** Canonical settings read; unavailable authority must surface, never a
   * localStorage fallback. */
  readSettings(): Promise<SystemSettingsRecord>
  /** Typed settings mutation (allowlisted fields, expected_revision,
   * client_request_id). The canonical result must be followed by a full
   * snapshot refetch — no optimistic settings truth. */
  updateSettings(request: SettingsUpdateRequest): Promise<SettingsUpdateResult>
}

export function settingsFailure(error: unknown): WorkspaceSettingsError {
  if (error instanceof WorkspaceSettingsError) {
    return error
  }

  const statusCode =
    typeof error === 'object' && error !== null && typeof (error as { statusCode?: unknown }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : null

  const message = error instanceof Error ? error.message : 'Settings command failed.'
  const codeMatch = message.match(/"code"\s*:\s*"([a-z0-9_]+)"/i)

  return new WorkspaceSettingsError(message, statusCode, codeMatch?.[1] ?? 'settings_command_failed')
}
