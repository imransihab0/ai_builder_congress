import json
import math
import re
from datetime import datetime

import httpx

from . import config


class DashboardStoreError(RuntimeError):
    pass


class DashboardConfigError(DashboardStoreError):
    pass


class DashboardNotFoundError(DashboardStoreError):
    pass


_SESSION_ID = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
_TASK_ID = re.compile(r"^task-([0-9]+)$")
_STATE_KEYS = {"farm", "crops", "plots", "tasks"}
_TASK_FIELDS = {"title", "plotId", "status", "dueAt", "createdBy"}
_TASK_STATUSES = {"waiting", "progress", "complete"}
_TASK_CREATORS = {"farmer", "agent"}
_GROWTH_STAGES = {"seedling", "vegetative", "flowering", "fruiting", "harvest"}
_ISSUE_KINDS = {
    "low_n",
    "low_p",
    "low_k",
    "water_stress",
    "pest_risk",
    "flood_risk",
    "disease_risk",
}
_MAX_STATE_CHARS = 5_000_000
_MAX_ITEMS = 10_000
_MAX_POINTS = 10_000
_MAX_SAFE_INTEGER = 2**53 - 1


def _convex_call(operation: str, path: str, args: dict):
    if not config.CONVEX_URL or not config.CONVEX_DEPLOY_KEY:
        raise DashboardConfigError("Dashboard storage is not configured")

    try:
        response = httpx.post(
            f"{config.CONVEX_URL}/api/{operation}",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": f"Convex {config.CONVEX_DEPLOY_KEY}",
            },
            json={"path": path, "args": args, "format": "json"},
            timeout=15.0,
        )
        response.raise_for_status()
    except (httpx.HTTPError, TypeError, ValueError):
        raise DashboardStoreError("Dashboard storage request failed") from None

    try:
        payload = response.json()
    except (TypeError, ValueError):
        raise DashboardStoreError(
            "Dashboard storage returned an invalid response"
        ) from None
    if (
        not isinstance(payload, dict)
        or payload.get("status") != "success"
        or "value" not in payload
    ):
        raise DashboardStoreError("Dashboard storage request failed")
    return payload["value"]


def _validate_session_id(session_id: str):
    if not isinstance(session_id, str) or not _SESSION_ID.fullmatch(session_id):
        raise ValueError("session_id must match [A-Za-z0-9_-]{1,128}")


def _encode_json(value) -> str:
    try:
        encoded = json.dumps(
            value, ensure_ascii=False, allow_nan=False, separators=(",", ":")
        )
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("dashboard data must be valid JSON") from exc
    if len(encoded) > _MAX_STATE_CHARS:
        raise ValueError("dashboard data is too large")
    return encoded


def _json_clone(value):
    return json.loads(_encode_json(value))


def _object(value, path: str) -> dict:
    if not isinstance(value, dict):
        raise ValueError(f"{path} must be an object")
    return value


def _array(value, path: str, limit: int = _MAX_ITEMS) -> list:
    if not isinstance(value, list):
        raise ValueError(f"{path} must be an array")
    if len(value) > limit:
        raise ValueError(f"{path} has too many items")
    return value


def _text(value, path: str, max_length: int = 500) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{path} must be a non-empty string")
    if len(value) > max_length:
        raise ValueError(f"{path} is too long")
    return value


def _id(value, path: str) -> str:
    return _text(value, path, 128)


def _number(
    value, path: str, *, minimum: float | None = None, maximum: float | None = None
):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{path} must be a finite number")
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError(f"{path} must be a finite number")
    if minimum is not None and value < minimum:
        raise ValueError(f"{path} must be at least {minimum}")
    if maximum is not None and value > maximum:
        raise ValueError(f"{path} must be at most {maximum}")
    return value


def _bilingual(value, path: str):
    value = _object(value, path)
    _text(value.get("bn"), f"{path}.bn")
    _text(value.get("en"), f"{path}.en")


def _iso_timestamp(value, path: str):
    value = _text(value, path, 64)
    if "T" not in value:
        raise ValueError(f"{path} must be an ISO timestamp")
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise ValueError(f"{path} must be an ISO timestamp") from exc


