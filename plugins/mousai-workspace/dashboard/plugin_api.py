"""Mousai Workspace snapshot and bounded task-mutation backend.

Mounted by Hermes at ``/api/plugins/mousai-workspace``.  The dashboard's
existing authentication and profile-aware routing remain authoritative.
This module reuses the installed WorkBridge Feishu client and its existing
VPS-only WorkData credential file.  It never loads the WorkBridge bearer
token and never returns raw Feishu records.
"""

from __future__ import annotations

import importlib.util
import hashlib
import json
import logging
import os
import re
import stat
import sys
import threading
import urllib.parse
from contextlib import contextmanager
from datetime import date, datetime, time, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException


router = APIRouter()
log = logging.getLogger(__name__)

SCHEMA_VERSION = "mousai.workspace.snapshot.v1"
PROJECT_TABLE_NAME = "项目与课程"
TASK_TABLE_NAME = "工作任务"
WORKBRIDGE_MODULE = Path("/opt/workagent/workbridge-api/workbridge_api.py")
WORKDATA_ENV_FILE = Path("/var/lib/workagent/workbridge/workbridge.env")
PLANNING_ROOT = Path("/var/lib/workagent/workbridge/planning")
INTAKE_ROOT = Path("/var/lib/workagent/workbridge/intake")
MAX_PROJECT_RECORDS = 5_000
MAX_TASK_RECORDS = 10_000
MAX_COLLECTION_ITEMS = 64
MAX_TEXT_LENGTH = 8_192
MAX_TITLE_LENGTH = 240
MAX_NEXT_ACTION_LENGTH = 4_096
SHANGHAI_TZ = ZoneInfo("Asia/Shanghai")

