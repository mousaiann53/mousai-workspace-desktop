import { afterEach, describe, expect, it } from 'vitest'

import { group } from '@/components/pane-shell/tree/model'
import { $layoutTree } from '@/components/pane-shell/tree/store'
import type { Locale } from '@/i18n'

import {
  ensureWorkspaceShellTabOrder,
  WORKSPACE_SECTIONS,
  WORKSPACE_SHELL_PANE_ID,
  workspaceShellContributions,
  workspaceShellCopy
} from './index'

const LOCALES: Locale[] = ['en', 'zh', 'zh-hant', 'ja', 'ar']

describe('Mousai workspace shell', () => {
  afterEach(() => {
    $layoutTree.set(null)
    window.localStorage.clear()
  })

  it('defines exactly the frozen M2-B navigation sections', () => {
    expect(WORKSPACE_SECTIONS.map(section => section.id)).toEqual([
      'dashboard',
      'projects',
      'tasks',
      'calendar',
      'reviews',
      'resources',
      'memory',
      'archive'
    ])
    expect(workspaceShellCopy('zh').sections).toEqual({
      dashboard: '看板',
      projects: '项目',
      tasks: '待办',
      calendar: '日程',
      reviews: '复盘',
      resources: '资料',
      memory: '工作记忆',
      archive: '归档'
    })
  })

  it('keeps every route unique, reserved, and one segment', () => {
    const paths = WORKSPACE_SECTIONS.map(section => section.path)

    expect(new Set(paths).size).toBe(paths.length)
    expect(paths.every(path => /^\/[a-z-]+$/.test(path))).toBe(true)
  })

  it('provides complete copy for every official locale', () => {
    for (const locale of LOCALES) {
      const copy = workspaceShellCopy(locale)

      expect(copy.ariaLabel).toBeTruthy()
      expect(copy.shellReady).toBeTruthy()
      expect(Object.keys(copy.sections)).toHaveLength(WORKSPACE_SECTIONS.length)
    }
  })

  it('registers one WORKSPACE pane and one page per section', () => {
    const panes = workspaceShellContributions.filter(contribution => contribution.area === 'panes')
    const routes = workspaceShellContributions.filter(contribution => contribution.area === 'routes')

    expect(panes).toHaveLength(1)
    expect(panes[0]).toMatchObject({ id: WORKSPACE_SHELL_PANE_ID, title: 'WORKSPACE' })
    expect(routes).toHaveLength(WORKSPACE_SECTIONS.length)
  })

  it('places WORKSPACE first without stealing the active SESSIONS tab', () => {
    $layoutTree.set(
      group(['sessions', WORKSPACE_SHELL_PANE_ID, 'hermes-bots:pane'], {
        active: 'sessions',
        id: 'product-tabs'
      })
    )

    ensureWorkspaceShellTabOrder()

    expect($layoutTree.get()).toMatchObject({
      active: 'sessions',
      panes: [WORKSPACE_SHELL_PANE_ID, 'sessions', 'hermes-bots:pane']
    })
  })
})
