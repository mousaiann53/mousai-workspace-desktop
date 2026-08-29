import type { AdapterIssue, DomainSource } from './domain'

export type UnknownRecord = Record<string, unknown>

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asTrimmedText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()

    return trimmed || null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value === 'boolean') {
    return String(value)
  }

  if (Array.isArray(value)) {
    const parts = value.map(asTrimmedText).filter((item): item is string => item !== null)

    return parts.length ? parts.join(', ') : null
  }

  if (isRecord(value)) {
    for (const key of ['text', 'name', 'value', 'url', 'link']) {
      const text = asTrimmedText(value[key])

      if (text) {
        return text
      }
    }
  }

  return null
}

export function asNullableBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === 1 || value === 'true' || value === 'TRUE' || value === '是') {
    return true
  }

  if (value === 0 || value === 'false' || value === 'FALSE' || value === '否') {
    return false
  }

  return null
}

export function asNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)

    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

export function asIsoDateTime(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value)

    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }

  const text = asTrimmedText(value)

  if (!text) {
    return null
  }

  const date = new Date(text)

  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function recordsFromPayload(payload: unknown): readonly unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!isRecord(payload)) {
    return []
  }

  if (Array.isArray(payload.items)) {
    return payload.items
  }

  if (isRecord(payload.data) && Array.isArray(payload.data.items)) {
    return payload.data.items
  }

  return []
}

export function issue(
  source: DomainSource,
  code: AdapterIssue['code'],
  message: string,
  recordId: string | null = null
): AdapterIssue {
  return { source, code, message, recordId }
}
