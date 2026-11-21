from collections import Counter
from copy import deepcopy
import sqlite3

import httpx
import pytest

from app import dashboard_store, db


class FakeConvex:
    _OPERATIONS = {
        "dashboard:getState": "query",
        "dashboard:bootstrap": "mutation",
        "dashboard:createTask": "mutation",
        "dashboard:updateTask": "mutation",
        "dashboard:deleteState": "mutation",
    }

    def __init__(self):
        self.states = {}
        self.next_task_ids = {}
        self.calls = Counter()

    def __call__(self, operation, path, args):
        assert operation == self._OPERATIONS[path]
        self.calls[path] += 1
        session_id = args["sessionId"]

        if path == "dashboard:getState":
            return deepcopy(self.states.get(session_id))

        if path == "dashboard:bootstrap":
            if session_id not in self.states:
                self.states[session_id] = deepcopy(args["state"])
                self.next_task_ids[session_id] = args["nextTaskId"]
            return deepcopy(self.states[session_id])

        if path == "dashboard:createTask":
            state = self.states.get(session_id)
            if state is None:
                return None
            task = {
                "id": f"task-{self.next_task_ids[session_id]}",
                **deepcopy(args["taskInput"]),
            }
            state["tasks"].append(task)
            self.next_task_ids[session_id] += 1
            return deepcopy(task)

        if path == "dashboard:updateTask":
            state = self.states.get(session_id)
            if state is None:
                return None
            for index, task in enumerate(state["tasks"]):
                if task["id"] != args["taskId"]:
                    continue
                updated = {**task, **deepcopy(args["patch"]), "id": args["taskId"]}
                for field in ("plotId", "dueAt"):
                    if updated.get(field) is None:
                        updated.pop(field, None)
                state["tasks"][index] = updated
                return deepcopy(updated)
            return None

        self.states.pop(session_id, None)
        self.next_task_ids.pop(session_id, None)
        return {"ok": True}


@pytest.fixture
def convex(monkeypatch):
    fake = FakeConvex()
    monkeypatch.setattr(dashboard_store, "_convex_call", fake)
    return fake


@pytest.fixture
def seed():
    return {
        "farm": {
            "id": "farm-1",
            "name": {"bn": "Khamar", "en": "Farm"},
            "center": [90.28, 23.91],
            "timezone": "Asia/Dhaka",
        },
        "crops": [
            {
                "id": "rice",
                "name": {"bn": "Dhan", "en": "Rice"},
                "model": "rice",
                "color": "#84a83d",
                "nTarget": 28,
                "pTarget": 16,
                "kTarget": 24,
                "moistureMin": 65,
                "moistureMax": 80,
                "daysToHarvest": 120,
                "soilTargets": {
                    "n": [23.8, 32.2],
                    "p": [13.6, 18.4],
                    "k": [20.4, 27.6],
                },
            }
        ],
        "plots": [
            {
                "id": "plot-1",
                "name": {"bn": "Plot 1", "en": "Plot 1"},
                "polygon": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [90.27, 23.90],
                            [90.28, 23.90],
                            [90.28, 23.91],
                            [90.27, 23.91],
                            [90.27, 23.90],
                        ]
                    ],
                },
                "cropId": "rice",
                "plantCount": 100,
                "areaM2": 200,
                "soil": {
                    "n": 28,
                    "p": 16,
                    "k": 24,
                    "ph": 6.5,
                    "moisture": 70,
                    "updatedAt": "2026-11-20T06:00:00Z",
                },
                "growthStage": "vegetative",
                "issues": [
                    {"id": "issue-1", "kind": "low_n", "severity": 1}
                ],
                "plantedAt": "2026-10-01T06:00:00+06:00",
            }
        ],
        "tasks": [
            {
                "id": "task-1",
                "title": {"bn": "Sech porikkha", "en": "Check irrigation"},
                "plotId": "plot-1",
                "status": "waiting",
                "dueAt": "2026-11-22T12:00:00+06:00",
                "createdBy": "farmer",
            }
        ],
    }


def new_task(title="Inspect field"):
    return {
        "title": {"bn": title, "en": title},
        "plotId": "plot-1",
        "status": "waiting",
        "dueAt": "2026-11-23T12:00:00+06:00",
        "createdBy": "agent",
    }


def test_bootstrap_is_idempotent_and_keeps_created_tasks(seed, convex):
    first = dashboard_store.bootstrap_dashboard("session-a", seed)
    created = dashboard_store.create_dashboard_task("session-a", new_task())

    replacement = deepcopy(seed)
    replacement["farm"]["name"]["en"] = "Replacement Farm"
    second = dashboard_store.bootstrap_dashboard("session-a", replacement)

    assert first == seed
    assert second["farm"]["name"]["en"] == "Farm"
    assert [task["id"] for task in second["tasks"]] == ["task-1", created["id"]]
    assert convex.calls["dashboard:bootstrap"] == 2


