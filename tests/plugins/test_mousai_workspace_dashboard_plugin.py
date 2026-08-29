"""Behavior tests for the Mousai Workspace read-only dashboard backend."""

from __future__ import annotations

import importlib.util
import os
import sys
import tempfile
import unittest
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
        if "/records?" in path:
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
        raise AssertionError(f"unexpected path: {path}")


class MousaiWorkspaceDashboardPluginTests(unittest.TestCase):
    def setUp(self):
        self.plugin_api = load_plugin_api()

    def tearDown(self):
        sys.modules.pop("test_mousai_workspace_plugin_api", None)

    def test_snapshot_is_versioned_allowlisted_and_read_only(self):
        store = FakeStore()
        with patch.object(self.plugin_api, "_authority_store", return_value=store):
            snapshot = self.plugin_api.build_workspace_snapshot()

        self.assertEqual(snapshot["schemaVersion"], "mousai.workspace.snapshot.v1")
        self.assertTrue(snapshot["generatedAt"].endswith("Z"))
        self.assertEqual(snapshot["tasks"], [])
        self.assertEqual(snapshot["events"], [])
        self.assertEqual(snapshot["deliverables"], [])
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

    def test_plugin_route_exposes_get_only_and_sanitizes_failures(self):
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
