"""Read-only Mousai Workspace snapshot backend.

Mounted by Hermes at ``/api/plugins/mousai-workspace``.  The dashboard's
existing authentication and profile-aware routing remain authoritative.
This module reuses the installed WorkBridge Feishu client and its existing
VPS-only WorkData credential file.  It never loads the WorkBridge bearer
token and never returns raw Feishu records.
"""

from __future__ import annotations

import importlib.util
import logging
import os
import stat
import sys
import urllib.parse
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException


router = APIRouter()
log = logging.getLogger(__name__)

SCHEMA_VERSION = "mousai.workspace.snapshot.v1"
PROJECT_TABLE_NAME = "项目与课程"
WORKBRIDGE_MODULE = Path("/opt/workagent/workbridge-api/workbridge_api.py")
WORKDATA_ENV_FILE = Path("/var/lib/workagent/workbridge/workbridge.env")
MAX_PROJECT_RECORDS = 5_000
MAX_COLLECTION_ITEMS = 64
MAX_TEXT_LENGTH = 8_192

PROJECT_FIELD_ALLOWLIST = frozenset(
    {
        "PROJECT-ID",
        "名称",
        "类型",
        "当前状态",
        "当前阶段",
        "下一步",
        "正式资料链接",
        "最后复盘",
        "更新时间",
        "授课对象",
        "年级",
        "专业背景",
        "总学时",
        "教学周数",
        "周课时",
        "考核方式",
        "考核比例",
        "指定教材",
        "参考书目",
        "偏好案例",
        "本地案例",
        "实践基地 / 期末选址",
        "教案模板链接",
        "PPT模板链接",
        "课程资料根链接",
    }
)

_NESTED_VALUE_KEYS = frozenset({"link", "name", "text", "type", "value"})
_WORKDATA_ENV_KEYS = frozenset(
    {
        "WORKDATA_APP_ID",
        "WORKDATA_APP_SECRET",
        "WORKBRIDGE_BASE_APP_TOKEN",
        "WORKBRIDGE_FEISHU_BASE_URL",
    }
)


class WorkspaceAuthorityUnavailable(RuntimeError):
    """The existing server-side WorkData authority cannot be used safely."""


def _secure_env_values(path: Path) -> dict[str, str]:
    try:
        metadata = path.stat()
    except OSError as exc:
        raise WorkspaceAuthorityUnavailable("WorkData authority is unavailable") from exc

    if not stat.S_ISREG(metadata.st_mode) or metadata.st_mode & 0o077:
        raise WorkspaceAuthorityUnavailable("WorkData authority permissions are unsafe")
    if hasattr(os, "geteuid") and metadata.st_uid != os.geteuid():
        raise WorkspaceAuthorityUnavailable("WorkData authority owner does not match the service user")

    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError as exc:
        raise WorkspaceAuthorityUnavailable("WorkData authority is unavailable") from exc

    for raw_line in lines:
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.removeprefix("export ").strip()
        if key not in _WORKDATA_ENV_KEYS:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        values[key] = value

    required = {"WORKDATA_APP_ID", "WORKDATA_APP_SECRET", "WORKBRIDGE_BASE_APP_TOKEN"}
    if any(not values.get(key) for key in required):
        raise WorkspaceAuthorityUnavailable("WorkData authority configuration is incomplete")
    return values


@lru_cache(maxsize=1)
def _workbridge_module():
    if not WORKBRIDGE_MODULE.is_file():
        raise WorkspaceAuthorityUnavailable("WorkBridge authority module is unavailable")
    module_name = "mousai_workspace_workbridge_authority"
    spec = importlib.util.spec_from_file_location(module_name, WORKBRIDGE_MODULE)
    if spec is None or spec.loader is None:
        raise WorkspaceAuthorityUnavailable("WorkBridge authority module cannot be loaded")
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        sys.modules.pop(module_name, None)
        raise WorkspaceAuthorityUnavailable("WorkBridge authority module cannot be loaded") from exc
    return module


