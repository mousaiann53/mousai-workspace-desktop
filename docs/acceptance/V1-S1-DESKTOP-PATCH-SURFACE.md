# V1-S1 Desktop patch-surface audit

Date: 2026-08-29  
Branch: `feature/v1-s1-production-review-ui`  
Audit base: `origin/main` merge-base `230ce6a35e70139696034b3e9ca169b49f60eaf2`

## Result

The production Workspace UI remains a self-contained Desktop plugin. Its renderer transport uses only the official `PluginContext` boundaries:

- `ctx.rest` for the authenticated Hermes Gateway plugin API;
- `ctx.os.revealPath` for bounded local deliverable reveal;
- no renderer bearer, API key, token, generic IPC, generic shell, or arbitrary-path API.

The feature range changes 94 files: 54 files are under `apps/desktop/src/plugins/mousai-workspace/`, and 40 files are branding, host integration, an existing Hermes backend plugin, Bots/QQBot work, or project documentation. The Workspace plugin itself accounts for 9,358 added lines including focused tests.

## Core patch surface

The minimum non-plugin Desktop patches needed by Mousai Workspace are:

1. `apps/desktop/src/sdk/index.ts`: exports the existing official `Sheet` UI primitives for plugin use. It adds no IPC or new runtime dependency.
2. Branding and product identity files under `apps/desktop/electron`, `apps/desktop/assets`, `apps/desktop/public`, `apps/desktop/index.html`, and `apps/desktop/package.json`: app name, app id, icons, artifact name, and compatible user-data path.
3. Existing i18n string changes under `apps/desktop/src/i18n`: bilingual Mousai branding and navigation labels.

The Workspace feature added no npm dependency and did not change the root lockfile. The `apps/desktop/package.json` diff is packaging/identity metadata only; dependency versions remain upstream-compatible.

The following changed paths are not part of the current Workspace renderer implementation and must stay independently reviewable during an upstream rebase:

- `apps/desktop/src/plugins/hermes-bots/**`;
- `gateway/platforms/qqbot/adapter.py`;
- `plugins/mousai-workspace/**` and `tests/plugins/test_mousai_workspace_dashboard_plugin.py` (the existing credential-isolated Hermes plugin API);
- `MOUSAI_WORKSPACE.md` and brand tooling/assets.

## Update strategy

For each Hermes upstream update:

1. Rebase or merge upstream first without moving Workspace business logic into core files.
2. Reapply product identity as a small, separately reviewable patch.
3. Confirm the SDK still exports the official UI primitives used by the plugin.
4. Run the Workspace integration suite, typecheck, secret scan, and broad IPC scan.
5. Review the backend plugin contract separately from the renderer. The renderer must continue to consume the canonical snapshot array and must not add per-task clients or credentials.

No core refactor was performed during this audit because moving the already isolated plugin code would increase rebase risk without reducing the actual host patch surface.

## Security evidence

- Renderer secret-pattern matches: 0.
- Broad IPC/shell-pattern matches in `apps/desktop/src/plugins/mousai-workspace`: 0.
- Local artifact access remains restricted to the typed `revealPath` adapter and `H:\\MousaiWork\\outbox\\<WORK-ID>` validation.
- Canonical production mutations continue through explicit typed `ctx.rest` routes; no generic patch or JSON editor exists.

## Known contract blocker

The canonical snapshot currently exposes only the current manifest file metadata. It does not expose the previous revision's file list, so a live current-versus-previous artifact comparison cannot yet be claimed. The Desktop comparison algorithm and unavailable state are implemented without fabricating previous-revision facts.
