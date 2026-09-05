"""V1-S4 usage emitter tests: agent/workbridge_usage.py → the REAL WorkBridge
usage_store (sibling repo) → canonical ledger. Skips when the sibling
mousai-workspace checkout is not present (CI without the workspace)."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

DESKTOP_ROOT = Path(__file__).resolve().parents[2]
CONTROL_API_DIR = DESKTOP_ROOT.parent / "mousai-workspace" / "services" / "workbridge-api"


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class FakeResponse:
    def __init__(self, response_id: str = "resp-test-0001") -> None:
        self.id = response_id


class FakeUsage:
    def __init__(self, *, input_tokens=320, output_tokens=180, cache_read=40, cache_write=10, reasoning=25, request_count=1):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.cache_read_tokens = cache_read
        self.cache_write_tokens = cache_write
        self.reasoning_tokens = reasoning
        self.request_count = request_count


@unittest.skipUnless(CONTROL_API_DIR.is_dir(), "sibling mousai-workspace checkout not available")
class WorkbridgeUsageEmitterTests(unittest.TestCase):
    def setUp(self) -> None:
        self.emitter = load_module("test_workbridge_usage_emitter", DESKTOP_ROOT / "agent" / "workbridge_usage.py")
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.usage_root = str(Path(self.tmp.name) / "usage")
        env = {
            "WORKBRIDGE_API_DIR": str(CONTROL_API_DIR),
            "WORKBRIDGE_USAGE_ROOT": self.usage_root,
        }
        patcher = patch.dict("os.environ", env, clear=False)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _store(self):
        spec_path = CONTROL_API_DIR / "usage_store.py"
        return load_module("test_workbridge_usage_store", spec_path).UsageStore(self.usage_root)

    def test_one_emission_is_one_ledger_event_with_full_token_math(self) -> None:
        self.emitter.emit_model_usage(
            provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=FakeResponse(), agent="mousai",
        )
        state = json.loads((Path(self.usage_root) / "usage.json").read_text(encoding="utf-8"))
        self.assertEqual(len(state["entries"]), 1)
        entry = state["entries"][0]
        self.assertEqual(entry["source"], "hermes-gateway")
        self.assertEqual(entry["agent"], "mousai")
        self.assertEqual(entry["requests"], 1)
        # Provider-native convention: input includes cache, total = input + output.
        self.assertEqual(entry["input_tokens"], 320 + 40 + 10)
        self.assertEqual(entry["output_tokens"], 180)
        self.assertEqual(entry["total_tokens"], 320 + 40 + 10 + 180)
        self.assertIsNone(entry["work_id"])
        self.assertIsNone(entry["project_id"])
        # Only contract fields ever travel.
        self.assertEqual(
            set(entry),
            {"usage_id", "occurred_at", "provider", "model", "agent", "project_id",
             "work_id", "requests", "input_tokens", "output_tokens", "total_tokens", "source"},
        )

    def test_delivery_retry_never_double_counts(self) -> None:
        response = FakeResponse()
        usage = FakeUsage()
        self.emitter.emit_model_usage(provider="zhipu", model="glm-4.6", usage=usage, response=response, agent="mousai")
        self.emitter.emit_model_usage(provider="zhipu", model="glm-4.6", usage=usage, response=response, agent="mousai")
        state = json.loads((Path(self.usage_root) / "usage.json").read_text(encoding="utf-8"))
        self.assertEqual(len(state["entries"]), 1)

    def test_attribution_only_from_explicit_context(self) -> None:
        import os

        os.environ["WORKBRIDGE_WORK_ID"] = "WORK-20260905-001"
        os.environ["WORKBRIDGE_PROJECT_ID"] = "PROJECT-1"
        try:
            self.emitter.emit_model_usage(
                provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=FakeResponse("resp-ctx"), agent="mousai",
            )
        finally:
            os.environ.pop("WORKBRIDGE_WORK_ID", None)
            os.environ.pop("WORKBRIDGE_PROJECT_ID", None)
        state = json.loads((Path(self.usage_root) / "usage.json").read_text(encoding="utf-8"))
        self.assertEqual(state["entries"][0]["work_id"], "WORK-20260905-001")
        self.assertEqual(state["entries"][0]["project_id"], "PROJECT-1")

    def test_response_without_id_still_records_with_unique_id(self) -> None:
        self.emitter.emit_model_usage(provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=None, agent="mousai")
        state = json.loads((Path(self.usage_root) / "usage.json").read_text(encoding="utf-8"))
        self.assertEqual(len(state["entries"]), 1)

    def test_zero_usage_and_missing_store_are_silent_no_ops(self) -> None:
        self.emitter.emit_model_usage(
            provider="zhipu", model="glm-4.6",
            usage=FakeUsage(input_tokens=0, output_tokens=0, cache_read=0, cache_write=0, reasoning=0),
            response=FakeResponse("resp-zero"), agent="mousai",
        )
        with patch.dict("os.environ", {"WORKBRIDGE_USAGE_ROOT": str(Path(self.tmp.name) / "never-created")}):
            self.emitter.emit_model_usage(
                provider="zhipu", model="glm-4.6", usage=FakeUsage(), response=FakeResponse("resp-no-store"), agent="mousai",
            )
        usage_dir = Path(self.usage_root)
        self.assertFalse((usage_dir / "usage.json").exists())


if __name__ == "__main__":
    unittest.main()