def test_created_tasks_survive_get_and_increment_ids(seed, convex):
    dashboard_store.bootstrap_dashboard("session-a", seed)
    first = dashboard_store.create_dashboard_task("session-a", new_task("First"))
    second = dashboard_store.create_dashboard_task("session-a", new_task("Second"))

    first["title"]["en"] = "Mutated response"
    persisted = dashboard_store.get_dashboard("session-a")

    assert (first["id"], second["id"]) == ("task-2", "task-3")
    assert [task["id"] for task in persisted["tasks"]] == [
        "task-1",
        "task-2",
        "task-3",
    ]
    assert persisted["tasks"][1]["title"]["en"] == "First"
    assert convex.calls["dashboard:createTask"] == 2


def test_patch_updates_task_and_null_removes_optional_fields(seed, convex):
    dashboard_store.bootstrap_dashboard("session-a", seed)
    updated = dashboard_store.update_dashboard_task(
        "session-a",
        "task-1",
        {
            "title": {"bn": "Shesh", "en": "Complete inspection"},
            "status": "complete",
            "plotId": None,
            "dueAt": None,
        },
    )

    assert updated["title"]["en"] == "Complete inspection"
    assert updated["status"] == "complete"
    assert "plotId" not in updated
    assert "dueAt" not in updated
    assert dashboard_store.get_dashboard("session-a")["tasks"] == [updated]
    assert convex.calls["dashboard:updateTask"] == 1


def test_sessions_are_isolated(seed, convex):
    other_seed = deepcopy(seed)
    other_seed["farm"]["id"] = "farm-2"
    other_seed["farm"]["name"]["en"] = "Other Farm"
    dashboard_store.bootstrap_dashboard("session-a", seed)
    dashboard_store.bootstrap_dashboard("session-b", other_seed)
    dashboard_store.create_dashboard_task("session-a", new_task())

    assert len(dashboard_store.get_dashboard("session-a")["tasks"]) == 2
    assert len(dashboard_store.get_dashboard("session-b")["tasks"]) == 1
    assert dashboard_store.get_dashboard("session-b")["farm"]["id"] == "farm-2"
    assert len(convex.states) == 2


@pytest.mark.parametrize(
    "change",
    [
        lambda state: state["farm"].pop("timezone"),
        lambda state: state["crops"][0].__setitem__("moistureMin", 90),
        lambda state: state["plots"][0].__setitem__("cropId", "missing"),
        lambda state: state["plots"][0]["polygon"]["coordinates"][0].__setitem__(
            -1, [90.26, 23.90]
        ),
        lambda state: state["plots"][0]["soil"].__setitem__(
            "updatedAt", "not-a-timestamp"
        ),
        lambda state: state["plots"][0].__setitem__("plantCount", float("inf")),
        lambda state: state["tasks"][0].__setitem__("id", f"task-{2**53 - 2}"),
    ],
    ids=[
        "state",
        "crop",
        "plot",
        "geojson",
        "timestamp",
        "finite-number",
        "task-counter",
    ],
)
def test_invalid_seed_data_is_rejected_before_convex(seed, convex, change):
    invalid = deepcopy(seed)
    change(invalid)

    with pytest.raises(ValueError):
        dashboard_store.bootstrap_dashboard("session-a", invalid)

    assert convex.calls["dashboard:bootstrap"] == 0


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("status", "blocked"),
        ("title", {"bn": " ", "en": "Invalid"}),
        ("plotId", "plot-missing"),
        ("dueAt", "tomorrow"),
    ],
)
def test_invalid_task_is_rejected_before_mutation(seed, convex, field, value):
    dashboard_store.bootstrap_dashboard("session-a", seed)
    invalid = new_task()
    invalid[field] = value

    with pytest.raises(ValueError):
        dashboard_store.create_dashboard_task("session-a", invalid)

    assert convex.calls["dashboard:createTask"] == 0


def test_invalid_session_and_update_are_rejected(seed, convex):
    with pytest.raises(ValueError):
        dashboard_store.bootstrap_dashboard("bad session", seed)

    dashboard_store.bootstrap_dashboard("session-a", seed)
    with pytest.raises(ValueError):
        dashboard_store.update_dashboard_task(
            "session-a", "task-1", {"plotId": "plot-missing"}
        )
    assert convex.calls["dashboard:updateTask"] == 0


