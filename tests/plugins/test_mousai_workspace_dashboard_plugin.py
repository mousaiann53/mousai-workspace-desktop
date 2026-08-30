"""Behavior tests for the bounded Mousai Workspace dashboard backend."""

from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient


PLUGIN_API = (
    Path(__file__).resolve().parents[2]
    / "plugins"
    / "mousai-workspace"
    / "dashboard"
    / "plugin_api.py"
)


def load_plugin_api():
    name = "test_mousai_workspace_plugin_api"
    spec = importlib.util.spec_from_file_location(name, PLUGIN_API)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class FakeStore:
    def __init__(self) -> None:
        self.config = SimpleNamespace(base_app_token="base-token-id")
        self.calls: list[tuple[str, str]] = []

    def _request_json(self, method: str, path: str):
        self.calls.append((method, path))
        if "/tables?" in path:
            return {
                "data": {
                    "items": [
                        {"name": "工作任务", "table_id": "task-table"},
                        {"name": "项目与课程", "table_id": "project-table"},
                    ],
                    "has_more": False,
                }
            }
        if "/project-table/records?" in path:
            return {
                "data": {
                    "items": [
                        {
                            "record_id": "rec-project",
                            "fields": {
                                "PROJECT-ID": "PROJECT-001",
                                "名称": "历史建筑活化利用",
                                "类型": "教学",
                                "总学时": None,
                                "正式资料链接": {"text": "课程资料", "link": "https://example.invalid/course"},
                                "学生姓名": "must-not-leave-server",
                                "credential": "must-not-leave-server",
                            },
                            "created_by": {"name": "must-not-leave-server"},
                        }
                    ],
                    "has_more": False,
                }
            }
        if "/task-table/records?" in path:
            return {
                "data": {
                    "items": [
                        {
                            "record_id": "rec-task",
                            "fields": {
                                "WORK-ID": "WORK-001",
                                "任务名称": "整理第一次课资料",
                                "类型": "行政",
                                "所属项目": "历史建筑活化利用",
                                "状态": "收件箱",
                                "优先级": "普通",
                                "DDL": None,
                                "下一步": "核对正式资料",
                                "来源": "工作系统",
                                "产物链接": None,
                                "需要人工验收": True,
                                "创建时间": 1787965200000,
                                "最后更新时间": 1787968800000,
                                "产物清单": '{"work_id":"WORK-001","generated_at":"2026-08-29T01:00:00Z","file_count":1,"total_size_bytes":12,"local_output_root":"H:\\\\private","files":[{"filename":"test.pdf","relative_path":"deliverables/test.pdf","extension":".pdf","size_bytes":12,"sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","modified_at":"2026-08-29T01:00:00Z","secret":"strip-me"}]}',
                                "交付记录": '{"summary":{"message_id":"hidden"},"files":[{"relative_path":"deliverables/test.pdf","sha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","message_id":"hidden","delivered_at":"2026-08-29T01:05:00Z"}]}',
                                "unknown": "must-not-leave-server",
                            },
                            "created_by": {"name": "must-not-leave-server"},
                        }
                    ],
                    "has_more": False,
                }
            }
        raise AssertionError(f"unexpected path: {path}")


class FakePlanningStore:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def snapshot(self):
        return {
            "scheduleBlocks": [],
            "fixedEvents": [],
            "planningProposals": [],
            "planningEvents": [],
            "estimatedDurations": {"WORK-001": 45},
        }


