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
import urllib.parse
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

TASK_TYPE_VALUES = frozenset({"教学", "科研", "行政", "创意制作"})
TASK_PRIORITY_VALUES = frozenset({"低", "普通", "高", "紧急"})
TASK_EXECUTION_ACTIVE_STATUSES = frozenset({"云端处理中", "等待本机", "已领取", "本机处理中"})
TASK_TERMINAL_STATUSES = frozenset({"已完成", "已归档"})
TASK_EDITABLE_STATUSES = frozenset({"收件箱", "已分类", "待验收", "资料缺失", "需要决策"})
TASK_COMPLETABLE_STATUSES = frozenset({"收件箱", "已分类", "待验收"})

TASK_MUTATION_FIELDS = frozenset({"title", "type", "projectRef", "priority", "deadline", "nextAction"})
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
    return {
        "work_id": work_id[:256],
        "generated_at": _text_value(manifest.get("generated_at")),
        "file_count": manifest.get("file_count"),
        "total_size_bytes": manifest.get("total_size_bytes"),
        "files": clean_files,
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
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "projects": projects,
        "tasks": tasks,
        "events": [],
        "deliverables": manifests,
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


def _run_mutation(work_id: str, action: str, body: Any) -> dict[str, Any]:
    try:
        return mutate_task(work_id, action, body)
    except WorkspaceMutationProblem as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"code": exc.code, "message": exc.message},
        ) from exc
    except WorkspaceAuthorityUnavailable as exc:
        log.warning("workspace mutation authority unavailable action=%s type=%s", action, type(exc).__name__)
        raise HTTPException(
            status_code=503,
            detail={"code": "workspace_authority_unavailable", "message": "Workspace data is unavailable"},
        ) from exc
    except Exception as exc:
        log.warning("workspace mutation failed action=%s type=%s", action, type(exc).__name__)
        raise HTTPException(
            status_code=502,
            detail={"code": "workspace_mutation_failed", "message": "Workspace task update failed"},
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
