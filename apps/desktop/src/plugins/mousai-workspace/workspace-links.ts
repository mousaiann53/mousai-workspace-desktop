export type WorkspaceFocusPanel = 'deliverable' | 'history' | 'skill' | 'task'

export function projectWorkspaceLink(
  projectId: string,
  options: { readonly workId?: string | null; readonly panel?: WorkspaceFocusPanel | null } = {}
): string {
  const query = new URLSearchParams({ project: projectId })

  if (options.workId) {
    query.set('work', options.workId)
  }

  if (options.panel) {
    query.set('panel', options.panel)
  }

  return `/workspace/projects?${query.toString()}`
}