@lru_cache(maxsize=1)
def _authority_store():
    values = _secure_env_values(WORKDATA_ENV_FILE)
    workbridge = _workbridge_module()
    config = workbridge.Config(
        bind_host="127.0.0.1",
        bind_port=0,
        bridge_token="not-loaded-by-workspace-plugin",
        workdata_app_id=values["WORKDATA_APP_ID"],
        workdata_app_secret=values["WORKDATA_APP_SECRET"],
        base_app_token=values["WORKBRIDGE_BASE_APP_TOKEN"],
        tasks_table_id="not-used-by-workspace-plugin",
        feishu_base_url=values.get("WORKBRIDGE_FEISHU_BASE_URL", "https://open.feishu.cn"),
    )
    return workbridge.FeishuStore(config)


def _sanitize_value(value: Any, *, depth: int = 0) -> Any:
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return value[:MAX_TEXT_LENGTH]
    if depth >= 3:
        return None
    if isinstance(value, list):
        return [
            clean
            for item in value[:MAX_COLLECTION_ITEMS]
            if (clean := _sanitize_value(item, depth=depth + 1)) is not None
        ]
    if isinstance(value, dict):
        return {
            str(key): clean
            for key, item in value.items()
            if key in _NESTED_VALUE_KEYS
            if (clean := _sanitize_value(item, depth=depth + 1)) is not None
        }
    return None


def _sanitize_project(record: Any) -> dict[str, Any] | None:
    if not isinstance(record, dict):
        return None
    fields = record.get("fields")
    if not isinstance(fields, dict):
        fields = {}
    clean_fields = {
        key: clean
        for key, value in fields.items()
        if key in PROJECT_FIELD_ALLOWLIST
        if (clean := _sanitize_value(value)) is not None
    }
    record_id = record.get("record_id")
    return {
        "record_id": record_id[:256] if isinstance(record_id, str) else None,
        "fields": clean_fields,
    }


def _list_tables(store: Any) -> list[dict[str, Any]]:
    app = urllib.parse.quote(store.config.base_app_token, safe="")
    page_token = ""
    tables: list[dict[str, Any]] = []
    while True:
        query = "?page_size=100"
        if page_token:
            query += "&page_token=" + urllib.parse.quote(page_token, safe="")
        response = store._request_json("GET", f"/open-apis/bitable/v1/apps/{app}/tables{query}")
        data = response.get("data") or {}
        tables.extend(item for item in data.get("items") or [] if isinstance(item, dict))
        if not data.get("has_more"):
            return tables
        page_token = str(data.get("page_token") or "")
        if not page_token:
            return tables


def _project_table_id(store: Any) -> str:
    matches = [item for item in _list_tables(store) if item.get("name") == PROJECT_TABLE_NAME]
    if len(matches) != 1 or not isinstance(matches[0].get("table_id"), str):
        raise WorkspaceAuthorityUnavailable("Project table is missing or ambiguous")
    return matches[0]["table_id"]


def _read_project_records(store: Any, table_id: str) -> list[dict[str, Any]]:
    app = urllib.parse.quote(store.config.base_app_token, safe="")
    table = urllib.parse.quote(table_id, safe="")
    page_token = ""
    records: list[dict[str, Any]] = []
    while True:
        query = "?page_size=500&automatic_fields=false"
        if page_token:
            query += "&page_token=" + urllib.parse.quote(page_token, safe="")
        response = store._request_json(
            "GET",
            f"/open-apis/bitable/v1/apps/{app}/tables/{table}/records{query}",
        )
        data = response.get("data") or {}
        records.extend(item for item in data.get("items") or [] if isinstance(item, dict))
        if len(records) > MAX_PROJECT_RECORDS:
            raise WorkspaceAuthorityUnavailable("Project record limit exceeded")
        if not data.get("has_more"):
            return records
        page_token = str(data.get("page_token") or "")
        if not page_token:
            return records


def build_workspace_snapshot() -> dict[str, Any]:
    store = _authority_store()
    table_id = _project_table_id(store)
    projects = [
        sanitized
        for record in _read_project_records(store, table_id)
        if (sanitized := _sanitize_project(record)) is not None
    ]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "projects": projects,
        "tasks": [],
        "events": [],
        "deliverables": [],
    }


@router.get("/snapshot")
def get_workspace_snapshot():
    try:
        return build_workspace_snapshot()
    except WorkspaceAuthorityUnavailable as exc:
        log.warning("workspace snapshot authority unavailable type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail={"code": "workspace_authority_unavailable", "message": "Workspace data is unavailable"},
        ) from exc
    except Exception as exc:
        log.warning("workspace snapshot read failed type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail={"code": "workspace_read_failed", "message": "Workspace data read failed"},
        ) from exc