def _range(value, path: str):
    value = _array(value, path, 2)
    if len(value) != 2:
        raise ValueError(f"{path} must contain two numbers")
    low = _number(value[0], f"{path}[0]", minimum=0, maximum=1_000_000)
    high = _number(value[1], f"{path}[1]", minimum=0, maximum=1_000_000)
    if low > high:
        raise ValueError(f"{path} minimum cannot exceed maximum")


def _polygon(value, path: str):
    value = _object(value, path)
    if value.get("type") != "Polygon":
        raise ValueError(f"{path}.type must be Polygon")
    rings = _array(value.get("coordinates"), f"{path}.coordinates", 100)
    if not rings:
        raise ValueError(f"{path}.coordinates must contain a ring")

    point_count = 0
    for ring_index, ring in enumerate(rings):
        ring_path = f"{path}.coordinates[{ring_index}]"
        ring = _array(ring, ring_path, _MAX_POINTS)
        point_count += len(ring)
        if point_count > _MAX_POINTS or len(ring) < 4:
            raise ValueError(f"{ring_path} must be a bounded closed ring")

        positions = []
        for point_index, point in enumerate(ring):
            point_path = f"{ring_path}[{point_index}]"
            point = _array(point, point_path, 3)
            if len(point) not in (2, 3):
                raise ValueError(f"{point_path} must be a GeoJSON position")
            lng = _number(point[0], f"{point_path}[0]", minimum=-180, maximum=180)
            lat = _number(point[1], f"{point_path}[1]", minimum=-90, maximum=90)
            if len(point) == 3:
                _number(point[2], f"{point_path}[2]")
            positions.append((lng, lat, *point[2:]))
        if positions[0] != positions[-1]:
            raise ValueError(f"{ring_path} must be closed")
        if len(set(positions[:-1])) < 3:
            raise ValueError(f"{ring_path} must contain three distinct points")


def _validate_crop(crop, path: str):
    crop = _object(crop, path)
    crop_id = _id(crop.get("id"), f"{path}.id")
    _bilingual(crop.get("name"), f"{path}.name")
    _text(crop.get("model"), f"{path}.model", 128)
    _text(crop.get("color"), f"{path}.color", 128)
    for field in ("nTarget", "pTarget", "kTarget"):
        _number(crop.get(field), f"{path}.{field}", minimum=0, maximum=1_000_000)
    moisture_min = _number(
        crop.get("moistureMin"), f"{path}.moistureMin", minimum=0, maximum=100
    )
    moisture_max = _number(
        crop.get("moistureMax"), f"{path}.moistureMax", minimum=0, maximum=100
    )
    if moisture_min > moisture_max:
        raise ValueError(f"{path} moisture minimum cannot exceed maximum")
    _number(
        crop.get("daysToHarvest"),
        f"{path}.daysToHarvest",
        minimum=1,
        maximum=100_000,
    )
    if "soilTargets" in crop:
        targets = _object(crop["soilTargets"], f"{path}.soilTargets")
        for nutrient in ("n", "p", "k"):
            _range(targets.get(nutrient), f"{path}.soilTargets.{nutrient}")
    return crop_id


