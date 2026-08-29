import { describe, expect, it } from 'vitest'

import { resourceArchiveRawSnapshot } from './resource-archive.test-fixtures'
import { buildArchiveModel, buildResourceGroups } from './service-resource-archive'
import { readWorkspaceSnapshot } from './service-workspace-read'

async function snapshot() {
  return (
    await readWorkspaceSnapshot({
      scope: 'resource-archive-test',
      async readSnapshot() {
        return resourceArchiveRawSnapshot()
      }
    })
  ).snapshot
}

describe('resource and archive models', () => {
  it('groups only canonical deliverable metadata and preserves production provenance', async () => {
    const groups = buildResourceGroups(await snapshot())

    expect(groups).toHaveLength(1)
    expect(groups[0].project?.id).toBe('PROJECT-1')
    expect(groups[0].entries[0]).toMatchObject({
      producer: 'workbuddy',
      provenance: 'Mousai Workspace / WorkBuddy'
    })
    expect(groups[0].entries[0].deliverable.filename).toBe('final.pdf')
  })

  it('separates archived, completed and accepted canonical facts', async () => {
    const model = buildArchiveModel(await snapshot())

    expect(model.archivedTasks.map(item => item.task.id)).toEqual(['WORK-ARCHIVED'])
    expect(model.completedTasks.map(item => item.task.id)).toEqual(['WORK-COMPLETED'])
    expect(model.acceptedDeliverables.map(item => item.deliverable.filename)).toEqual(['final.pdf'])
  })
})
