# V1-S1 Desktop production surfaces

Date: 2026-08-29  
Branch: `feature/v1-s1-production-review-ui`  
Canonical contract: WorkBridge OpenAPI 1.6 / `ProductionReadModel[]`

## Engineering acceptance

| Capability                   | Result                  | Notes                                                                                                                         |
| ---------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Production Center facts      | PASS                    | No production record or absent field is rendered as `未设置 / 等待输入`; producer/provenance requires canonical evidence.     |
| Production actions           | PASS                    | Gate-driven typed actions, separate human scope approval/start, required revision and acceptance metadata, canonical refetch. |
| Review history               | PASS                    | Scope history and canonical events are append-only and read-only in the renderer.                                             |
| Dashboard                    | PASS                    | Real snapshot only; empty groups remain honest empty states.                                                                  |
| Resource / Archive           | PASS                    | Manifest/deliverable/task facts only; no demo data or arbitrary filesystem scan.                                              |
| Stable deep links            | PASS                    | Project, task, deliverable, history, and Skill evidence targets; missing targets do not redirect to a false success state.    |
| Artifact metadata comparison | PARTIAL / CONTRACT HOLD | Comparison algorithm exists; live previous-revision file metadata is not yet in the canonical snapshot.                       |
| Skill evidence               | PASS (UI)               | Evidence is derived from canonical production facts; M4 does not pretend to be a WorkBuddy first run.                         |
| Security boundary            | PASS                    | Renderer Secret scan 0; broad IPC/shell scan 0; official typed host boundaries only.                                          |

## Product semantics

- The ten canonical gate labels remain visible: `INPUT_REQUIRED`, `MATERIAL_MISSING`, `DECISION_REQUIRED`, `WAITING_HUMAN_APPROVAL`, `APPROVED_SCOPE`, `READY_FOR_PRODUCTION`, `REVISION_REQUIRED`, `DELIVERED`, `WAITING_ACCEPTANCE`, and `ACCEPTED`.
- `WAITING_HUMAN_APPROVAL` permits explicit scope approval; approval never auto-starts production.
- `APPROVED_SCOPE` permits only the separate start action.
- `WAITING_ACCEPTANCE` permits only revision or final acceptance.
- `READY_FOR_PRODUCTION`, `REVISION_REQUIRED`, and `ACCEPTED` do not expose an illegal repeat action.
- 400, 401, 404, 409, 502, and 503 errors preserve canonical details and add actionable user guidance.

## Non-claims

This record accepts the Desktop product surfaces. It does not claim that M5–M10 course content, WorkBuddy production runs, or final artifacts have passed Mousai acceptance.

Final full Workspace suite, Desktop build, and the one permitted Windows pack are recorded in the night-build checkpoint after they run.
