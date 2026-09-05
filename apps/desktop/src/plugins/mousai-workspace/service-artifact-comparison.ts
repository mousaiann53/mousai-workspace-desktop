import type { ArtifactRevisionRecord, Deliverable } from './domain'
import type { ProductionReviewItem } from './service-production-review'

export interface ArtifactFileMeta {
  readonly filename: string
  readonly relativePath: string | null
  readonly extension: string
  readonly sizeBytes: number
  readonly sha256: string
  readonly modifiedAt: string
}

export interface ArtifactRevisionSnapshot {
  readonly id: string
  readonly revision: number | null
  readonly scopeVersion: number | null
  readonly manifestVersion: string | null
  readonly producer: string | null
  readonly files: readonly (ArtifactFileMeta | Deliverable)[]
}

export type ArtifactChangeState = 'added' | 'changed' | 'removed' | 'unchanged'

export interface ArtifactFileComparison {
  readonly key: string
  readonly state: ArtifactChangeState
  readonly current: ArtifactFileMeta | null
  readonly previous: ArtifactFileMeta | null
}

/**
 * Canonical previous-revision metadata from the Control artifactRevisions
 * projection. Revisions whose file metadata was never recorded (pre-S4
 * deliveries; the old WorkData manifest was overwritten) have files: null and
 * are intentionally absent — comparison stays HOLD for them instead of being
 * faked.
 */
export function historicalArtifactRevisions(
  workId: string,
  artifactRevisions?: readonly ArtifactRevisionRecord[]
): readonly ArtifactRevisionSnapshot[] {
  if (!artifactRevisions) {
    return []
  }

  return artifactRevisions
    .filter(record => record.workId === workId && record.files !== null && record.files.length > 0)
    .map(record => ({
      id: `history:${record.recordedAt ?? 'unset'}:${record.revision ?? 'unset'}:${record.manifestVersion ?? 'unset'}`,
      revision: record.revision,
      scopeVersion: record.scopeVersion,
      manifestVersion: record.manifestVersion,
      producer: record.producer,
      files: record.files ?? []
    }))
    .toSorted((left, right) => (right.revision ?? 0) - (left.revision ?? 0))
}

function fileMap(files: readonly (ArtifactFileMeta | Deliverable)[]): ReadonlyMap<string, ArtifactFileMeta | Deliverable> {
  return new Map(
    files.flatMap(file => (file.relativePath ? [[file.relativePath, file] as const] : []))
  )
}

function unchanged(current: ArtifactFileMeta | Deliverable, previous: ArtifactFileMeta | Deliverable): boolean {
  return (
    current.filename === previous.filename &&
    current.sha256 === previous.sha256 &&
    current.sizeBytes === previous.sizeBytes &&
    current.modifiedAt === previous.modifiedAt
  )
}

export function compareArtifactRevisions(
  current: ArtifactRevisionSnapshot,
  previous: ArtifactRevisionSnapshot
): readonly ArtifactFileComparison[] {
  const currentFiles = fileMap(current.files)
  const previousFiles = fileMap(previous.files)
  const paths = [...new Set([...currentFiles.keys(), ...previousFiles.keys()])].toSorted()

  return paths.map(key => {
    const currentFile = currentFiles.get(key) ?? null
    const previousFile = previousFiles.get(key) ?? null

    if (!previousFile) {
      return { key, state: 'added', current: currentFile, previous: null }
    }

    if (!currentFile) {
      return { key, state: 'removed', current: null, previous: previousFile }
    }

    return {
      key,
      state: unchanged(currentFile, previousFile) ? 'unchanged' : 'changed',
      current: currentFile,
      previous: previousFile
    }
  })
}

export function currentArtifactRevision(item: ProductionReviewItem): ArtifactRevisionSnapshot | null {
  if (!item.review) {
    return null
  }

  const { review } = item

  return {
    id: `current:${review.manifestVersion ?? 'unset'}:${review.revision ?? 'unset'}`,
    revision: review.revision,
    scopeVersion: review.approvedScope?.version ?? null,
    manifestVersion: review.manifestVersion,
    producer: item.producer,
    files: item.deliverables
  }
}