def test_missing_state_and_task_raise_not_found(seed, convex):
    with pytest.raises(dashboard_store.DashboardNotFoundError):
        dashboard_store.get_dashboard("missing")
    with pytest.raises(dashboard_store.DashboardNotFoundError):
        dashboard_store.create_dashboard_task("missing", new_task())

    dashboard_store.bootstrap_dashboard("session-a", seed)
    with pytest.raises(dashboard_store.DashboardNotFoundError):
        dashboard_store.update_dashboard_task("session-a", "task-missing", {})


def test_delete_is_idempotent_and_removes_dashboard(seed, convex):
    dashboard_store.bootstrap_dashboard("session-a", seed)

    dashboard_store.delete_dashboard("session-a")
    dashboard_store.delete_dashboard("session-a")

    with pytest.raises(dashboard_store.DashboardNotFoundError):
        dashboard_store.get_dashboard("session-a")
    assert convex.calls["dashboard:deleteState"] == 2


def test_invalid_convex_state_is_a_store_error(monkeypatch):
    monkeypatch.setattr(
        dashboard_store,
        "_convex_call",
        lambda operation, path, args: {"farm": "invalid"},
    )

    with pytest.raises(dashboard_store.DashboardStoreError):
        dashboard_store.get_dashboard("session-a")


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


def test_convex_call_uses_http_functions_contract(monkeypatch):
    calls = []

    def post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse({"status": "success", "value": {"call": len(calls)}})

    monkeypatch.setattr(dashboard_store.config, "CONVEX_URL", "https://farm.convex.cloud")
    monkeypatch.setattr(dashboard_store.config, "CONVEX_DEPLOY_KEY", "deploy-secret")
    monkeypatch.setattr(dashboard_store.httpx, "post", post)

    query = dashboard_store._convex_call(
        "query", "dashboard:getState", {"sessionId": "session-a"}
    )
    mutation = dashboard_store._convex_call(
        "mutation", "dashboard:deleteState", {"sessionId": "session-a"}
    )

    assert query == {"call": 1}
    assert mutation == {"call": 2}
    assert [call[0] for call in calls] == [
        "https://farm.convex.cloud/api/query",
        "https://farm.convex.cloud/api/mutation",
    ]
    assert calls[0][1] == {
        "headers": {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": "Convex deploy-secret",
        },
        "json": {
            "path": "dashboard:getState",
            "args": {"sessionId": "session-a"},
            "format": "json",
        },
        "timeout": 15.0,
    }


def test_convex_call_errors_do_not_leak_deploy_key(monkeypatch):
    deploy_key = "never-print-this-deploy-key"
    monkeypatch.setattr(dashboard_store.config, "CONVEX_URL", "https://farm.convex.cloud")
    monkeypatch.setattr(dashboard_store.config, "CONVEX_DEPLOY_KEY", deploy_key)
    monkeypatch.setattr(
        dashboard_store.httpx,
        "post",
        lambda *args, **kwargs: FakeResponse(
            {"status": "error", "errorMessage": f"failed with {deploy_key}"}
        ),
    )

    with pytest.raises(dashboard_store.DashboardStoreError) as response_error:
        dashboard_store._convex_call("query", "dashboard:getState", {})
    assert deploy_key not in str(response_error.value)

    def fail_request(*args, **kwargs):
        raise httpx.RequestError(f"network failure with {deploy_key}")

    monkeypatch.setattr(dashboard_store.httpx, "post", fail_request)
    with pytest.raises(dashboard_store.DashboardStoreError) as network_error:
        dashboard_store._convex_call("query", "dashboard:getState", {})
    assert deploy_key not in str(network_error.value)


@pytest.mark.parametrize(
    ("url", "deploy_key"),
    [("", "secret"), ("https://farm.convex.cloud", "")],
)
def test_convex_call_requires_backend_config(monkeypatch, url, deploy_key):
    monkeypatch.setattr(dashboard_store.config, "CONVEX_URL", url)
    monkeypatch.setattr(dashboard_store.config, "CONVEX_DEPLOY_KEY", deploy_key)

    with pytest.raises(dashboard_store.DashboardConfigError):
        dashboard_store._convex_call("query", "dashboard:getState", {})


def test_init_db_does_not_create_dashboard_table(tmp_path, monkeypatch):
    database = tmp_path / "agrisense.sqlite3"
    monkeypatch.setattr(db, "DB_PATH", str(database))

    db.init_db()

    with sqlite3.connect(database) as connection:
        tables = {
            row[0]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            )
        }
    assert {"farms", "messages", "plans"} <= tables
    assert "dashboard_states" not in tables
