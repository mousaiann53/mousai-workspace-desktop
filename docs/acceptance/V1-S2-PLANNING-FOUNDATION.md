# V1-S2 Planning / Todo / Calendar foundation

Date: 2026-08-29  
Branch: `feature/v1-s2-planning-foundation`  
Starting HEAD: `67c2e7e6def77eed180d0350e1fe2c6a6353063a`

This record covers Desktop construction only. It does not claim overall V1-S2 acceptance and does not modify Control, WorkBridge, VPS, Secrets, or course content.

## Package status

| Package                     | Result                     | Desktop evidence                                                                                                                   |
| --------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| A — Todo Center             | COMPLETE                   | Six canonical views: 收件箱、今日、近期、等待、已完成、搁置兼容；missing DDL remains unset.                                        |
| B — Task Detail Workbench   | COMPLETE                   | Typed inspector, production summary/history, bounded existing mutations, stable task focus link.                                   |
| C — Calendar / Agenda       | COMPLETE                   | Today/week/month/Agenda from task DDL, project dates, canonical events, and selected Production events; Asia/Shanghai is explicit. |
| D — Daily Timeline          | COMPLETE                   | Due-today tasks with time, duration, executor, next step, blocker; absent scheduling facts display 未排时/未估算.                  |
| E — Capacity                | COMPLETE (read foundation) | Known estimate and fixed-event counts; unavailable/scheduled capacity remains null until canonical blocks exist.                   |
| F — Scheduling Proposal     | COMPLETE (pure engine)     | Deterministic, collision-aware daytime allocation when all canonical constraints are supplied; no model call.                      |
| G — Proposal Preview UI     | COMPLETE / WRITE HOLD      | Today/tomorrow/week preview. Accept/Adjust/Ignore disabled until typed canonical write contract exists.                            |
| H — After-work Brief        | COMPLETE                   | Today completed, delayed, risk, tomorrow, AI-completed, and night-plan sections from snapshot facts.                               |
| I — Night Safety            | COMPLETE                   | AUTO_OK requires explicit low-risk, reversible, non-prohibited evidence and no human approval; missing evidence does not pass.     |
| J — Planning History        | COMPLETE / READ HOLD       | Production events and current DDL render; original DDL and reschedule count remain unset pending history contract.                 |
| K — Small-window resilience | COMPLETE                   | Scrollable tabs, full-width mobile inspector, single-column facts, compact comparison cards, keyboard focus.                       |
| L — Contract gaps           | COMPLETE                   | `docs/V1-S2-CONTRACT-GAPS.md` defines minimum typed read/write DTOs and security boundaries.                                       |

## Canonical and security boundaries

- Existing Workspace snapshot and typed Hermes `ctx.rest` are the only fact path.
- No local database or `localStorage` truth was introduced.
- Renderer credentials remain zero.
- No generic IPC, shell, bearer, or arbitrary file access was added.
- No course content, WorkBuddy run, backend mutation, or VPS operation occurred.
- Planning write actions require a future typed host mutation with idempotency and canonical refetch.

## Validation

Package-level focused suites, Desktop typecheck, Workspace ESLint/Prettier, Secret/IPC scans, and `git diff --check` pass. Final full Workspace suite and Desktop production build are recorded after the final checkpoint.

## True contract blockers

See [`docs/V1-S2-CONTRACT-GAPS.md`](../V1-S2-CONTRACT-GAPS.md). The immediate blockers to a live accepted schedule are canonical schedule blocks, fixed events, task dependencies, planning history, night-safety evidence, and typed schedule mutations.

## Next entry

Backend contract review can select the minimum DTOs without changing the completed Desktop read models. Do not enable proposal write buttons until the canonical typed mutation exists and passes real integration tests.