class FakeIntakeStore:
    def __init__(self) -> None:
        self.calls: list[tuple[str, object]] = []

    def snapshot(self, records):
        return {
            "sourceIdentities": {
                "WORK-001": {
                    "source_type": "workspace",
                    "source_id": "rec-task",
                    "channel": "workspace",
                    "display_name": "工作系统",
                    "origin_reference": "workdata:rec-task",
                    "received_at": None,
                }
            },
            "ingestEvents": [],
            "duplicateEvidence": [
                {"work_id": "WORK-001", "state": "unknown", "related_work_ids": [], "evidence": [], "revision": 0}
            ],
            "workScope": [],
            "workScopeEvents": [],
        }

    def review_duplicate(self, body, *, task_lookup, now):
        self.calls.append(("review", deepcopy(body)))
        return {"duplicate_evidence": {"state": body["state"]}, "idempotent": False}

    def merge(self, body, *, task_lookup, archive, now):
        self.calls.append(("merge", deepcopy(body)))
        return {"survivor_work_id": body["survivor_work_id"], "idempotent": False}

    def set_scope(self, body, *, now):
        self.calls.append(("scope", deepcopy(body)))
        return {"work_scope": {"scope_id": body["scope_id"]}, "idempotent": False}

    def register(self, body, *, task_lookup, now):
        self.calls.append(("register", deepcopy(body)))
        self.task = task_lookup(body["work_id"])
        return {
            "proposal": {
                "proposal_id": "PLAN-0123456789ABCDEF",
                "proposal_revision": 1,
                "status": "pending",
                "work_id": body["work_id"],
            },
            "idempotent": False,
        }

    def mutate(self, proposal_id, action, body, *, task_lookup, now):
        self.calls.append((action, deepcopy(body)))
        return {
            "proposal": {
                "proposal_id": proposal_id,
                "proposal_revision": body["expected_revision"] + 1,
                "status": "accepted" if action == "accept" else "ignored",
                "work_id": "WORK-001",
            },
            "schedule_block": None,
            "idempotent": False,
        }


class MutationStore:
    def __init__(self, *, status: str = "待验收") -> None:
        self.config = SimpleNamespace(base_app_token="base-token-id")
        self._write_lock = threading.RLock()
        self.task = {
            "record_id": "rec-task",
            "fields": {
                "WORK-ID": "WORK-001",
                "任务名称": "Phase 1C Base 闭环测试",
                "类型": "行政",
                "所属项目": "历史建筑活化利用",
                "状态": status,
                "优先级": "普通",
                "DDL": None,
                "下一步": "原下一步",
            },
        }
        self.project = {
            "record_id": "rec-project",
            "fields": {"PROJECT-ID": "PROJECT-001", "名称": "历史建筑活化利用", "类型": "教学"},
        }
        self.calls: list[tuple[str, str, object]] = []

    def _request_json(self, method: str, path: str, payload=None):
        self.calls.append((method, path, deepcopy(payload)))
        if "/tables?" in path:
            return {
                "data": {
                    "items": [
                        {"name": "工作任务", "table_id": "task-table"},
                        {"name": "项目与课程", "table_id": "project-table"},
                    ],
                    "has_more": False,
                }
            }
        if "/task-table/records?" in path:
            return {"data": {"items": [deepcopy(self.task)], "has_more": False}}
        if "/project-table/records?" in path:
            return {"data": {"items": [deepcopy(self.project)], "has_more": False}}
        if method == "PUT" and path.endswith("/task-table/records/rec-task"):
            self.task["fields"].update(payload["fields"])
            return {"data": {"record": deepcopy(self.task)}}
        raise AssertionError(f"unexpected request: {method} {path}")

    def archive_task(self, _work_id: str):
        self.task["fields"]["状态"] = "已归档"
        return deepcopy(self.task)

    def flag_task(self, _work_id: str, flag: str, note: str):
        self.task["fields"]["状态"] = {"material_missing": "资料缺失", "decision_required": "需要决策"}[flag]
        self.task["fields"]["下一步"] = note
        return deepcopy(self.task)


