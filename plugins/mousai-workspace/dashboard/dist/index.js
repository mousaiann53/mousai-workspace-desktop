// Backend-only plugin package marker. Register an invisible component so the
// Hermes web dashboard loader treats the enabled package as healthy.
window.__HERMES_PLUGINS__?.register('mousai-workspace', function MousaiWorkspaceBackendOnly() {
  return null
})