def _validate_plot(plot, path: str, crop_ids: set[str], issue_ids: set[str]):
    plot = _object(plot, path)
    plot_id = _id(plot.get("id"), f"{path}.id")
    _bilingual(plot.get("name"), f"{path}.name")
    _polygon(plot.get("polygon"), f"{path}.polygon")

    crop_id = _id(plot.get("cropId"), f"{path}.cropId")
    if crop_id not in crop_ids:
        raise ValueError(f"{path}.cropId references an unknown crop")
    _number(plot.get("areaM2"), f"{path}.areaM2", minimum=0.000001, maximum=1e12)
    _number(plot.get("plantCount"), f"{path}.plantCount", minimum=0, maximum=1e12)

    soil = _object(plot.get("soil"), f"{path}.soil")
    for field in ("n", "p", "k"):
        _number(soil.get(field), f"{path}.soil.{field}", minimum=0, maximum=1_000_000)
    _number(soil.get("ph"), f"{path}.soil.ph", minimum=0, maximum=14)
    _number(soil.get("moisture"), f"{path}.soil.moisture", minimum=0, maximum=100)
    _iso_timestamp(soil.get("updatedAt"), f"{path}.soil.updatedAt")

    if not isinstance(plot.get("growthStage"), str) or plot["growthStage"] not in _GROWTH_STAGES:
        raise ValueError(f"{path}.growthStage is unsupported")
    _iso_timestamp(plot.get("plantedAt"), f"{path}.plantedAt")

    for issue_index, issue in enumerate(_array(plot.get("issues"), f"{path}.issues", 100)):
        issue_path = f"{path}.issues[{issue_index}]"
        issue = _object(issue, issue_path)
        issue_id = _id(issue.get("id"), f"{issue_path}.id")
        if issue_id in issue_ids:
            raise ValueError(f"duplicate issue id: {issue_id}")
        issue_ids.add(issue_id)
        if not isinstance(issue.get("kind"), str) or issue["kind"] not in _ISSUE_KINDS:
            raise ValueError(f"{issue_path}.kind is unsupported")
        if type(issue.get("severity")) is not int or issue["severity"] not in (1, 2, 3):
            raise ValueError(f"{issue_path}.severity must be 1, 2, or 3")
    return plot_id


def _validate_task(task, path: str, plot_ids: set[str]):
    task = _object(task, path)
    task_id = _id(task.get("id"), f"{path}.id")
    _bilingual(task.get("title"), f"{path}.title")
    if not isinstance(task.get("status"), str) or task["status"] not in _TASK_STATUSES:
        raise ValueError(f"{path}.status is unsupported")
    if not isinstance(task.get("createdBy"), str) or task["createdBy"] not in _TASK_CREATORS:
        raise ValueError(f"{path}.createdBy is unsupported")
    if "plotId" in task:
        plot_id = _id(task["plotId"], f"{path}.plotId")
        if plot_id not in plot_ids:
            raise ValueError(f"{path}.plotId references an unknown plot")
    if "dueAt" in task:
        _iso_timestamp(task["dueAt"], f"{path}.dueAt")
    return task_id


def _validate_state(state):
    state = _object(state, "state")
    if set(state) != _STATE_KEYS:
        raise ValueError("state must contain exactly farm, crops, plots, and tasks")

    farm = _object(state["farm"], "state.farm")
    _id(farm.get("id"), "state.farm.id")
    _bilingual(farm.get("name"), "state.farm.name")
    center = _array(farm.get("center"), "state.farm.center", 2)
    if len(center) != 2:
        raise ValueError("state.farm.center must be [lng, lat]")
    _number(center[0], "state.farm.center[0]", minimum=-180, maximum=180)
    _number(center[1], "state.farm.center[1]", minimum=-90, maximum=90)
    _text(farm.get("timezone"), "state.farm.timezone", 128)

    crop_ids = set()
    for index, crop in enumerate(_array(state["crops"], "state.crops")):
        crop_id = _validate_crop(crop, f"state.crops[{index}]")
        if crop_id in crop_ids:
            raise ValueError(f"duplicate crop id: {crop_id}")
        crop_ids.add(crop_id)

    plot_ids = set()
    issue_ids = set()
    for index, plot in enumerate(_array(state["plots"], "state.plots")):
        plot_id = _validate_plot(plot, f"state.plots[{index}]", crop_ids, issue_ids)
        if plot_id in plot_ids:
            raise ValueError(f"duplicate plot id: {plot_id}")
        plot_ids.add(plot_id)

    task_ids = set()
    for index, task in enumerate(_array(state["tasks"], "state.tasks")):
        task_id = _validate_task(task, f"state.tasks[{index}]", plot_ids)
        if task_id in task_ids:
            raise ValueError(f"duplicate task id: {task_id}")
        task_ids.add(task_id)


