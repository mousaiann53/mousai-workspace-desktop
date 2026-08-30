# V1-S4 review / cost / safety / release foundation

Date: 2026-08-30
Branch: `feature/v1-s4-review-cost-foundation`
Starting HEAD: `a0ebf0b98f76daa49c0feb9610faf95ff4ffd3d0`

This record covers Desktop foundation engineering only. It does not claim overall V1-S4 acceptance and does not modify Control, WorkBridge, VPS, Provider credentials, messaging channels, WorkBuddy production, or course content.

## Contract reconciliation

- WorkBridge OpenAPI already provides typed `material_missing`, `decision_required`, and `archive` commands.
- Current Hermes `mousai-workspace` plugin `ctx.rest` exposes create/edit/defer/complete but not those three existing commands.
- Desktop controls remain disabled at the safe integration boundary; Renderer does not call WorkBridge directly.
- `docs/V1-S3-CONTRACT-GAPS.md` now records an integration exposure gap instead of a false missing-backend-contract gap.

## Package status

| Package                   | Result                        | Desktop evidence                                                                                                                                      |
| ------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A — Review Center         | COMPLETE                      | 今日/周/月/项目入口 with deterministic current facts; insufficient history is explicit.                                                               |
| B — Plan vs Actual        | COMPLETE / CONTRACT HOLD      | Current DDL, estimate, and accepted-event completion render; planned DDL, schedule, actual duration, and reschedule count remain unset.               |
| C — AI Contribution       | COMPLETE / CONTRACT HOLD      | WorkBuddy + production event + artifact evidence supports bounded classification; insufficient evidence is UNKNOWN; no automatic AI-autonomous claim. |
| D — API / Cost Center     | UI FOUNDATION / CONTRACT HOLD | Today/7-day/cycle and attribution dimensions render unavailable fields; no false zero cost.                                                           |
| E — Provider / Credit     | UI FOUNDATION / CONTRACT HOLD | No hard-coded Provider or promotional credit; canonical absence is unavailable.                                                                       |
| F — Anomaly / Security    | UI FOUNDATION / CONTRACT HOLD | Honest unavailable alert shell; no Secret read/revoke or log-derived alert.                                                                           |
| G — After-work Brief      | COMPLETE / CONTRACT HOLD      | Existing brief now uses acceptance events, adds AI contribution and cost placeholders, and never sends messages.                                      |
| H — Project Review        | COMPLETE                      | Project detail shows current task/delay/revision/deliverable/AI/blocker/event facts; ongoing state is explicit; cost stays unset.                     |
| I — Backup / Recovery     | UI FOUNDATION / CONTRACT HOLD | Canonical status fields render unavailable; no local backup behavior.                                                                                 |
| J — Release Readiness     | COMPLETE / EVIDENCE HOLD      | Desktop/Control/WorkBridge/WorkBuddy/Projects/Deliverables/Skills/Security/Backup/contracts show NOT RUN/HOLD without fake PASS.                      |
| K — Settings              | UI FOUNDATION / CONTRACT HOLD | Read-only setting shell; no localStorage policy truth or write controls.                                                                              |
| L — Cross-stage hardening | COMPLETE                      | Related Dashboard/Todo/Inbox/Projects/Resources/Archive/Review surfaces cover loading, empty, error, unavailable, deep-link, and responsive states.   |
| M — Contract gaps         | COMPLETE                      | `docs/V1-S4-CONTRACT-GAPS.md` defines minimum DTO, direction, authority, and security boundaries.                                                     |

## Safety boundaries

- Canonical Workspace snapshot and typed Hermes `ctx.rest` remain the only fact path.
- No Renderer Secret, bearer, billing API call, provider credential, generic IPC/shell, arbitrary file access, local database, or localStorage system truth.
- `updatedAt` is no longer used as `completedAt` in the after-work brief.
- No cost, credit, AI contribution, alert, backup, or release PASS is fabricated.

## Validation record

Package-level tests are recorded in commits. Final full Workspace tests, TypeScript, lint/format, scans, production build, final HEAD, and exact counts are filled by the closing validation run.

## Acceptance boundary

This branch may be submitted to GPT/PM for final V1-S4 acceptance after closing validation. Desktop engineering completion is not an overall V1-S4 PASS claim.
