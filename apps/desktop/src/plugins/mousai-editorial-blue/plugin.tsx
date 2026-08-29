/**
 * Mousai Workspace · Editorial Blue — the brand skin as a bundled desktop
 * theme.
 *
 * The brand palette lives once, in the versioned backend skin YAML
 * (`assets/skins/mousai-editorial-blue.yaml`): the Hermes skin engine themes
 * the CLI and TUI from it, and a gateway with the skin active pushes it to the
 * desktop over `gateway.ready` / `skin.changed`. This plugin contributes the
 * same palettes through the official `THEMES_AREA` so the brand theme is ALSO
 * always present on the desktop — it resolves at boot before any connection,
 * survives restarts via the per-profile appearance record, and shows up in
 * Appearance, ⌘K, and `/skin` with no per-surface wiring. When the backend
 * pushes the same name, its converted palette shadows this contribution (same
 * name, same load-bearing seeds — `plugin.test.tsx` pins the parity).
 */

import { type HermesPlugin, THEMES_AREA } from '@hermes/plugin-sdk'

import { EDITORIAL_BLUE } from './palette'

const plugin: HermesPlugin = {
  id: 'mousai-editorial-blue',
  name: 'Editorial Blue',
  description: 'Mousai Workspace brand theme — vintage print blue, paper cream, editorial ink.',
  defaultEnabled: true,
  register(ctx) {
    ctx.register({
      id: 'theme',
      area: THEMES_AREA,
      title: EDITORIAL_BLUE.label,
      data: EDITORIAL_BLUE
    })
  }
}

export default plugin
