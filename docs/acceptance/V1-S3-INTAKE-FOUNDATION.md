# V1-S3 multi-source intake foundation

Date: 2026-08-30
Branch: `feature/v1-s3-intake-foundation`
Starting HEAD: `68deac66792b611482b39cdc47d258eb1aff9fab`

This is a Desktop engineering completion record. It does not claim overall V1-S3 product acceptance and does not change Control, WorkBridge, VPS, Secrets, messaging bots, or course content.

## Package status

| Package                 | Result                        | Evidence                                                                                                                                                                         |
| ----------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Unified Inbox       | COMPLETE                      | Canonical inbox cards show WORK-ID, title, project, source/channel, origin, received time, DDL, extraction/confidence, duplicate state, waiting reason, next action, and status. |
| B — SourceIdentity      | COMPLETE / COMPATIBLE MAPPING | Exact current `origin`/`source` facts map to a typed identity; absent sender/channel facts remain unset.                                                                         |
| C — Source audit        | COMPLETE / HISTORY HOLD       | Task inspector shows current origin facts and explicit unavailable ingest history; no fabricated timeline.                                                                       |
| D — Duplicate states    | COMPLETE / MERGE HOLD         | Same WORK-ID and exact source reference are the only evidence rules; merge stays disabled without typed contract.                                                                |
| E — Work scope          | UI FOUNDATION / CONTRACT HOLD | Source candidates render, but policy reads/writes remain unavailable rather than stored locally.                                                                                 |
| F — Inbox triage        | PARTIAL / TYPED ACTION HOLD   | Edit/project/next action, defer, and complete reuse current typed mutations. Archive, material missing, and decision required are visible but disabled.                          |
| G — Local filters       | COMPLETE                      | Source, project, status-compatible inbox, DDL, waiting, and text filters operate in memory on the current snapshot only.                                                         |
| H — Notification router | UI FOUNDATION / CONTRACT HOLD | Recent/pending shells are honest empty states; Desktop sends no notification and creates no bot.                                                                                 |
| I — Source health       | COMPLETE / PARTIAL FACTS      | Workspace snapshot and Hermes Gateway facts render; provider channels remain unknown unless canonical health exists.                                                             |
| J — Deep links          | COMPLETE                      | Inbox → task/source audit → project/deliverable routes are stable; stale IDs show an honest not-found state.                                                                     |
| K — Small window        | COMPLETE                      | Scrollable intake/source tabs, compact responsive cards, break-safe facts, full-width mobile inspector, and keyboard focus.                                                      |
| L — Contract gaps       | COMPLETE                      | `docs/V1-S3-CONTRACT-GAPS.md` records minimum read/write DTOs, authority, and security boundaries.                                                                               |

## Security boundaries

- Canonical Workspace snapshot and typed Hermes `ctx.rest` remain the only data path.
- Renderer Secret = 0; no bearer, provider credential, cookie, or token was introduced.
- No generic IPC, shell, JSON editor, patch endpoint, arbitrary path access, local database, or localStorage policy truth.
- No QQ/WeChat adapter, notification sender, Control backend, VPS, WorkBuddy, course content, or semantic search was added.
- Missing contracts produce disabled controls or unavailable states, not invented facts.

## Validation record

Package-level targeted suites, Workspace integration, TypeScript, ESLint/Prettier, secret/IPC scans, diff check, and final production build are required before this record is finalized. The final counts and source HEAD are filled from the closing run rather than estimated here.

## True blockers

See [`docs/V1-S3-CONTRACT-GAPS.md`](../V1-S3-CONTRACT-GAPS.md). The immediate live blockers are authoritative source identity details, append-only ingest events, duplicate evidence and merge mutation, work-scope policy, notification read/write models, source health, and named typed triage mutations.

## Acceptance boundary

This branch may be submitted to GPT/PM for final V1-S3 acceptance after the closing evidence is recorded. Desktop engineering completion is not an overall V1-S3 PASS claim.
