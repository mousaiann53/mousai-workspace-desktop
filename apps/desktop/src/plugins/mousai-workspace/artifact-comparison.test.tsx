import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ArtifactComparison } from './artifact-comparison'
import type { Deliverable, ProductionReview } from './domain'
import type { ArtifactRevisionSnapshot } from './service-artifact-comparison'
import type { ProductionReviewItem } from './service-production-review'

function file(filename: string, sha: string): Deliverable {
  return {
    id: `${sha}:${filename}`,
    workId: 'WORK-1',
    taskId: 'WORK-1',
    projectId: null,
    name: filename,
    filename,
    format: '.pdf',
    relativePath: filename,
    extension: '.pdf',
    sizeBytes: 10,
    sha256: sha.repeat(64),
    modifiedAt: '2026-08-29T01:00:00Z',
    updatedAt: '2026-08-29T01:00:00Z',
    submissionState: 'submitted',
    deliveryState: 'delivered',
    reviewState: 'pending',
    localOutputRoot: null,
    source: { system: 'manifest', recordId: filename }
  }
}

function item(): ProductionReviewItem {
  return {
    deliverables: [file('current.pdf', 'a')],
    producer: '司木 Moss',
    provenance: 'Mousai Workspace / WorkBuddy',
    project: {} as never,
    task: {} as never,
    review: {
      revision: 2,
      manifestVersion: 'manifest-v2',
      approvedScope: { version: 2 },
      gateState: 'WAITING_ACCEPTANCE'
    } as ProductionReview
  }
}

describe('ArtifactComparison', () => {
  it('lets the user select an available previous metadata revision', () => {
    const previous: ArtifactRevisionSnapshot = {
      id: 'manifest-v1',
      revision: 1,
      scopeVersion: 1,
      manifestVersion: 'manifest-v1',
      producer: '司木 Moss',
      files: [file('previous.pdf', 'b')]
    }

    render(<ArtifactComparison historicalVersions={[previous]} item={item()} />)

    fireEvent.change(screen.getByLabelText('比较基线'), { target: { value: 'manifest-v1' } })
    expect(screen.getByText('Previous revision')).toBeTruthy()
    expect(screen.getAllByText('added')).toHaveLength(2)
    expect(screen.getAllByText('removed')).toHaveLength(2)
    expect(screen.getAllByText('current.pdf')).toHaveLength(2)
    expect(screen.getAllByText('previous.pdf')).toHaveLength(2)
  })
})
