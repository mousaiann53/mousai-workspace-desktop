/**
 * Mousai Workspace · Editorial Blue — the brand palette as a `DesktopTheme`.
 *
 * The cross-surface source of truth is the backend skin YAML at
 * `assets/skins/mousai-editorial-blue.yaml`: the Hermes skin engine themes the
 * CLI and TUI from it, and a gateway with it active pushes the same name over
 * `gateway.ready` / `skin.changed`. This module mirrors those palettes into the
 * desktop's official `THEMES_AREA` extension point (see plugin.tsx) so the
 * brand theme resolves at boot, persists across restarts, and is selectable
 * with no backend connection at all.
 *
 * The load-bearing seeds (background / foreground / primary / destructive /
 * border / mutedForeground, both modes) MUST stay equal to the YAML —
 * plugin.test.tsx parses the YAML and enforces parity. The remaining surface
 * slots are hand-tuned in the same editorial register, the way the built-in
 * presets are authored.
 */

import type { DesktopTheme } from '@hermes/plugin-sdk'

/** Dark mode — deep vintage print blue, paper-cream text, dusty blue accent. */
const darkColors: DesktopTheme['darkColors'] = {
  background: '#152A42',
  foreground: '#EAE3D2',
  card: '#1A314D',
  cardForeground: '#EAE3D2',
  muted: '#1E3752',
  mutedForeground: '#8CA2BC',
  popover: '#1E3757',
  popoverForeground: '#EAE3D2',
  primary: '#85AED6',
  primaryForeground: '#0E1E33',
  secondary: '#2F4F77',
  secondaryForeground: '#EAE3D2',
  accent: '#2B4A70',
  accentForeground: '#EAE3D2',
  border: '#3E618F',
  input: '#0E1E33',
  ring: '#85AED6',
  midground: '#85AED6',
  midgroundForeground: '#0E1E33',
  composerRing: '#85AED6',
  destructive: '#E38A76',
  destructiveForeground: '#2B1510',
  sidebarBackground: '#172D47',
  sidebarBorder: '#3E618F',
  userBubble: '#2A4666',
  userBubbleBorder: '#3E618F'
}

/** Light mode — cream paper stock, black editorial ink, print-blue accent. */
const colors: DesktopTheme['colors'] = {
  background: '#F4EEE1',
  foreground: '#201E19',
  card: '#FAF6EC',
  cardForeground: '#201E19',
  muted: '#EAE2CF',
  mutedForeground: '#635D4B',
  popover: '#FBF7EF',
  popoverForeground: '#201E19',
  primary: '#2E5C8A',
  primaryForeground: '#F7F2E6',
  secondary: '#DCE5EE',
  secondaryForeground: '#201E19',
  accent: '#DDE6EF',
  accentForeground: '#201E19',
  border: '#C9BEA2',
  input: '#EFE9DA',
  ring: '#2E5C8A',
  midground: '#2E5C8A',
  midgroundForeground: '#F7F2E6',
  composerRing: '#2E5C8A',
  destructive: '#A63A2B',
  destructiveForeground: '#F9F1E6',
  sidebarBackground: '#EFE8D8',
  sidebarBorder: '#C9BEA2',
  userBubble: '#E2E8EE',
  userBubbleBorder: '#C9BEA2'
}

export const EDITORIAL_BLUE: DesktopTheme = {
  name: 'mousai-editorial-blue',
  label: 'Editorial Blue',
  description: 'Mousai Workspace — vintage print blue, paper cream, editorial ink',
  colors,
  darkColors
}
