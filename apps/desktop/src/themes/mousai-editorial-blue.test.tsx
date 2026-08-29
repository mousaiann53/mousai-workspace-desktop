/**
 * Editorial Blue on the desktop — integration through the official theme
 * machinery.
 *
 * Covers the three guarantees the brand skin depends on:
 *   1. Boot resolvability — the plugin's THEMES_AREA contribution makes a
 *      persisted 'mousai-editorial-blue' resolve BEFORE any backend connection
 *      (the restart-persistence contract: normalizeSkin keeps the stored name
 *      only when the registry can resolve it).
 *   2. Zero drift — the theme the backend pushes (YAML colors run through the
 *      official `skinToDesktopTheme`) agrees with the plugin's static palette
 *      on every load-bearing seed.
 *   3. Backend activation applies — `skin.changed` for the skin flows through
 *      `ingestBackendSkin` into the persisted per-profile appearance.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { HermesSkin } from '@hermes/shared/skin'
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { registry } from '@/contrib/registry'
import { EDITORIAL_BLUE } from '@/plugins/mousai-editorial-blue/palette'

import { __resetBackendSkinSync, ingestBackendSkin } from './backend-sync'
import { modePref, skinPref, ThemeProvider, useTheme } from './context'
import { skinToDesktopTheme } from './skin'
import { resolveTheme, THEMES_AREA } from './user-themes'

// jsdom's import.meta.url is http://, so anchor on cwd and walk up to the repo
// root (the only place assets/skins/ lives).
const REPO_ROOT = (() => {
  let dir = process.cwd()

  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, 'assets', 'skins', 'mousai-editorial-blue.yaml'))) {
      return dir
    }

    dir = resolve(dir, '..')
  }

  throw new Error('mousai-editorial-blue.yaml not found above cwd')
})()

const SKIN_PATH = resolve(REPO_ROOT, 'assets', 'skins', 'mousai-editorial-blue.yaml')

/** Minimal reader for OUR skin YAML: `name:` plus the `colors:` block. */
const parseSkinYaml = (text: string): HermesSkin => {
  const out = { name: '', colors: {} } as { name: string; colors: Record<string, string> }
  let inColors = false

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd()

    if (!line || line.trim().startsWith('#')) {
      continue
    }

    if (/^\S/.test(line)) {
      inColors = false
      const top = /^([\w-]+):\s*(.*)$/.exec(line)

      if (top?.[1] === 'name') {
        out.name = top[2].trim()
      }

      if (top?.[1] === 'colors' && !top[2]) {
        inColors = true
      }

      continue
    }

    if (inColors) {
      const entry = /^\s+([\w-]+):\s*"?([#0-9a-fA-F]+)"?\s*$/.exec(line)

      if (entry) {
        out.colors[entry[1]] = entry[2]
      }
    }
  }

  return out
}

const skinFile = parseSkinYaml(readFileSync(SKIN_PATH, 'utf8'))

const cssVar = (name: string) => window.document.documentElement.style.getPropertyValue(name)

const registerBrandTheme = () =>
  registry.register({ area: THEMES_AREA, data: EDITORIAL_BLUE, id: 'mousai-editorial-blue:theme' })

describe('Editorial Blue desktop integration', () => {
  let ctx: ReturnType<typeof useTheme>

  function Probe() {
    ctx = useTheme()

    return null
  }

  const renderProbe = () =>
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    )

  beforeEach(() => {
    window.localStorage.clear()
    __resetBackendSkinSync()
  })

  afterEach(cleanup)

  it('is the skin the backend YAML describes, registered as valid data', () => {
    expect(skinFile.name).toBe(EDITORIAL_BLUE.name)

    const dispose = registerBrandTheme()
    expect(resolveTheme('mousai-editorial-blue')).toEqual(EDITORIAL_BLUE)
    dispose()
  })

  // The restart contract: with the plugin contribution in the registry (bundled
  // plugins register at module scope, before ThemeProvider mounts), a profile
  // persisted on the brand theme paints it on the very first boot — no
  // connection required.
  it('paints a persisted brand theme at boot with an empty backend', () => {
    const dispose = registerBrandTheme()

    // Pin the mode so the painted palette is deterministic regardless of the
    // test host's (irrelevant) prefers-color-scheme.
    act(() => void skinPref.assign('default', 'mousai-editorial-blue'))
    act(() => void modePref.assign('default', 'dark'))

    renderProbe()

    expect(ctx.themeName).toBe('mousai-editorial-blue')
    expect(cssVar('--theme-background-seed')).toBe(EDITORIAL_BLUE.darkColors!.background)
    expect(cssVar('--theme-primary')).toBe(EDITORIAL_BLUE.darkColors!.primary)

    // Close and reopen: a fresh provider over the same localStorage restores
    // the same appearance.
    cleanup()
    renderProbe()
    expect(ctx.themeName).toBe('mousai-editorial-blue')

    dispose()
  })

  // What the gateway pushes (gateway.ready / skin.changed) is resolve_skin() of
  // the active YAML — the desktop converts it with the SAME official converter.
  // The converted copy and the plugin's static palette must agree on the seeds.
  it('matches the backend-converted theme on every load-bearing seed', () => {
    const converted = skinToDesktopTheme({ ...skinFile, name: 'mousai-editorial-blue' })

    expect(converted).not.toBeNull()
    const dark = EDITORIAL_BLUE.darkColors!

    // normalizeHex (inside the converter) lowercases hex — compare canonically.
    for (const slot of ['background', 'foreground', 'primary', 'destructive', 'border', 'mutedForeground'] as const) {
      expect(converted!.colors[slot]?.toLowerCase(), `converted.${slot}`).toBe(dark[slot].toLowerCase())
    }
  })

  it('applies a runtime backend activation and persists it', () => {
    const dispose = registerBrandTheme()

    renderProbe()
    expect(ctx.themeName).not.toBe('mousai-editorial-blue')

    // The lifecycle handler runs this on skin.changed from the active source.
    act(() => void ingestBackendSkin({ ...skinFile, name: 'mousai-editorial-blue' }, { apply: true }))

    expect(ctx.themeName).toBe('mousai-editorial-blue')
    expect(skinPref.resolve('default')).toBe('mousai-editorial-blue')

    dispose()
  })
})
