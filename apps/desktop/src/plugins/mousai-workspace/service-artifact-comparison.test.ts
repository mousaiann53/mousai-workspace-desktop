import { describe, expect, it } from 'vitest'

import type { Deliverable } from './domain'
import { type ArtifactRevisionSnapshot, compareArtifactRevisions } from './service-artifact-comparison'

function file(relativePath: string, sha: string, size = 10, modifiedAt = '2026-08-29T01:00:00Z'): Deliverable {
  const filename = relativePath.split('/').at(-1) ?? relativePath

  return {
    id: `${sha}:${relativePath}`,
    workId: 'WORK-1',
    taskId: 'WORK-1',
    projectId: null,
    name: filename,
    filename,
    format: '.pdf',
    relativePath,
    extension: '.pdf',
    sizeBytes: size,
    sha256: sha.repeat(64),
    modifiedAt,
    updatedAt: modifiedAt,
    submissionState: 'submitted',
    deliveryState: 'delivered',
    reviewState: 'pending',
    localOutputRoot: null,
    source: { system: 'manifest', recordId: relativePath }
  }
}

function version(id: string, files: readonly Deliverable[]): ArtifactRevisionSnapshot {
  return { id, revision: 2, scopeVersion: 3, manifestVersion: id, producer: '司木 Moss', files }
}

describe('artifact metadata comparison', () => {
  it('reports changed, unchanged, added and removed files using metadata only', () => {
    const previous = version('manifest-v1', [
      file('changed.pdf', 'a'),
      file('unchanged.pdf', 'b'),
      file('removed.pdf', 'c')
    ])

    const current = version('manifest-v2', [
      file('changed.pdf', 'd'),
      file('unchanged.pdf', 'b'),
      file('added.pdf', 'e')
    ])

    expect(compareArtifactRevisions(current, previous).map(item => [item.key, item.state])).toEqual([
      ['added.pdf', 'added'],
      ['changed.pdf', 'changed'],
      ['removed.pdf', 'removed'],
      ['unchanged.pdf', 'unchanged']
    ])
  })
})
