import type { Deliverable } from './domain'
import type { ProductionReviewItem } from './service-production-review'

export interface ArtifactRevisionSnapshot {
  readonly id: string
  readonly revision: number | null
  readonly scopeVersion: number | null
  readonly manifestVersion: string | null
  readonly producer: string | null
  readonly files: readonly Deliverable[]
}

export type ArtifactChangeState = 'added' | 'changed' | 'removed' | 'unchanged'

export interface ArtifactFileComparison {
  readonly key: string
  readonly state: ArtifactChangeState
  readonly current: Deliverable | null
  readonly previous: Deliverable | null
}

function fileMap(files: readonly Deliverable[]): ReadonlyMap<string, Deliverable> {
  return new Map(files.map(file => [file.relativePath, file]))
}

function unchanged(current: Deliverable, previous: Deliverable): boolean {
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
