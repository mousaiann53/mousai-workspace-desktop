import { describe, expect, it, vi } from 'vitest'

vi.mock('@hermes/plugin-sdk', () => ({
  Codicon: () => null,
  ROUTES_AREA: 'routes',
  host: {
    navigate: vi.fn()
  }
}))

import plugin, { DEFAULT_ROUTE, WORKSPACE_SECTIONS } from './plugin'

describe('Mousai Workspace plugin shell', () => {
  it('keeps the approved identity and is enabled by default', () => {
    expect(plugin).toMatchObject({
      id: 'mousai-workspace',
      name: 'Mousai Workspace',
      defaultEnabled: true
    })
  })

  it('defines the eight approved Chinese workspace sections', () => {
    expect(WORKSPACE_SECTIONS.map(section => section.label)).toEqual([
      '看板',
      '项目',
      '待办',
      '日程',
      '复盘',
      '资料',
      '工作记忆',
      '归档'
    ])
  })

  it('uses unique routes under the workspace prefix', () => {
    const paths = WORKSPACE_SECTIONS.map(section => section.path)
    expect(DEFAULT_ROUTE).toBe('/workspace')
    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.every(path => path === DEFAULT_ROUTE || path.startsWith(`${DEFAULT_ROUTE}/`))).toBe(true)
  })

  it('registers one left pane and one route for each section', () => {
    const registerMany = vi.fn()
    plugin.register({ registerMany, onDispose: vi.fn() } as never)

    const contributions = registerMany.mock.calls[0]?.[0] ?? []
    expect(contributions.filter((item: { area: string }) => item.area === 'panes')).toHaveLength(1)
    expect(contributions.filter((item: { area: string }) => item.area === 'routes')).toHaveLength(
      WORKSPACE_SECTIONS.length
    )
  })
})