class CreateStore:
    def __init__(self, plugin_api) -> None:
        self.plugin_api = plugin_api
        self.config = SimpleNamespace(base_app_token="base-token-id")
        stamp = plugin_api.datetime.now(plugin_api.SHANGHAI_TZ).strftime("%Y%m%d")
        self.tasks = [
            {
                "record_id": "rec-existing",
                "fields": {
                    "WORK-ID": f"WORK-{stamp}-001",
                    "任务名称": "已有任务",
                    "状态": "收件箱",
                    "来源": "工作系统",
                    "需要人工验收": True,
                },
            }
        ]
        self.project = {
            "record_id": "rec-project",
            "fields": {"PROJECT-ID": "PROJECT-001", "名称": "历史建筑活化利用", "类型": "教学"},
        }
        self.calls: list[tuple[str, str, object]] = []

    def _request_json(self, method: str, path: str, payload=None):
        self.calls.append((method, path, deepcopy(payload)))
        if "/tables?" in path:
            return {
                "data": {
                    "items": [
                        {"name": "工作任务", "table_id": "task-table"},
                        {"name": "项目与课程", "table_id": "project-table"},
                    ],
                    "has_more": False,
                }
            }
        if "/task-table/records?" in path:
            return {"data": {"items": deepcopy(self.tasks), "has_more": False}}
        if "/project-table/records?" in path:
            return {"data": {"items": [deepcopy(self.project)], "has_more": False}}
        if method == "POST" and path.endswith("/task-table/records"):
            record = {"record_id": f"rec-created-{len(self.tasks)}", "fields": deepcopy(payload["fields"])}
            self.tasks.append(record)
            return {"data": {"record": deepcopy(record)}}
        raise AssertionError(f"unexpected request: {method} {path}")


