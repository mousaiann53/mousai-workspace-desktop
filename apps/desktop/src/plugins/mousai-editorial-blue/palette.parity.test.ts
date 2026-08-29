/**
 * Palette parity: the plugin's DesktopTheme vs the backend skin YAML.
 *
 * `assets/skins/mousai-editorial-blue.yaml` is the brand palette's source of
 * truth (CLI / TUI / gateway push). This suite pins the desktop mirror to it:
 * the load-bearing seeds must be the SAME hex in both files, and every text
 * role must clear WCAG AA in both modes.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { EDITORIAL_BLUE } from './palette'

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

/**
 * Minimal reader for OUR skin YAML (format owned by this repo): top-level
 * `key: value` lines plus the two color blocks' `  key: "#hex"` lines. No
 * parser dependency; anything outside that shape fails loudly in the parity
 * assertions below rather than silently parsing wrong.
 */
const parseSkinYaml = (
  text: string
): { name: string; colors: Record<string, string>; light_colors: Record<string, string> } => {
  const out = { name: '', colors: {}, light_colors: {} } as ReturnType<typeof parseSkinYaml>
  let block: 'colors' | 'light_colors' | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd()

    if (!line || line.trim().startsWith('#')) {
      continue
    }

    if (/^\S/.test(line)) {
      block = null
      const top = /^([\w-]+):\s*(.*)$/.exec(line)

      if (top?.[1] === 'name') {
        out.name = top[2].trim()
      }

      if (top && (top[1] === 'colors' || top[1] === 'light_colors') && !top[2]) {
        block = top[1]
      }

      continue
    }

    if (block) {
      const entry = /^\s+([\w-]+):\s*"?([#0-9a-fA-F]+)"?\s*$/.exec(line)

      if (entry) {
        out[block][entry[1]] = entry[2]
      }
    }
  }

  return out
}

const skin = parseSkinYaml(readFileSync(SKIN_PATH, 'utf8'))

// Same WCAG math as themes/color.ts (sRGB relative luminance).
const channel = (v: number): number => {
  const c = v / 255

  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = (hex: string): number => {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(h.slice(i, i + 2), 16)))

  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)

  return (hi + 0.05) / (lo + 0.05)
}

describe('Editorial Blue YAML → DesktopTheme parity', () => {
  it('carries the same skin identity', () => {
    expect(skin.name).toBe(EDITORIAL_BLUE.name)
    expect(skin.name).toBe('mousai-editorial-blue')
  })

  // The desktop converter (themes/skin.ts) seeds the GUI palette from exactly
  // these YAML keys; the plugin's hand-tuned theme must agree with them so the
  // backend-pushed copy and this contribution never disagree on the look.
  it('mirrors the dark-authored YAML block into darkColors', () => {
    const dark = EDITORIAL_BLUE.darkColors!

    const seeds: Array<[keyof typeof dark, string]> = [
      ['background', 'background'],
      ['foreground', 'ui_text'],
      ['primary', 'ui_accent'],
      ['destructive', 'ui_error'],
      ['border', 'ui_border'],
      ['mutedForeground', 'banner_dim']
    ]

    for (const [slot, key] of seeds) {
      expect(dark[slot], `darkColors.${slot} vs colors.${key}`).toBe(skin.colors[key])
    }
  })

  it('mirrors the paper light_colors overlay into colors', () => {
    const light = EDITORIAL_BLUE.colors

    const seeds: Array<[keyof typeof light, string]> = [
      ['background', 'background'],
      ['foreground', 'ui_text'],
      ['primary', 'ui_accent'],
      ['destructive', 'ui_error'],
      ['border', 'ui_border'],
      ['mutedForeground', 'banner_dim']
    ]

    for (const [slot, key] of seeds) {
      expect(light[slot], `colors.${slot} vs light_colors.${key}`).toBe(skin.light_colors[key])
    }
  })
})

describe('Editorial Blue desktop contrast (WCAG AA)', () => {
  const cases = [
    { mode: 'dark', palette: EDITORIAL_BLUE.darkColors! },
    { mode: 'light', palette: EDITORIAL_BLUE.colors }
  ] as const

  it.each(cases)('$mode: text roles clear AA on the background', ({ palette }) => {
    expect(contrast(palette.foreground, palette.background)).toBeGreaterThanOrEqual(7)
    expect(contrast(palette.mutedForeground, palette.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.primary, palette.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.destructive, palette.background)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(cases)('$mode: on-accent text is readable', ({ palette }) => {
    expect(contrast(palette.primaryForeground, palette.primary)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(cases)('$mode: borders are visible on the background', ({ palette }) => {
    expect(contrast(palette.border, palette.background)).toBeGreaterThanOrEqual(1.5)
  })
})
