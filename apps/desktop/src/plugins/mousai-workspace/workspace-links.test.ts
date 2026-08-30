import { describe, expect, it } from 'vitest'

import { projectWorkspaceLink } from './workspace-links'

describe('Workspace deep links', () => {
  it('builds stable encoded project, task and panel routes', () => {
    expect(projectWorkspaceLink('PROJECT-001')).toBe('/workspace/projects?project=PROJECT-001')
    expect(projectWorkspaceLink('PROJECT 001', { workId: 'WORK/001', panel: 'history' })).toBe(
      '/workspace/projects?project=PROJECT+001&work=WORK%2F001&panel=history'
    )
    expect(projectWorkspaceLink('PROJECT-001', { workId: 'WORK-001', panel: 'source' })).toBe(
      '/workspace/projects?project=PROJECT-001&work=WORK-001&panel=source'
    )
  })
})