def _next_task_number(tasks: list[dict]) -> int:
    highest = 0
    for task in tasks:
        match = _TASK_ID.fullmatch(task["id"])
        if match:
            highest = max(highest, int(match.group(1)))
    if highest >= _MAX_SAFE_INTEGER - 1:
        raise ValueError("task id counter is exhausted")
    return highest + 1


def _state_from_convex(value) -> dict:
    if value is None:
        raise DashboardNotFoundError("Dashboard state not found")
    try:
        state = _json_clone(value)
        _validate_state(state)
    except ValueError:
        raise DashboardStoreError(
            "Dashboard storage returned invalid dashboard data"
        ) from None
    return state


def _task_from_convex(value, plot_ids: set[str]) -> dict:
    if value is None:
        raise DashboardNotFoundError("Dashboard state or task not found")
    try:
        task = _json_clone(value)
        _validate_task(task, "task", plot_ids)
    except ValueError:
        raise DashboardStoreError(
            "Dashboard storage returned invalid dashboard data"
        ) from None
    return task


def _get_state(session_id: str) -> dict:
    return _state_from_convex(
        _convex_call("query", "dashboard:getState", {"sessionId": session_id})
    )


def bootstrap_dashboard(session_id: str, seed_state) -> dict:
    _validate_session_id(session_id)
    state = _json_clone(seed_state)
    _validate_state(state)
    next_task_id = _next_task_number(state["tasks"])
    return _state_from_convex(
        _convex_call(
            "mutation",
            "dashboard:bootstrap",
            {"sessionId": session_id, "state": state, "nextTaskId": next_task_id},
        )
    )


def get_dashboard(session_id: str) -> dict:
    _validate_session_id(session_id)
    return _get_state(session_id)


def create_dashboard_task(session_id: str, task_input) -> dict:
    _validate_session_id(session_id)
    task_input = _object(_json_clone(task_input), "task")
    unknown = set(task_input) - _TASK_FIELDS
    if unknown:
        raise ValueError(f"unknown task fields: {', '.join(sorted(unknown))}")
    for field in ("title", "status", "createdBy"):
        if field not in task_input:
            raise ValueError(f"task.{field} is required")
    for field in ("plotId", "dueAt"):
        if task_input.get(field) is None:
            task_input.pop(field, None)

    state = _get_state(session_id)
    plot_ids = {plot["id"] for plot in state["plots"]}
    _validate_task({"id": "task-0", **task_input}, "task", plot_ids)
    return _task_from_convex(
        _convex_call(
            "mutation",
            "dashboard:createTask",
            {"sessionId": session_id, "taskInput": task_input},
        ),
        plot_ids,
    )


def update_dashboard_task(session_id: str, task_id: str, patch) -> dict:
    _validate_session_id(session_id)
    task_id = _id(task_id, "task_id")
    patch = _object(_json_clone(patch), "patch")
    if "id" in patch:
        raise ValueError("task id cannot be changed")
    unknown = set(patch) - _TASK_FIELDS
    if unknown:
        raise ValueError(f"unknown task fields: {', '.join(sorted(unknown))}")

    state = _get_state(session_id)
    current = next((task for task in state["tasks"] if task["id"] == task_id), None)
    if current is None:
        raise DashboardNotFoundError("Dashboard task not found")
    updated = {**current, **patch, "id": task_id}
    for field in ("plotId", "dueAt"):
        if updated.get(field) is None:
            updated.pop(field, None)
    plot_ids = {plot["id"] for plot in state["plots"]}
    _validate_task(updated, "task", plot_ids)

    returned = _task_from_convex(
        _convex_call(
            "mutation",
            "dashboard:updateTask",
            {"sessionId": session_id, "taskId": task_id, "patch": patch},
        ),
        plot_ids,
    )
    if returned["id"] != task_id:
        raise DashboardStoreError("Dashboard storage returned invalid dashboard data")
    return returned


def delete_dashboard(session_id: str) -> None:
    _validate_session_id(session_id)
    _convex_call("mutation", "dashboard:deleteState", {"sessionId": session_id})