class MousaiWorkspaceDashboardPluginTests(unittest.TestCase):
    def setUp(self):
        self.plugin_api = load_plugin_api()

    def tearDown(self):
        sys.modules.pop("test_mousai_workspace_plugin_api", None)

    def test_snapshot_is_versioned_allowlisted_and_read_only(self):
        store = FakeStore()
        planning = FakePlanningStore()
        intake = FakeIntakeStore()
        workbridge = SimpleNamespace(intake_store=SimpleNamespace(task_revision=lambda _record: "b" * 64))
        with patch.object(self.plugin_api, "_authority_store", return_value=store), patch.object(
            self.plugin_api, "_planning_store", return_value=planning
        ), patch.object(self.plugin_api, "_intake_store", return_value=intake), patch.object(
            self.plugin_api, "_workbridge_module", return_value=workbridge
        ):
            snapshot = self.plugin_api.build_workspace_snapshot()

        self.assertEqual(snapshot["schemaVersion"], "mousai.workspace.snapshot.v1")
        self.assertTrue(snapshot["generatedAt"].endswith("Z"))
        self.assertEqual(len(snapshot["tasks"]), 1)
        task = dict(snapshot["tasks"][0])
        self.assertRegex(task.pop("revision"), r"^[0-9a-f]{64}$")
        self.assertEqual(task.pop("intake_revision"), "b" * 64)
        self.assertEqual(task.pop("sourceIdentity")["source_type"], "workspace")
        self.assertEqual(task.pop("estimated_duration_minutes"), 45)
        self.assertEqual(
            task,
            {
                "record_id": "rec-task",
                "fields": {
                    "WORK-ID": "WORK-001",
                    "任务名称": "整理第一次课资料",
                    "类型": "行政",
                    "所属项目": "历史建筑活化利用",
                    "状态": "收件箱",
                    "优先级": "普通",
                    "下一步": "核对正式资料",
                    "来源": "工作系统",
                    "需要人工验收": True,
                    "创建时间": 1787965200000,
                    "最后更新时间": 1787968800000,
                },
            },
        )
        self.assertEqual(snapshot["events"], [])
        self.assertEqual(snapshot["scheduleBlocks"], [])
        self.assertEqual(snapshot["fixedEvents"], [])
        self.assertEqual(snapshot["planningProposals"], [])
        self.assertEqual(snapshot["planningEvents"], [])
        self.assertEqual(snapshot["ingestEvents"], [])
        self.assertEqual(snapshot["duplicateEvidence"][0]["state"], "unknown")
        self.assertEqual(snapshot["workScope"], [])
        self.assertEqual(
            snapshot["deliverables"],
            [
                {
                    "work_id": "WORK-001",
                    "generated_at": "2026-08-29T01:00:00Z",
                    "file_count": 1,
                    "total_size_bytes": 12,
                    "files": [
                        {
                            "filename": "test.pdf",
                            "relative_path": "deliverables/test.pdf",
                            "extension": ".pdf",
                            "size_bytes": 12,
                            "sha256": "a" * 64,
                            "modified_at": "2026-08-29T01:00:00Z",
                        }
                    ],
                    "task_status": "收件箱",
                    "delivery_summary_sent": True,
                    "delivered_files": [
                        {
                            "relative_path": "deliverables/test.pdf",
                            "sha256": "a" * 64,
                            "delivered_at": "2026-08-29T01:05:00Z",
                        }
                    ],
                }
            ],
        )
        self.assertEqual(
            snapshot["projects"],
            [
                {
                    "record_id": "rec-project",
                    "fields": {
                        "PROJECT-ID": "PROJECT-001",
                        "名称": "历史建筑活化利用",
                        "类型": "教学",
                        "正式资料链接": {
                            "text": "课程资料",
                            "link": "https://example.invalid/course",
                        },
                    },
                }
            ],
        )
        self.assertTrue(store.calls)
        self.assertEqual({method for method, _path in store.calls}, {"GET"})
        serialized = repr(snapshot)
        self.assertNotIn("must-not-leave-server", serialized)
        self.assertNotIn("strip-me", serialized)
        self.assertNotIn("local_output_root", serialized)

    def test_planning_routes_use_typed_store_without_loading_bearer(self):
        planning = FakePlanningStore()
        task = {"record_id": "rec-task", "fields": {"WORK-ID": "WORK-001", "状态": "收件箱"}}
        app = FastAPI()
        app.include_router(self.plugin_api.router, prefix="/api/plugins/mousai-workspace")
        client = TestClient(app, raise_server_exceptions=False)
        register_body = {
            "client_request_id": "desktop-plan-register-001",
            "work_id": "WORK-001",
            "starts_at": "2026-09-01T09:00:00+08:00",
            "ends_at": "2026-09-01T09:45:00+08:00",
            "executor": "Mousai",
            "kind": "task",
            "estimated_duration_minutes": 45,
            "actor": "Mousai",
        }
        with patch.object(self.plugin_api, "_planning_store", return_value=planning), patch.object(
            self.plugin_api, "_planning_task_lookup", return_value=task
        ):
            registered = client.post("/api/plugins/mousai-workspace/planning/proposals", json=register_body)
            accepted = client.post(
                "/api/plugins/mousai-workspace/planning/proposals/PLAN-0123456789ABCDEF/accept",
                json={"client_request_id": "desktop-plan-accept-001", "expected_revision": 1, "actor": "Mousai"},
            )
            missing = client.post(
                "/api/plugins/mousai-workspace/planning/proposals/PLAN-0123456789ABCDEF/delete",
                json={},
            )

        self.assertEqual(registered.status_code, 200)
        self.assertEqual(registered.json()["planning"]["proposal"]["status"], "pending")
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(accepted.json()["planning"]["proposal"]["status"], "accepted")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual([action for action, _body in planning.calls], ["register", "accept"])
        self.assertNotIn("token", repr(planning.calls).lower())

    def test_intake_routes_use_typed_store_without_loading_bearer(self):
        intake = FakeIntakeStore()
        app = FastAPI()
        app.include_router(self.plugin_api.router, prefix="/api/plugins/mousai-workspace")
        client = TestClient(app, raise_server_exceptions=False)
        with patch.object(self.plugin_api, "_intake_store", return_value=intake):
            reviewed = client.post(
                "/api/plugins/mousai-workspace/intake/duplicates/review",
                json={"work_id": "WORK-001", "related_work_id": "WORK-002", "state": "possible"},
            )
            scoped = client.post(
                "/api/plugins/mousai-workspace/intake/scopes",
                json={"source_type": "manual", "scope_id": "probe", "state": "approval_required"},
            )
        self.assertEqual(reviewed.status_code, 200)
        self.assertEqual(scoped.status_code, 200)
        self.assertEqual([action for action, _body in intake.calls], ["review", "scope"])
        self.assertNotIn("token", repr(intake.calls).lower())

    def test_task_and_manifest_sanitizers_fail_closed(self):
        self.assertIsNone(self.plugin_api._sanitize_task("not-a-record"))
        self.assertIsNone(self.plugin_api._sanitize_manifest({"fields": {"产物清单": "not-json"}}))
        self.assertIsNone(
            self.plugin_api._sanitize_manifest(
                {
                    "fields": {
                        "WORK-ID": "WORK-001",
                        "产物清单": '{"work_id":"WORK-OTHER","file_count":0,"total_size_bytes":0,"files":[]}',
                    }
                }
            )
        )

    def test_snapshot_route_remains_get_only_and_sanitizes_failures(self):
        def fail():
            raise RuntimeError("do-not-expose-this-value")

        app = FastAPI()
        app.include_router(self.plugin_api.router, prefix="/api/plugins/mousai-workspace")
        client = TestClient(app, raise_server_exceptions=False)
        with patch.object(self.plugin_api, "build_workspace_snapshot", side_effect=fail):
            response = client.get("/api/plugins/mousai-workspace/snapshot")

        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["detail"]["code"], "workspace_read_failed")
        self.assertNotIn("do-not-expose-this-value", response.text)
        self.assertEqual(client.post("/api/plugins/mousai-workspace/snapshot").status_code, 405)

    def test_revision_is_deterministic_order_independent_and_allowlisted(self):
        record = {
            "record_id": "rec-task",
            "fields": {
                "WORK-ID": "WORK-001",
                "任务名称": "测试任务",
                "状态": "收件箱",
                "下一步": "A",
                "unknown": "ignored",
            },
        }
        reordered = {
            "fields": {
                "下一步": "A",
                "状态": "收件箱",
                "任务名称": "测试任务",
                "WORK-ID": "WORK-001",
                "another_unknown": "ignored",
            },
            "record_id": "rec-task",
        }
        first = self.plugin_api._task_revision(record)
        self.assertEqual(first, self.plugin_api._task_revision(reordered))
        reordered["fields"]["下一步"] = "B"
        self.assertNotEqual(first, self.plugin_api._task_revision(reordered))

    def _request(self, store: MutationStore, **extra):
        body = {
            "clientRequestId": "request-001",
            "expectedRevision": self.plugin_api._task_revision(store.task),
        }
        body.update(extra)
        return body

    def test_edit_updates_only_approved_fields_and_same_target_is_idempotent(self):
        store = MutationStore()
        body = self._request(store, changes={"nextAction": "已核对"})
        with patch.object(self.plugin_api, "_authority_store", return_value=store):
            result = self.plugin_api.mutate_task("WORK-001", "edit", body)
            repeated = self.plugin_api.mutate_task("WORK-001", "edit", body)

        self.assertFalse(result["idempotent"])
        self.assertTrue(repeated["idempotent"])
        self.assertEqual(store.task["fields"]["下一步"], "已核对")
        put_payloads = [payload for method, _path, payload in store.calls if method == "PUT"]
        self.assertEqual(put_payloads, [{"fields": {"下一步": "已核对"}}])

    def test_stale_revision_conflicts_unless_desired_fact_already_matches(self):
        store = MutationStore()
        stale = "0" * 64
        with patch.object(self.plugin_api, "_authority_store", return_value=store):
            with self.assertRaisesRegex(self.plugin_api.WorkspaceMutationProblem, "changed") as raised:
                self.plugin_api.mutate_task(
                    "WORK-001",
                    "edit",
                    {"clientRequestId": "request-001", "expectedRevision": stale, "changes": {"nextAction": "B"}},
                )
        self.assertEqual(raised.exception.status_code, 409)
        self.assertEqual(raised.exception.code, "revision_conflict")

    def test_edit_validation_rejects_unknown_immutable_empty_and_bad_values(self):
        store = MutationStore()
        invalid_changes = [
            {},
            {"WORK-ID": "WORK-OTHER"},
            {"priority": "最高"},
            {"deadline": "next-week"},
            {"projectRef": "PROJECT-MISSING"},
        ]
        with patch.object(self.plugin_api, "_authority_store", return_value=store):
            for changes in invalid_changes:
                with self.subTest(changes=changes), self.assertRaises(self.plugin_api.WorkspaceMutationProblem):
                    self.plugin_api.mutate_task("WORK-001", "edit", self._request(store, changes=changes))

    def test_defer_requires_explicit_date_and_is_idempotent(self):
        store = MutationStore(status="收件箱")
        with patch.object(self.plugin_api, "_authority_store", return_value=store):
            with self.assertRaises(self.plugin_api.WorkspaceMutationProblem):
                self.plugin_api.mutate_task("WORK-001", "defer", self._request(store, deadline="明天"))
            body = self._request(store, deadline="2026-09-10")
            result = self.plugin_api.mutate_task("WORK-001", "defer", body)
            repeated = self.plugin_api.mutate_task("WORK-001", "defer", body)
            with self.assertRaises(self.plugin_api.WorkspaceMutationProblem) as stale:
                self.plugin_api.mutate_task(
                    "WORK-001",
                    "defer",
                    {
                        "clientRequestId": "request-002",
                        "expectedRevision": "0" * 64,
                        "deadline": "2026-09-11",
                    },
                )
        self.assertFalse(result["idempotent"])
        self.assertTrue(repeated["idempotent"])
        self.assertEqual(stale.exception.code, "revision_conflict")
        self.assertEqual(self.plugin_api._deadline_value(store.task["fields"]["DDL"]), "2026-09-10")

    def test_complete_is_human_final_completion_not_worker_complete(self):
        store = MutationStore(status="待验收")
        body = self._request(store)
        with patch.object(self.plugin_api, "_authority_store", return_value=store):
            result = self.plugin_api.mutate_task("WORK-001", "complete", body)
            repeated = self.plugin_api.mutate_task("WORK-001", "complete", body)
        self.assertFalse(result["idempotent"])
        self.assertTrue(repeated["idempotent"])
        self.assertEqual(store.task["fields"]["状态"], "已完成")
        self.assertNotIn("待验收", repr([payload for method, _path, payload in store.calls if method == "PUT"]))

    def test_triage_reuses_typed_archive_and_flag_actions_with_revision_checks(self):
        store = MutationStore(status="收件箱")
        with patch.object(self.plugin_api, "_authority_store", return_value=store):
            flagged = self.plugin_api._run_triage(
                "WORK-001",
                "flag",
                self._request(store, flag="material_missing", note="补充正式资料"),
            )
            repeated = self.plugin_api._run_triage(
                "WORK-001",
                "flag",
                self._request(store, flag="material_missing", note="补充正式资料"),
            )
            archived = self.plugin_api._run_triage("WORK-001", "archive", self._request(store))
        self.assertFalse(flagged["idempotent"])
        self.assertTrue(repeated["idempotent"])
        self.assertFalse(archived["idempotent"])
        self.assertEqual(store.task["fields"]["状态"], "已归档")

    def test_execution_active_and_terminal_states_are_protected_server_side(self):
        for status in ["云端处理中", "等待本机", "已领取", "本机处理中", "已归档"]:
            store = MutationStore(status=status)
            with self.subTest(status=status), patch.object(self.plugin_api, "_authority_store", return_value=store):
                with self.assertRaises(self.plugin_api.WorkspaceMutationProblem):
                    self.plugin_api.mutate_task(
                        "WORK-001", "edit", self._request(store, changes={"nextAction": "blocked"})
                    )
                with self.assertRaises(self.plugin_api.WorkspaceMutationProblem):
                    self.plugin_api.mutate_task("WORK-001", "complete", self._request(store))
            self.assertFalse(any(method == "PUT" for method, _path, _payload in store.calls))

    def test_mutation_route_returns_sanitized_conflict_and_has_no_generic_patch(self):
        app = FastAPI()
        app.include_router(self.plugin_api.router, prefix="/api/plugins/mousai-workspace")
        client = TestClient(app, raise_server_exceptions=False)
        conflict = self.plugin_api.WorkspaceMutationProblem(409, "revision_conflict", "private detail")
        with patch.object(self.plugin_api, "mutate_task", side_effect=conflict):
            response = client.patch(
                "/api/plugins/mousai-workspace/tasks/WORK-001",
                json={"clientRequestId": "request-001", "expectedRevision": "0" * 64, "changes": {"title": "x"}},
            )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "revision_conflict")
        self.assertEqual(client.patch("/api/plugins/mousai-workspace/records/rec-task", json={}).status_code, 404)

    def _create_body(self, request_id: str = "desktop:create-001", title: str = "新任务"):
        return {
            "clientRequestId": request_id,
            "task": {
                "title": title,
                "type": "行政",
                "projectRef": "PROJECT-001",
                "priority": "普通",
                "deadline": "2026-09-10",
                "nextAction": "核对资料",
            },
        }

    def test_formal_work_id_allocation_follows_existing_daily_sequence(self):
        records = [
            {"fields": {"WORK-ID": "WORK-20260829-002"}},
            {"fields": {"WORK-ID": "WORK-20260828-999"}},
            {"fields": {"WORK-ID": "NOT-FORMAL"}},
        ]
        instant = self.plugin_api.datetime(2026, 8, 29, 12, tzinfo=self.plugin_api.SHANGHAI_TZ)
        self.assertEqual(self.plugin_api._allocate_work_id(records, today=instant), "WORK-20260829-003")

    def test_create_is_durable_idempotent_and_authoritatively_unique(self):
        store = CreateStore(self.plugin_api)
        with tempfile.TemporaryDirectory() as directory, patch.object(
            self.plugin_api, "_authority_store", return_value=store
        ), patch.object(self.plugin_api, "_create_lock_path", return_value=Path(directory) / "create.lock"):
            first = self.plugin_api.create_task(self._create_body())
            repeated = self.plugin_api.create_task(self._create_body())

        self.assertFalse(first["idempotent"])
        self.assertTrue(repeated["idempotent"])
        self.assertEqual(first["workId"], repeated["workId"])
        self.assertEqual(len(store.tasks), 2)
        created = store.tasks[-1]["fields"]
        self.assertEqual(created["状态"], "收件箱")
        self.assertTrue(created["需要人工验收"])
        self.assertRegex(created["来源"], r"^Mousai Workspace create:desktop:create-001:[0-9a-f]{64}$")

    def test_create_serializes_concurrent_requests_without_duplicate_work_ids(self):
        store = CreateStore(self.plugin_api)
        with tempfile.TemporaryDirectory() as directory, patch.object(
            self.plugin_api, "_authority_store", return_value=store
        ), patch.object(self.plugin_api, "_create_lock_path", return_value=Path(directory) / "create.lock"):
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(
                    pool.map(
                        lambda request_id: self.plugin_api.create_task(self._create_body(request_id=request_id)),
                        ["desktop:create-001", "desktop:create-002"],
                    )
                )

        work_ids = [result["workId"] for result in results]
        self.assertEqual(len(work_ids), len(set(work_ids)))
        self.assertEqual(len(store.tasks), 3)

    def test_create_serializes_concurrent_retries_as_one_record(self):
        store = CreateStore(self.plugin_api)
        with tempfile.TemporaryDirectory() as directory, patch.object(
            self.plugin_api, "_authority_store", return_value=store
        ), patch.object(self.plugin_api, "_create_lock_path", return_value=Path(directory) / "create.lock"):
            with ThreadPoolExecutor(max_workers=4) as pool:
                results = list(pool.map(lambda _: self.plugin_api.create_task(self._create_body()), range(4)))

        self.assertEqual({result["workId"] for result in results}, {results[0]["workId"]})
        self.assertEqual(sum(not result["idempotent"] for result in results), 1)
        self.assertEqual(len(store.tasks), 2)

    def test_create_rejects_reused_request_id_with_different_facts(self):
        store = CreateStore(self.plugin_api)
        with tempfile.TemporaryDirectory() as directory, patch.object(
            self.plugin_api, "_authority_store", return_value=store
        ), patch.object(self.plugin_api, "_create_lock_path", return_value=Path(directory) / "create.lock"):
            self.plugin_api.create_task(self._create_body())
            with self.assertRaises(self.plugin_api.WorkspaceMutationProblem) as raised:
                self.plugin_api.create_task(self._create_body(title="另一个任务"))
        self.assertEqual(raised.exception.code, "client_request_reused")
        self.assertEqual(len(store.tasks), 2)

    def test_create_route_is_explicit_and_sanitizes_failures(self):
        app = FastAPI()
        app.include_router(self.plugin_api.router, prefix="/api/plugins/mousai-workspace")
        client = TestClient(app, raise_server_exceptions=False)
        conflict = self.plugin_api.WorkspaceMutationProblem(
            409, "client_request_reused", "clientRequestId was used for another task"
        )
        with patch.object(self.plugin_api, "create_task", side_effect=conflict):
            response = client.post("/api/plugins/mousai-workspace/tasks", json=self._create_body())
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"]["code"], "client_request_reused")

    def test_env_reader_never_loads_workbridge_bearer_token(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / "workbridge.env"
            env_file.write_text(
                "WORKBRIDGE_TOKEN=must-never-load\n"
                "WORKDATA_APP_ID=app-id\n"
                "WORKDATA_APP_SECRET=app-secret\n"
                "WORKBRIDGE_BASE_APP_TOKEN=base-token\n",
                encoding="utf-8",
            )
            os.chmod(env_file, 0o600)
            if os.name == "nt":
                # Windows does not expose POSIX chmod bits through Path.stat().
                # Keep this test focused on the credential-name allowlist; the
                # real permission gate is exercised on the Linux VPS below.
                metadata = SimpleNamespace(st_mode=0o100600, st_uid=0)
                with patch.object(type(env_file), "stat", return_value=metadata):
                    values = self.plugin_api._secure_env_values(env_file)
            else:
                values = self.plugin_api._secure_env_values(env_file)

        self.assertEqual(
            set(values),
            {"WORKDATA_APP_ID", "WORKDATA_APP_SECRET", "WORKBRIDGE_BASE_APP_TOKEN"},
        )
        self.assertNotIn("must-never-load", repr(values))

    @unittest.skipIf(os.name == "nt", "POSIX permission bits are enforced on the VPS")
    def test_env_reader_rejects_group_or_world_access(self):
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / "workbridge.env"
            env_file.write_text(
                "WORKDATA_APP_ID=app-id\n"
                "WORKDATA_APP_SECRET=app-secret\n"
                "WORKBRIDGE_BASE_APP_TOKEN=base-token\n",
                encoding="utf-8",
            )
            os.chmod(env_file, 0o640)
            with self.assertRaises(self.plugin_api.WorkspaceAuthorityUnavailable):
                self.plugin_api._secure_env_values(env_file)


if __name__ == "__main__":
    unittest.main()