WORK_ID_RE = re.compile(r"^[A-Z][A-Z0-9-]{5,63}$")
CLIENT_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")
REVISION_RE = re.compile(r"^[0-9a-f]{64}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
FORMAL_WORK_ID_RE = re.compile(r"^WORK-(\d{8})-(\d{3})$")

TASK_TYPE_VALUES = frozenset({"教学", "科研", "行政", "创意制作"})
TASK_PRIORITY_VALUES = frozenset({"低", "普通", "高", "紧急"})
TASK_EXECUTION_ACTIVE_STATUSES = frozenset({"云端处理中", "等待本机", "已领取", "本机处理中"})
TASK_TERMINAL_STATUSES = frozenset({"已完成", "已归档"})
TASK_EDITABLE_STATUSES = frozenset({"收件箱", "已分类", "待验收", "资料缺失", "需要决策"})
TASK_COMPLETABLE_STATUSES = frozenset({"收件箱", "已分类", "待验收"})

TASK_MUTATION_FIELDS = frozenset({"title", "type", "projectRef", "priority", "deadline", "nextAction"})
TASK_CREATE_FIELDS = TASK_MUTATION_FIELDS
TASK_MUTATION_FIELD_MAP = {
    "title": "任务名称",
    "type": "类型",
    "projectRef": "所属项目",
    "priority": "优先级",
    "deadline": "DDL",
    "nextAction": "下一步",
}
TASK_REVISION_FIELDS = (
    ("workId", "WORK-ID"),
    ("title", "任务名称"),
    ("type", "类型"),
    ("projectRef", "所属项目"),
    ("status", "状态"),
    ("priority", "优先级"),
    ("deadline", "DDL"),
    ("nextAction", "下一步"),
)

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

TASK_FIELD_ALLOWLIST = frozenset(
    {
        "WORK-ID",
        "任务名称",
        "类型",
        "所属项目",
        "状态",
        "优先级",
        "DDL",
        "下一步",
        "来源",
        "产物链接",
        "需要人工验收",
        "创建时间",
        "最后更新时间",
    }
)
MANIFEST_SOURCE_FIELD = "产物清单"
DELIVERY_SOURCE_FIELD = "交付记录"
MANIFEST_FILE_ALLOWLIST = frozenset(
    {"filename", "relative_path", "extension", "size_bytes", "sha256", "modified_at"}
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
_CREATE_THREAD_LOCK = threading.Lock()


class WorkspaceAuthorityUnavailable(RuntimeError):
    """The existing server-side WorkData authority cannot be used safely."""


class WorkspaceMutationProblem(RuntimeError):
    """A bounded, user-correctable task mutation failure."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


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
    module_dir = str(WORKBRIDGE_MODULE.parent)
    inserted = module_dir not in sys.path
    if inserted:
        sys.path.insert(0, module_dir)
    try:
        spec.loader.exec_module(module)
    except Exception as exc:
        sys.modules.pop(module_name, None)
        raise WorkspaceAuthorityUnavailable("WorkBridge authority module cannot be loaded") from exc
    finally:
        if inserted:
            try:
                sys.path.remove(module_dir)
            except ValueError:
                pass
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


@lru_cache(maxsize=1)
def _planning_store():
    workbridge = _workbridge_module()
    planning_module = getattr(workbridge, "planning_store", None)
    store_type = getattr(planning_module, "PlanningStore", None)
    if store_type is None:
        raise WorkspaceAuthorityUnavailable("Planning authority is unavailable")
    return store_type(str(PLANNING_ROOT))


@lru_cache(maxsize=1)
def _intake_store():
    workbridge = _workbridge_module()
    intake_module = getattr(workbridge, "intake_store", None)
    store_type = getattr(intake_module, "IntakeStore", None)
    if store_type is None:
        raise WorkspaceAuthorityUnavailable("Intake authority is unavailable")
    return store_type(str(INTAKE_ROOT))


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


def _sanitize_task(record: Any) -> dict[str, Any] | None:
    if not isinstance(record, dict):
        return None
    fields = record.get("fields")
    if not isinstance(fields, dict):
        fields = {}
    clean_fields = {
        key: clean
        for key, value in fields.items()
        if key in TASK_FIELD_ALLOWLIST
        if (clean := _sanitize_value(value)) is not None
    }
    record_id = record.get("record_id")
    return {
        "record_id": record_id[:256] if isinstance(record_id, str) else None,
        "fields": clean_fields,
        "revision": _task_revision(record),
    }


def _text_value(value: Any) -> str | None:
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, list):
        parts = [part for item in value if (part := _text_value(item))]
        return "".join(parts) or None
    if isinstance(value, dict):
        for key in ("text", "value"):
            if key in value and (text := _text_value(value[key])):
                return text
    return None


def _sanitize_manifest(record: Any) -> dict[str, Any] | None:
    if not isinstance(record, dict) or not isinstance(record.get("fields"), dict):
        return None
    raw = _text_value(record["fields"].get(MANIFEST_SOURCE_FIELD))
    if not raw or len(raw) > MAX_TEXT_LENGTH * 8:
        return None
    try:
        manifest = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(manifest, dict):
        return None
    work_id = _text_value(manifest.get("work_id"))
    record_work_id = _text_value(record["fields"].get("WORK-ID"))
    files = manifest.get("files")
    if not work_id or work_id != record_work_id or not isinstance(files, list) or len(files) > MAX_COLLECTION_ITEMS:
        return None
    clean_files: list[dict[str, Any]] = []
    for candidate in files:
        if not isinstance(candidate, dict):
            continue
        clean = {
            key: value
            for key, value in candidate.items()
            if key in MANIFEST_FILE_ALLOWLIST
            if isinstance(value, (int, str)) and not isinstance(value, bool)
        }
        clean_files.append(clean)
    delivered_files: list[dict[str, str]] = []
    delivery_summary_sent = False
    delivery_raw = _text_value(record["fields"].get(DELIVERY_SOURCE_FIELD))
    if delivery_raw and len(delivery_raw) <= MAX_TEXT_LENGTH * 8:
        try:
            delivery = json.loads(delivery_raw)
        except (TypeError, ValueError):
            delivery = None
        if isinstance(delivery, dict):
            delivery_summary_sent = isinstance(delivery.get("summary"), dict)
            for candidate in delivery.get("files") or []:
                if not isinstance(candidate, dict):
                    continue
                relative_path = _text_value(candidate.get("relative_path"))
                sha256 = _text_value(candidate.get("sha256"))
                delivered_at = _text_value(candidate.get("delivered_at"))
                if relative_path and sha256:
                    delivered_files.append(
                        {
                            "relative_path": relative_path[:MAX_TEXT_LENGTH],
                            "sha256": sha256[:128],
                            **({"delivered_at": delivered_at[:MAX_TEXT_LENGTH]} if delivered_at else {}),
                        }
                    )
    return {
        "work_id": work_id[:256],
        "generated_at": _text_value(manifest.get("generated_at")),
        "file_count": manifest.get("file_count"),
        "total_size_bytes": manifest.get("total_size_bytes"),
        "files": clean_files,
        "task_status": _text_value(record["fields"].get("状态")),
        "delivery_summary_sent": delivery_summary_sent,
        "delivered_files": delivered_files,
    }


def _deadline_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value) / 1000, tz=SHANGHAI_TZ).date().isoformat()
        except (OverflowError, OSError, ValueError):
            return None
    text = _text_value(value)
    if not text:
        return None
    if DATE_RE.fullmatch(text):
        try:
            return date.fromisoformat(text).isoformat()
        except ValueError:
            return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=SHANGHAI_TZ)
    return parsed.astimezone(SHANGHAI_TZ).date().isoformat()


def _task_facts(record: Any) -> dict[str, Any]:
    if not isinstance(record, dict):
        return {}
    fields = record.get("fields") if isinstance(record.get("fields"), dict) else {}
    facts: dict[str, Any] = {
        "recordId": record.get("record_id") if isinstance(record.get("record_id"), str) else None,
    }
    for domain_name, field_name in TASK_REVISION_FIELDS:
        facts[domain_name] = (
            _deadline_value(fields.get(field_name))
            if field_name == "DDL"
            else _text_value(fields.get(field_name))
        )
    return facts


def _task_revision(record: Any) -> str | None:
    facts = _task_facts(record)
    if not facts.get("recordId") or not facts.get("workId"):
        return None
    canonical = json.dumps(facts, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


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


def _table_id(tables: list[dict[str, Any]], name: str) -> str:
    matches = [item for item in tables if item.get("name") == name]
    if len(matches) != 1 or not isinstance(matches[0].get("table_id"), str):
        raise WorkspaceAuthorityUnavailable(f"Required table is missing or ambiguous: {name}")
    return matches[0]["table_id"]


def _read_records(store: Any, table_id: str, *, limit: int) -> list[dict[str, Any]]:
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
        if len(records) > limit:
            raise WorkspaceAuthorityUnavailable("Workspace record limit exceeded")
        if not data.get("has_more"):
            return records
        page_token = str(data.get("page_token") or "")
        if not page_token:
            return records


def _task_table(store: Any) -> str:
    return _table_id(_list_tables(store), TASK_TABLE_NAME)


def _project_table(store: Any) -> str:
    return _table_id(_list_tables(store), PROJECT_TABLE_NAME)


def _find_task_record(store: Any, table_id: str, work_id: str) -> dict[str, Any]:
    matches = [
        record
        for record in _read_records(store, table_id, limit=MAX_TASK_RECORDS)
        if _text_value((record.get("fields") or {}).get("WORK-ID")) == work_id
    ]
    if not matches:
        raise WorkspaceMutationProblem(404, "task_not_found", "Task was not found")
    if len(matches) != 1:
        raise WorkspaceMutationProblem(409, "duplicate_work_id", "WORK-ID is not unique")
    return matches[0]


def _project_references(store: Any) -> dict[str, str]:
    references: dict[str, str] = {}
    for record in _read_records(store, _project_table(store), limit=MAX_PROJECT_RECORDS):
        fields = record.get("fields") if isinstance(record.get("fields"), dict) else {}
        project_id = _text_value(fields.get("PROJECT-ID"))
        name = _text_value(fields.get("名称"))
        if project_id and name:
            references[project_id] = name
            references[name] = name
    return references


def _update_task_record(store: Any, table_id: str, record_id: str, fields: dict[str, Any]) -> None:
    app = urllib.parse.quote(store.config.base_app_token, safe="")
    table = urllib.parse.quote(table_id, safe="")
    record = urllib.parse.quote(record_id, safe="")
    store._request_json(
        "PUT",
        f"/open-apis/bitable/v1/apps/{app}/tables/{table}/records/{record}",
        {"fields": fields},
    )


def _create_task_record(store: Any, table_id: str, fields: dict[str, Any]) -> dict[str, Any]:
    app = urllib.parse.quote(store.config.base_app_token, safe="")
    table = urllib.parse.quote(table_id, safe="")
    response = store._request_json(
        "POST",
        f"/open-apis/bitable/v1/apps/{app}/tables/{table}/records",
        {"fields": fields},
    )
    record = (response.get("data") or {}).get("record")
    if not isinstance(record, dict):
        raise WorkspaceAuthorityUnavailable("Task creation did not return a record")
    return record


def _create_lock_path() -> Path:
    home = Path(os.environ.get("HERMES_HOME", "~/.hermes")).expanduser()
    return home / "state" / "mousai-workspace" / "create.lock"


@contextmanager
def _create_lock():
    """Serialize allocation across the main and Desktop gateway processes."""

    lock_path = _create_lock_path()
    try:
        lock_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(lock_path.parent, 0o700)
        handle = lock_path.open("a+b")
        os.chmod(lock_path, 0o600)
    except OSError as exc:
        raise WorkspaceAuthorityUnavailable("Task creation lock is unavailable") from exc

    with handle, _CREATE_THREAD_LOCK:
        try:
            import fcntl
        except ImportError:  # pragma: no cover - Windows unit tests use the process lock.
            fcntl = None
        if fcntl is not None:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            if fcntl is not None:
                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def _validate_work_id(work_id: str) -> None:
    if not WORK_ID_RE.fullmatch(work_id):
        raise WorkspaceMutationProblem(400, "invalid_work_id", "WORK-ID is invalid")


def _validate_request_meta(body: Any, *, allowed: frozenset[str]) -> tuple[str, str]:
    if not isinstance(body, dict):
        raise WorkspaceMutationProblem(400, "invalid_body", "Request body must be a JSON object")
    extra = set(body) - allowed
    missing = {"clientRequestId", "expectedRevision"} - set(body)
    if extra:
        raise WorkspaceMutationProblem(400, "unknown_field", "Request contains an unsupported field")
    if missing:
        raise WorkspaceMutationProblem(400, "missing_field", "Request metadata is incomplete")
    client_request_id = body.get("clientRequestId")
    expected_revision = body.get("expectedRevision")
    if not isinstance(client_request_id, str) or not CLIENT_REQUEST_ID_RE.fullmatch(client_request_id):
        raise WorkspaceMutationProblem(400, "invalid_client_request_id", "clientRequestId is invalid")
    if not isinstance(expected_revision, str) or not REVISION_RE.fullmatch(expected_revision):
        raise WorkspaceMutationProblem(400, "invalid_expected_revision", "expectedRevision is invalid")
    return client_request_id, expected_revision


def _validate_date(value: Any, *, required: bool) -> tuple[str | None, int | None]:
    if value is None and not required:
        return None, None
    if not isinstance(value, str) or not DATE_RE.fullmatch(value):
        raise WorkspaceMutationProblem(400, "invalid_deadline", "Deadline must be an explicit YYYY-MM-DD date")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise WorkspaceMutationProblem(400, "invalid_deadline", "Deadline is invalid") from exc
    instant = datetime.combine(parsed, time.min, tzinfo=SHANGHAI_TZ)
    return parsed.isoformat(), int(instant.timestamp() * 1000)


def _validate_nullable_text(value: Any, *, field: str, maximum: int, required: bool = False) -> str | None:
    if value is None and not required:
        return None
    if not isinstance(value, str):
        raise WorkspaceMutationProblem(400, f"invalid_{field}", f"{field} must be text")
    cleaned = value.strip()
    if required and not cleaned:
        raise WorkspaceMutationProblem(400, f"invalid_{field}", f"{field} cannot be empty")
    if len(cleaned) > maximum:
        raise WorkspaceMutationProblem(400, f"invalid_{field}", f"{field} is too long")
    return cleaned or None


def _edit_mapper(store: Any, changes: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    if not isinstance(changes, dict) or not changes:
        raise WorkspaceMutationProblem(400, "empty_patch", "At least one approved task field is required")
    if set(changes) - TASK_MUTATION_FIELDS:
        raise WorkspaceMutationProblem(400, "unknown_field", "Task patch contains an unsupported field")

    workdata_fields: dict[str, Any] = {}
    desired: dict[str, Any] = {}
    for key, value in changes.items():
        if key == "title":
            desired[key] = _validate_nullable_text(value, field="title", maximum=MAX_TITLE_LENGTH, required=True)
            workdata_fields[TASK_MUTATION_FIELD_MAP[key]] = desired[key]
        elif key == "type":
            if value is not None and value not in TASK_TYPE_VALUES:
                raise WorkspaceMutationProblem(400, "invalid_type", "Task type is not allowed by WorkData")
            desired[key] = value
            workdata_fields[TASK_MUTATION_FIELD_MAP[key]] = value
        elif key == "projectRef":
            if value is None:
                desired[key] = None
                workdata_fields[TASK_MUTATION_FIELD_MAP[key]] = None
            elif not isinstance(value, str) or not value.strip():
                raise WorkspaceMutationProblem(400, "invalid_project_ref", "Project reference is invalid")
            else:
                project = _project_references(store).get(value.strip())
                if not project:
                    raise WorkspaceMutationProblem(400, "invalid_project_ref", "Project reference was not found")
                desired[key] = project
                workdata_fields[TASK_MUTATION_FIELD_MAP[key]] = project
        elif key == "priority":
            if value is not None and value not in TASK_PRIORITY_VALUES:
                raise WorkspaceMutationProblem(400, "invalid_priority", "Task priority is invalid")
            desired[key] = value
            workdata_fields[TASK_MUTATION_FIELD_MAP[key]] = value
        elif key == "deadline":
            desired[key], workdata_fields[TASK_MUTATION_FIELD_MAP[key]] = _validate_date(value, required=False)
        elif key == "nextAction":
            desired[key] = _validate_nullable_text(value, field="next_action", maximum=MAX_NEXT_ACTION_LENGTH)
            workdata_fields[TASK_MUTATION_FIELD_MAP[key]] = desired[key]
    return workdata_fields, desired


def _validate_create_body(store: Any, body: Any) -> tuple[str, dict[str, Any], dict[str, Any]]:
    if not isinstance(body, dict):
        raise WorkspaceMutationProblem(400, "invalid_body", "Request body must be a JSON object")
    allowed = frozenset({"clientRequestId", "task"})
    if set(body) - allowed:
        raise WorkspaceMutationProblem(400, "unknown_field", "Request contains an unsupported field")
    if set(body) != allowed:
        raise WorkspaceMutationProblem(400, "missing_field", "Task creation request is incomplete")
    client_request_id = body.get("clientRequestId")
    if not isinstance(client_request_id, str) or not CLIENT_REQUEST_ID_RE.fullmatch(client_request_id):
        raise WorkspaceMutationProblem(400, "invalid_client_request_id", "clientRequestId is invalid")
    task = body.get("task")
    if not isinstance(task, dict) or set(task) - TASK_CREATE_FIELDS or "title" not in task:
        raise WorkspaceMutationProblem(400, "invalid_create_fields", "Task creation fields are invalid")
    workdata_fields, desired = _edit_mapper(store, task)
    return client_request_id, workdata_fields, desired


def _create_source_prefix(client_request_id: str) -> str:
    return f"Mousai Workspace create:{client_request_id}:"


def _create_source(client_request_id: str, desired: dict[str, Any]) -> str:
    fingerprint = hashlib.sha256(
        json.dumps(desired, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return _create_source_prefix(client_request_id) + fingerprint


def _create_desired_matches(record: dict[str, Any], desired: dict[str, Any], source: str) -> bool:
    fields = record.get("fields") if isinstance(record.get("fields"), dict) else {}
    return (
        _desired_matches(record, {**desired, "status": "收件箱"})
        and _text_value(fields.get("来源")) == source
        and fields.get("需要人工验收") is True
    )


def _allocate_work_id(records: list[dict[str, Any]], *, today: datetime | None = None) -> str:
    stamp = (today or datetime.now(SHANGHAI_TZ)).astimezone(SHANGHAI_TZ).strftime("%Y%m%d")
    sequences = []
    for record in records:
        fields = record.get("fields") if isinstance(record.get("fields"), dict) else {}
        work_id = _text_value(fields.get("WORK-ID"))
        match = FORMAL_WORK_ID_RE.fullmatch(work_id or "")
        if match and match.group(1) == stamp:
            sequences.append(int(match.group(2)))
    sequence = max(sequences, default=0) + 1
    if sequence > 999:
        raise WorkspaceMutationProblem(409, "work_id_sequence_exhausted", "Daily WORK-ID sequence is exhausted")
    return f"WORK-{stamp}-{sequence:03d}"


def _records_by_source(records: list[dict[str, Any]], source: str, *, prefix: bool = False) -> list[dict[str, Any]]:
    return [
        record
        for record in records
        if (
            (_text_value((record.get("fields") or {}).get("来源")) or "").startswith(source)
            if prefix
            else _text_value((record.get("fields") or {}).get("来源")) == source
        )
    ]


def create_task(body: Any) -> dict[str, Any]:
    store = _authority_store()
    client_request_id, workdata_fields, desired = _validate_create_body(store, body)
    source_prefix = _create_source_prefix(client_request_id)
    source = _create_source(client_request_id, desired)
    table_id = _task_table(store)

    with _create_lock():
        records = _read_records(store, table_id, limit=MAX_TASK_RECORDS)
        existing = _records_by_source(records, source_prefix, prefix=True)
        if len(existing) > 1:
            raise WorkspaceMutationProblem(409, "duplicate_client_request", "clientRequestId is not unique")
        if existing:
            record = existing[0]
            if _text_value((record.get("fields") or {}).get("来源")) != source or not _create_desired_matches(
                record, desired, source
            ):
                raise WorkspaceMutationProblem(409, "client_request_reused", "clientRequestId was used for another task")
            work_id = _text_value((record.get("fields") or {}).get("WORK-ID"))
            if not work_id:
                raise WorkspaceAuthorityUnavailable("Created task has no WORK-ID")
            return _mutation_result(
                work_id=work_id,
                action="create",
                idempotent=True,
                record=record,
                changed={**desired, "status": "收件箱"},
            )

        work_id = _allocate_work_id(records)
        fields = {
            "WORK-ID": work_id,
            **workdata_fields,
            "状态": "收件箱",
            "来源": source,
            "需要人工验收": True,
        }
        _create_task_record(store, table_id, fields)

        authoritative = _read_records(store, table_id, limit=MAX_TASK_RECORDS)
        by_work_id = [
            record
            for record in authoritative
            if _text_value((record.get("fields") or {}).get("WORK-ID")) == work_id
        ]
        by_source = _records_by_source(authoritative, source)
        if len(by_work_id) != 1 or len(by_source) != 1 or by_work_id[0].get("record_id") != by_source[0].get("record_id"):
            raise WorkspaceMutationProblem(409, "create_uniqueness_failed", "Created task is not authoritative and unique")
        record = by_work_id[0]
        if not _create_desired_matches(record, desired, source):
            raise WorkspaceAuthorityUnavailable("Created task could not be verified")
        return _mutation_result(
            work_id=work_id,
            action="create",
            idempotent=False,
            record=record,
            changed={**desired, "status": "收件箱"},
        )


def _desired_matches(record: dict[str, Any], desired: dict[str, Any]) -> bool:
    facts = _task_facts(record)
    return all(facts.get(key) == value for key, value in desired.items())


def _assert_state(record: dict[str, Any], action: str) -> None:
    status = _task_facts(record).get("status")
    if action == "complete" and status == "已完成":
        return
    if status in TASK_EXECUTION_ACTIVE_STATUSES:
        raise WorkspaceMutationProblem(409, "execution_active", "Task is controlled by active WorkBridge execution")
    if status in TASK_TERMINAL_STATUSES:
        raise WorkspaceMutationProblem(409, "terminal_task", "Terminal task cannot be changed")
    allowed = TASK_COMPLETABLE_STATUSES if action == "complete" else TASK_EDITABLE_STATUSES
    if status not in allowed:
        raise WorkspaceMutationProblem(409, "invalid_state", "Task state does not allow this action")


def _mutation_result(
    *, work_id: str, action: str, idempotent: bool, record: dict[str, Any], changed: dict[str, Any]
) -> dict[str, Any]:
    revision = _task_revision(record)
    if not revision:
        raise WorkspaceAuthorityUnavailable("Task revision is unavailable")
    return {
        "workId": work_id,
        "action": action,
        "success": True,
        "idempotent": idempotent,
        "newRevision": revision,
        "changed": changed,
    }


def mutate_task(work_id: str, action: str, body: Any) -> dict[str, Any]:
    _validate_work_id(work_id)
    action_fields = {
        "edit": frozenset({"clientRequestId", "expectedRevision", "changes"}),
        "defer": frozenset({"clientRequestId", "expectedRevision", "deadline"}),
        "complete": frozenset({"clientRequestId", "expectedRevision"}),
    }
    allowed = action_fields.get(action)
    if allowed is None:
        raise WorkspaceMutationProblem(404, "unknown_action", "Task action is unsupported")
    _, expected_revision = _validate_request_meta(body, allowed=allowed)
    store = _authority_store()
    table_id = _task_table(store)

    with store._write_lock:
        record = _find_task_record(store, table_id, work_id)
        _assert_state(record, action)
        current_revision = _task_revision(record)
        if not current_revision:
            raise WorkspaceAuthorityUnavailable("Task revision is unavailable")

        if action == "edit":
            workdata_fields, desired = _edit_mapper(store, body.get("changes"))
        elif action == "defer":
            desired_deadline, workdata_deadline = _validate_date(body.get("deadline"), required=True)
            workdata_fields = {"DDL": workdata_deadline}
            desired = {"deadline": desired_deadline}
        else:
            workdata_fields = {"状态": "已完成"}
            desired = {"status": "已完成"}

        if _desired_matches(record, desired):
            return _mutation_result(
                work_id=work_id,
                action=action,
                idempotent=True,
                record=record,
                changed=desired,
            )
        if current_revision != expected_revision:
            raise WorkspaceMutationProblem(409, "revision_conflict", "Task changed since it was read")

        record_id = record.get("record_id")
        if not isinstance(record_id, str) or not record_id:
            raise WorkspaceAuthorityUnavailable("Task record identity is unavailable")
        _update_task_record(store, table_id, record_id, workdata_fields)
        updated = _find_task_record(store, table_id, work_id)
        if not _desired_matches(updated, desired):
            raise WorkspaceAuthorityUnavailable("Task mutation could not be verified")
        return _mutation_result(
            work_id=work_id,
            action=action,
            idempotent=False,
            record=updated,
            changed=desired,
        )


def build_workspace_snapshot() -> dict[str, Any]:
    store = _authority_store()
    tables = _list_tables(store)
    project_table_id = _table_id(tables, PROJECT_TABLE_NAME)
    task_table_id = _table_id(tables, TASK_TABLE_NAME)
    project_records = _read_records(store, project_table_id, limit=MAX_PROJECT_RECORDS)
    task_records = _read_records(store, task_table_id, limit=MAX_TASK_RECORDS)
    projects = [
        sanitized
        for record in project_records
        if (sanitized := _sanitize_project(record)) is not None
    ]
    tasks = [sanitized for record in task_records if (sanitized := _sanitize_task(record)) is not None]
    manifests = [sanitized for record in task_records if (sanitized := _sanitize_manifest(record)) is not None]
    planning = _planning_store().snapshot()
    durations = planning.pop("estimatedDurations", {})
    for task in tasks:
        work_id = _text_value((task.get("fields") or {}).get("WORK-ID"))
        duration = durations.get(work_id) if work_id else None
        if isinstance(duration, int) and 1 <= duration <= 720:
            task["estimated_duration_minutes"] = duration
    intake = _intake_store().snapshot(task_records)
    identities = intake.pop("sourceIdentities", {})
    intake_module = getattr(_workbridge_module(), "intake_store", None)
    revision_fn = getattr(intake_module, "task_revision", None)
    if not callable(revision_fn):
        raise WorkspaceAuthorityUnavailable("Intake task revision is unavailable")
    records_by_work_id = {
        work_id: record
        for record in task_records
        if (work_id := _text_value((record.get("fields") or {}).get("WORK-ID")))
    }
    for task in tasks:
        work_id = _text_value((task.get("fields") or {}).get("WORK-ID"))
        raw_record = records_by_work_id.get(work_id)
        task["sourceIdentity"] = identities.get(work_id)
        task["intake_revision"] = revision_fn(raw_record) if raw_record else None
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "projects": projects,
        "tasks": tasks,
        "events": [],
        "deliverables": manifests,
        **planning,
        **intake,
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


def _planning_task_lookup(work_id: str) -> dict[str, Any]:
    store = _authority_store()
    return _find_task_record(store, _task_table(store), work_id)


def _run_planning(action: str, body: dict[str, Any], proposal_id: str | None = None) -> dict[str, Any]:
    try:
        store = _planning_store()
        now = datetime.now(SHANGHAI_TZ).isoformat()
        result = (
            store.register(body, task_lookup=_planning_task_lookup, now=now)
            if action == "register"
            else store.mutate(proposal_id, action, body, task_lookup=_planning_task_lookup, now=now)
        )
        return {"planning": result}
    except WorkspaceAuthorityUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "workspace_authority_unavailable", "message": "Planning authority is unavailable"},
        ) from exc
    except Exception as exc:
        workbridge = _workbridge_module()
        problem_type = getattr(getattr(workbridge, "planning_store", None), "PlanningProblem", None)
        if problem_type is not None and isinstance(exc, problem_type):
            raise HTTPException(
                status_code=exc.status,
                detail={"code": exc.code, "message": exc.message},
            ) from exc
        log.warning("workspace planning mutation failed action=%s type=%s", action, type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail={"code": "planning_mutation_failed", "message": "Planning update failed"},
        ) from exc


@router.post("/planning/proposals")
def register_planning_proposal(body: dict[str, Any]):
    return _run_planning("register", body)


@router.post("/planning/proposals/{proposal_id}/{action}")
def mutate_planning_proposal(proposal_id: str, action: str, body: dict[str, Any]):
    if action not in {"accept", "adjust", "ignore"}:
        raise HTTPException(
            status_code=404,
            detail={"code": "planning_action_missing", "message": "Planning action was not found"},
        )
    return _run_planning(action, body, proposal_id)


def _intake_task_lookup(work_id: str) -> dict[str, Any]:
    store = _authority_store()
    return _find_task_record(store, _task_table(store), work_id)


def _run_intake(action: str, body: dict[str, Any]) -> dict[str, Any]:
    try:
        store = _intake_store()
        now = datetime.now(SHANGHAI_TZ).isoformat()
        if action == "review":
            result = store.review_duplicate(body, task_lookup=_intake_task_lookup, now=now)
        elif action == "merge":
            result = store.merge(
                body,
                task_lookup=_intake_task_lookup,
                archive=_authority_store().archive_task,
                now=now,
            )
        elif action == "scope":
            result = store.set_scope(body, now=now)
        else:
            raise HTTPException(status_code=404, detail={"code": "intake_action_missing", "message": "Intake action was not found"})
        return {"intake": result}
    except WorkspaceAuthorityUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "workspace_authority_unavailable", "message": "Intake authority is unavailable"},
        ) from exc
    except HTTPException:
        raise
    except Exception as exc:
        workbridge = _workbridge_module()
        problem_type = getattr(getattr(workbridge, "intake_store", None), "IntakeProblem", None)
        if problem_type is not None and isinstance(exc, problem_type):
            raise HTTPException(status_code=exc.status, detail={"code": exc.code, "message": exc.message}) from exc
        log.warning("workspace intake mutation failed action=%s type=%s", action, type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail={"code": "intake_mutation_failed", "message": "Intake update failed"},
        ) from exc


@router.post("/intake/duplicates/review")
def review_intake_duplicate(body: dict[str, Any]):
    return _run_intake("review", body)


@router.post("/intake/merge")
def merge_intake_tasks(body: dict[str, Any]):
    return _run_intake("merge", body)


@router.post("/intake/scopes")
def set_intake_scope(body: dict[str, Any]):
    return _run_intake("scope", body)


def _run_mutation(work_id: str, action: str, body: Any) -> dict[str, Any]:
    try:
        return mutate_task(work_id, action, body)
    except WorkspaceMutationProblem as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc


def _run_triage(work_id: str, action: str, body: Any) -> dict[str, Any]:
    allowed = (
        frozenset({"clientRequestId", "expectedRevision"})
        if action == "archive"
        else frozenset({"clientRequestId", "expectedRevision", "flag", "note"})
    )
    try:
        _validate_work_id(work_id)
        _validate_request_meta(body, allowed=allowed)
        store = _authority_store()
        table_id = _task_table(store)
        with store._write_lock:
            record = _find_task_record(store, table_id, work_id)
            current_revision = _task_revision(record)
            expected_revision = body["expectedRevision"]
            facts = _task_facts(record)
            if action == "archive":
                already_applied = facts.get("status") == "已归档"
            else:
                flag = body.get("flag")
                note = _validate_nullable_text(
                    body.get("note"), field="note", maximum=MAX_NEXT_ACTION_LENGTH, required=True
                )
                if note is None:
                    raise WorkspaceMutationProblem(400, "invalid_note", "note is required")
                expected_status = {"material_missing": "资料缺失", "decision_required": "需要决策"}.get(flag)
                if expected_status is None:
                    raise WorkspaceMutationProblem(400, "invalid_flag", "Flag is invalid")
                already_applied = facts.get("status") == expected_status and facts.get("nextAction") == note
            if not already_applied and current_revision != expected_revision:
                raise WorkspaceMutationProblem(409, "revision_conflict", "Task changed since it was read")
            if already_applied:
                updated = record
            elif action == "archive":
                updated = store.archive_task(work_id)
            else:
                updated = store.flag_task(work_id, body["flag"], note)
        sanitized = _sanitize_task(updated)
        if sanitized is None:
            raise WorkspaceAuthorityUnavailable("Triage result is unavailable")
        return {"task": sanitized, "idempotent": already_applied}
    except WorkspaceMutationProblem as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code, "message": exc.message}) from exc
    except WorkspaceAuthorityUnavailable as exc:
        raise HTTPException(
            status_code=503,
            detail={"code": "workspace_authority_unavailable", "message": "Workspace data is unavailable"},
        ) from exc
    except Exception as exc:
        problem_type = getattr(_workbridge_module(), "ApiProblem", None)
        if problem_type is not None and isinstance(exc, problem_type):
            raise HTTPException(status_code=exc.status, detail={"code": exc.code, "message": exc.message}) from exc
        log.warning("workspace triage failed action=%s type=%s", action, type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail={"code": "workspace_triage_failed", "message": "Workspace triage failed"},
        ) from exc


@router.post("/tasks")
def post_task(body: dict[str, Any]):
    try:
        return create_task(body)
    except WorkspaceMutationProblem as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    except WorkspaceAuthorityUnavailable as exc:
        log.warning("workspace create authority unavailable type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail={"code": "workspace_authority_unavailable", "message": "Workspace data is unavailable"},
        ) from exc
    except Exception as exc:
        log.warning("workspace create failed type=%s", type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail={"code": "workspace_create_failed", "message": "Workspace task creation failed"},
        ) from exc


@router.patch("/tasks/{work_id}")
def patch_task(work_id: str, body: dict[str, Any]):
    return _run_mutation(work_id, "edit", body)


@router.post("/tasks/{work_id}/defer")
def defer_task(work_id: str, body: dict[str, Any]):
    return _run_mutation(work_id, "defer", body)


@router.post("/tasks/{work_id}/complete")
def complete_task(work_id: str, body: dict[str, Any]):
    return _run_mutation(work_id, "complete", body)


@router.post("/tasks/{work_id}/archive")
def archive_task(work_id: str, body: dict[str, Any]):
    return _run_triage(work_id, "archive", body)


@router.post("/tasks/{work_id}/flag")
def flag_task(work_id: str, body: dict[str, Any]):
    return _run_triage(work_id, "flag", body)
