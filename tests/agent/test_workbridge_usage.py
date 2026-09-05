"""V1-S4 canonical ingestion e2e: Hermes emitter → local HTTP WorkBridge
ingestion endpoint → API validation → UsageStore → snapshot/providerUsage.

Runs the REAL WorkBridge ThreadingHTTPServer (from the sibling
mousai-workspace checkout) against a fake Feishu backend — the same approach
as the Control repo's own harness. No direct UsageStore import or use from
the emitter path: the emitter only knows the HTTP transport contract.

Skips when the sibling checkout is unavailable.
"""

from __future__ import annotations

import importlib.util
import json
import sys
import threading
import unittest
import urllib.request
from pathlib import Path
from unittest.mock import patch

import tempfile

DESKTOP_ROOT = Path(__file__).resolve().parents[2]
CONTROL_API_DIR = DESKTOP_ROOT.parent / "mousai-workspace" / "services" / "workbridge-api"
CONTROL_API = CONTROL_API_DIR / "workbridge_api.py"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def tempfile_dir(prefix: str) -> str:
    return tempfile.mkdtemp(prefix=f"{prefix}-")


class FakeResponse:
    def __init__(self, response_id: str) -> None:
        self.id = response_id


class FakeUsage:
    def __init__(self, *, input_tokens=320, output_tokens=180, cache_read=40, cache_write=10, reasoning=25, request_count=1):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.cache_read_tokens = cache_read
        self.cache_write_tokens = cache_write
        self.reasoning_tokens = reasoning
        self.request_count = request_count


