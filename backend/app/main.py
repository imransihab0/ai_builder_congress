import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, dashboard_store, db, state
from .agent.loop import run_agent
from .agent.graph import run_agent_graph

app = FastAPI(title="AgriSense AI — DIU_Legacy1831")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)


@app.middleware("http")
async def no_cache_frontend(request, call_next):
    """Serve the HTML/JS/CSS with no-cache so code changes always load (no stale browser cache)."""
    response = await call_next(request)
    p = request.url.path
    if p == "/" or p.endswith((".js", ".css", ".html")):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    return response


db.init_db()

_DASHBOARD_ERRORS = (
    ValueError,
    dashboard_store.DashboardNotFoundError,
    dashboard_store.DashboardConfigError,
    dashboard_store.DashboardStoreError,
)


def _dashboard_http_exception(exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    if isinstance(exc, dashboard_store.DashboardNotFoundError):
        return HTTPException(status_code=404, detail="Dashboard state or task not found")
    if isinstance(exc, dashboard_store.DashboardConfigError):
        return HTTPException(status_code=503, detail="Dashboard storage is not configured")
    return HTTPException(status_code=502, detail="Dashboard storage is unavailable")


class ChatRequest(BaseModel):
    session_id: str
    message: str
    image_data_url: Optional[str] = None


@app.post("/api/chat")
def chat(req: ChatRequest):
    def stream():
        try:
            runner = run_agent_graph if state.current_model() == "deterministic-graph" else run_agent
            for event in runner(req.session_id, req.message, req.image_data_url):
                yield json.dumps(event, ensure_ascii=False) + "\n"
        except Exception as e:
            yield json.dumps({"type": "error", "text": f"{type(e).__name__}: {e}"}) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@app.get("/api/profile/{session_id}")
def profile(session_id: str):
    return db.get_profile(session_id)


@app.post("/api/reset/{session_id}")
def reset(session_id: str):
    db.reset_session(session_id)
    try:
        dashboard_store.delete_dashboard(session_id)
    except _DASHBOARD_ERRORS as exc:
        raise _dashboard_http_exception(exc) from None
    return {"ok": True}


@app.get("/api/inputs")
def inputs():
    """Seeded input catalog (fertilizer/seed/pesticide) for the order-builder dialog."""
    from .tools import market
    return market.get_input_prices()


@app.get("/api/alerts/{session_id}")
def alerts_endpoint(session_id: str):
    """Proactive weather alerts for the farm's saved plan — polled by the UI (no chat turn)."""
    from .tools import alerts
    return alerts.get_session_alerts(session_id)


@app.get("/api/health")
def health():
    from .rag.store import get_collection
    return {
        "provider": state.provider(),
        "model": state.current_model(),
        "kb_chunks": get_collection().count(),
    }


@app.get("/api/model")
def get_model():
    return state.options()


class ModelRequest(BaseModel):
    model: str


@app.post("/api/model")
def set_model(req: ModelRequest):
    return state.set_model(req.model)


class DashboardRequest(BaseModel):
    farm: dict
    crops: list[dict]
    plots: list[dict]
    tasks: list[dict]

    class Config:
        extra = "forbid"


class DashboardTaskRequest(BaseModel):
    title: dict
    plotId: Optional[str] = None
    status: str
    dueAt: Optional[str] = None
    createdBy: str

    class Config:
        extra = "forbid"


class DashboardTaskPatch(BaseModel):
    title: Optional[dict] = None
    plotId: Optional[str] = None
    status: Optional[str] = None
    dueAt: Optional[str] = None
    createdBy: Optional[str] = None

    class Config:
        extra = "forbid"


def _model_dump(model: BaseModel, **kwargs) -> dict:
    if hasattr(model, "model_dump"):
        return model.model_dump(**kwargs)
    return model.dict(**kwargs)


@app.post("/api/dashboard/{session_id}/bootstrap")
def bootstrap_dashboard(session_id: str, request: DashboardRequest):
    try:
        return dashboard_store.bootstrap_dashboard(session_id, _model_dump(request))
    except _DASHBOARD_ERRORS as exc:
        raise _dashboard_http_exception(exc) from None


@app.get("/api/dashboard/{session_id}")
def get_dashboard(session_id: str):
    try:
        return dashboard_store.get_dashboard(session_id)
    except _DASHBOARD_ERRORS as exc:
        raise _dashboard_http_exception(exc) from None


@app.post("/api/dashboard/{session_id}/tasks", status_code=201)
def create_dashboard_task(session_id: str, request: DashboardTaskRequest):
    try:
        return dashboard_store.create_dashboard_task(
            session_id, _model_dump(request, exclude_unset=True)
        )
    except _DASHBOARD_ERRORS as exc:
        raise _dashboard_http_exception(exc) from None


@app.patch("/api/dashboard/{session_id}/tasks/{task_id}")
def update_dashboard_task(
    session_id: str, task_id: str, request: DashboardTaskPatch
):
    try:
        return dashboard_store.update_dashboard_task(
            session_id, task_id, _model_dump(request, exclude_unset=True)
        )
    except _DASHBOARD_ERRORS as exc:
        raise _dashboard_http_exception(exc) from None


FRONTEND = Path(__file__).resolve().parent.parent.parent / "frontend"
app.mount("/", StaticFiles(directory=str(FRONTEND), html=True), name="frontend")
