import { describe, expect, it, vi } from 'vitest'

vi.mock('@hermes/plugin-sdk', () => ({
  THEMES_AREA: 'themes'
}))

import plugin from './plugin'

describe('Mousai Editorial Blue plugin', () => {
  it('keeps the brand identity and is enabled by default', () => {
    expect(plugin).toMatchObject({
      id: 'mousai-editorial-blue',
      name: 'Editorial Blue',
      defaultEnabled: true
    })
  })

  it('contributes exactly one theme through THEMES_AREA', () => {
    const register = vi.fn()
    plugin.register({ register, onDispose: vi.fn() } as never)

    expect(register).toHaveBeenCalledTimes(1)

    const contribution = register.mock.calls[0]?.[0] as {
      id: string
      area: string
      data: { name: string; label: string; colors: Record<string, string>; darkColors: Record<string, string> }
    }

    expect(contribution.id).toBe('theme')
    expect(contribution.area).toBe('themes')
    // The contributed data IS the DesktopTheme, valid per the registry's bar
    // (name/label + background/foreground/primary — see isValidTheme).
    expect(contribution.data.name).toBe('mousai-editorial-blue')
    expect(contribution.data.label).toBe('Editorial Blue')
    expect(contribution.data.colors.background).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(contribution.data.colors.foreground).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(contribution.data.colors.primary).toMatch(/^#[0-9a-fA-F]{6}$/)
    expect(contribution.data.darkColors).toBeDefined()
  })
})