@unittest.skipUnless(CONTROL_API.is_file(), "sibling mousai-workspace checkout not available")
class WorkbridgeUsageIngestionE2ETests(unittest.TestCase):
    token = "t" * 64

    def setUp(self) -> None:
        if str(CONTROL_API_DIR) not in sys.path:
            sys.path.insert(0, str(CONTROL_API_DIR))
        self.emitter = load_module("test_usage_emitter", DESKTOP_ROOT / "agent" / "workbridge_usage.py")
        harness = load_module("test_usage_harness", CONTROL_API_DIR / "test_workspace_snapshot.py")
        self.fake_feishu = harness.FakeFeishu({"TBL_PROJECTS": [], "TBL_TASKS": []})
        os_env = {
            "WORKBRIDGE_TOKEN": self.token,
            "WORKDATA_APP_ID": "id",
            "WORKDATA_APP_SECRET": "secret",
            "WORKBRIDGE_BASE_APP_TOKEN": "app-token",
            "WORKBRIDGE_TASKS_TABLE_ID": "TBL_TASKS",
            "WORKBRIDGE_PROJECTS_TABLE_ID": "TBL_PROJECTS",
            "WORKBRIDGE_FEISHU_BASE_URL": self.fake_feishu.base_url,
            "WORKBRIDGE_PRODUCTION_ROOT": tempfile_dir("e2e-production"),
            "WORKBRIDGE_PLANNING_ROOT": tempfile_dir("e2e-planning"),
            "WORKBRIDGE_INTAKE_ROOT": tempfile_dir("e2e-intake"),
            "WORKBRIDGE_SETTINGS_ROOT": tempfile_dir("e2e-settings"),
            "WORKBRIDGE_USAGE_ROOT": tempfile_dir("e2e-usage"),
            "WORKBRIDGE_REVIEW_ROOT": tempfile_dir("e2e-review"),
        }
        with patch.dict("os.environ", os_env, clear=True):
            config = harness.api.Config.from_env()
        self.server = harness.api.WorkBridgeServer(config)
        self._thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self._thread.start()
        self.addCleanup(self.teardown)
        self.base_url = f"http://127.0.0.1:{self.server.server_port}"
        env = {
            "WORKBRIDGE_INGEST_URL": f"{self.base_url}/workspace/usage/ingest",
            "WORKBRIDGE_INGEST_TOKEN": self.token,
            "WORKBRIDGE_WORK_ID": "",
            "WORKBRIDGE_PROJECT_ID": "",
        }
        patcher = patch.dict("os.environ", env, clear=False)
        patcher.start()
        self.addCleanup(patcher.stop)

    def teardown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.fake_feishu.stop()

    def _get(self, path: str) -> dict:
        request = urllib.request.Request(
            self.base_url + path, headers={"Authorization": f"Bearer {self.token}"}, method="GET"
        )
        with urllib.request.urlopen(request, timeout=10) as response:
            return json.loads(response.read().decode("utf-8"))

    def _ledger_total(self) -> int:
        return self._get("/workspace/snapshot")["usageLedgerTotal"]

    def _capturing_post(self, captured: list):
        """A transport double that forwards to the REAL endpoint but records
        exactly what the emitter put on the wire."""
        real_post = self.emitter.post_usage_json

        def _post(url, payload, token, timeout):
            captured.append({"url": url, "payload": json.loads(json.dumps(payload)), "token": token})
            return real_post(url, payload, token, timeout)

        return _post

    # 1. one event → one ledger row
    def test_one_emission_is_one_ledger_row(self) -> None:
        captured: list = []
        with patch.object(self.emitter, "post_usage_json", self._capturing_post(captured)):
            self.emitter.emit_model_usage(
                provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=FakeResponse("resp-e2e-1"), agent="mousai",
            )
        self.assertEqual(self._ledger_total(), 1)
        entry = self._get("/workspace/snapshot")["usageLedger"][0]
        self.assertEqual(entry["source"], "hermes-gateway")
        self.assertEqual(entry["total_tokens"], 320 + 40 + 10 + 180)
        # Only contract fields travel the wire.
        wire = captured[0]["payload"]["entries"][0]
        self.assertEqual(
            set(wire),
            {"usage_id", "occurred_at", "provider", "model", "agent", "project_id",
             "work_id", "requests", "input_tokens", "output_tokens", "total_tokens", "source"},
        )
        self.assertIsNone(wire["work_id"])
        self.assertIsNone(wire["project_id"])

    # 2. delivery retry → one ledger row
    def test_delivery_retry_yields_one_row(self) -> None:
        for _ in range(2):
            self.emitter.emit_model_usage(
                provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=FakeResponse("resp-e2e-2"), agent="mousai",
            )
        self.assertEqual(self._ledger_total(), 1)

    # 3. HTTP acknowledgement loss simulation → retry stays one row
    def test_lost_ack_retry_stays_one_row(self) -> None:
        calls = {"n": 0}
        emitter = self.emitter
        real_post = emitter.post_usage_json

        def lossy_post(url, payload, token, timeout):
            calls["n"] += 1
            if calls["n"] == 1:
                # First delivery reaches the server but the acknowledgement is
                # lost: the emitter experiences a transport failure although
                # the ledger already recorded the event.
                status = real_post(url, payload, token, timeout)
                assert status == 200
                raise emitter._DeliveryFailure("simulated acknowledgement loss")
            return real_post(url, payload, token, timeout)

        with patch.object(emitter, "post_usage_json", lossy_post):
            emitter.emit_model_usage(
                provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=FakeResponse("resp-e2e-3"), agent="mousai",
            )
        self.assertEqual(calls["n"], 2)
        self.assertEqual(self._ledger_total(), 1)

    # 4. malformed contract → no append
    def test_malformed_contract_never_appends(self) -> None:
        emitter = self.emitter

        def bad_post(url, payload, token, timeout):
            payload = json.loads(json.dumps(payload))
            payload["entries"][0]["total_tokens"] = 999999  # violates the invariant
            return emitter.post_usage_json(url, payload, token, timeout)

        with patch.object(emitter, "post_usage_json", bad_post):
            emitter.emit_model_usage(
                provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=FakeResponse("resp-e2e-4"), agent="mousai",
            )
        self.assertEqual(self._ledger_total(), 0)

    # 5. no stable call id → no canonical append, nothing even put on the wire
    def test_no_stable_identity_never_appends(self) -> None:
        captured: list = []
        with patch.object(self.emitter, "post_usage_json", self._capturing_post(captured)):
            self.emitter.emit_model_usage(
                provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=None, agent="mousai",
            )
            self.emitter.emit_model_usage(
                provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=object(), agent="mousai",
            )
        self.assertEqual(captured, [])
        self.assertEqual(self._ledger_total(), 0)

    # 6. explicit WORK-ID attribution only
    def test_explicit_work_id_attribution(self) -> None:
        import os

        os.environ["WORKBRIDGE_WORK_ID"] = "WORK-20260906-001"
        os.environ["WORKBRIDGE_PROJECT_ID"] = "PROJECT-9"
        try:
            self.emitter.emit_model_usage(
                provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=FakeResponse("resp-e2e-6"), agent="mousai",
            )
        finally:
            os.environ.pop("WORKBRIDGE_WORK_ID", None)
            os.environ.pop("WORKBRIDGE_PROJECT_ID", None)
        entry = self._get("/workspace/snapshot")["usageLedger"][0]
        self.assertEqual(entry["work_id"], "WORK-20260906-001")
        self.assertEqual(entry["project_id"], "PROJECT-9")

    # 7. prompt/body never transmitted
    def test_prompt_and_body_never_transmitted(self) -> None:
        captured: list = []
        with patch.object(self.emitter, "post_usage_json", self._capturing_post(captured)):
            self.emitter.emit_model_usage(
                provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=FakeResponse("resp-e2e-7"), agent="mousai",
            )
        wire = json.dumps(captured[0]["payload"], ensure_ascii=False)
        self.assertNotIn("prompt", wire)
        self.assertNotIn("raw_response", wire)
        self.assertNotIn("authorization_header", wire)

    # 8. engineering_probe excluded from user rollups
    def test_engineering_probe_excluded_from_rollups(self) -> None:
        body = json.dumps({"entries": [{
            "usage_id": "probe-e2e-1",
            "occurred_at": "2026-09-06T10:00:00+00:00",
            "provider": "engineering", "model": "smoke-probe", "agent": None,
            "project_id": None, "work_id": None,
            "requests": 1, "input_tokens": 100, "output_tokens": 50, "total_tokens": 150,
            "source": "engineering_probe",
        }]}).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/workspace/usage/ingest", data=body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {self.token}"}, method="POST",
        )
        with urllib.request.urlopen(request, timeout=10):
            pass
        self.emitter.emit_model_usage(
            provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=FakeResponse("resp-e2e-8"), agent="mousai",
        )
        snapshot = self._get("/workspace/snapshot")
        self.assertEqual(snapshot["usageLedgerTotal"], 2)
        self.assertEqual({rollup["provider"] for rollup in snapshot["providerUsage"]}, {"zhipu"})

    # dormant without credential: no canonical mutation, no error
    def test_dormant_without_credential(self) -> None:
        with patch.dict("os.environ", {"WORKBRIDGE_INGEST_TOKEN": "", "WORKBRIDGE_TOKEN": ""}, clear=False):
            self.emitter.emit_model_usage(
                provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=FakeResponse("resp-e2e-9"), agent="mousai",
            )
        self.assertEqual(self._ledger_total(), 0)


if __name__ == "__main__":
    unittest.main()
