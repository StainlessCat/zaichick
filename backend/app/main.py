from __future__ import annotations

import asyncio
import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes.admin import router as admin_router
from app.api.routes.audit import router as audit_router
from app.api.routes.auth import router as auth_router
from app.api.routes.events import router as events_router
from app.api.routes.executive_docs import router as executive_docs_router
from app.api.routes.exports import router as exports_router
from app.api.routes.facilities import router as facilities_router
from app.api.routes.imports import router as imports_router
from app.api.routes.joints import router as joints_router
from app.api.routes.lab_requests import router as lab_requests_router
from app.api.routes.lines import router as lines_router
from app.api.routes.lrv import router as lrv_router
from app.api.routes.naks import router as naks_router
from app.api.routes.reports import router as reports_router
from app.api.routes.templates import router as templates_router
from app.api.routes.test_circuits import router as test_circuits_router
from app.api.routes.users import router as users_router
from app.api.routes.weather import router as weather_router
from app.api.routes.welding_journals import router as welding_journals_router
from app.api.routes.wps import router as wps_router
from app.core.config import get_settings
from app.core.database import (
    engine,
    verify_postgres_connection,
    verify_schema_migrations_applied,
)
from app.core.errors import integrity_error_handler
from app.core.logging_config import setup_logging
from app.core.metrics import PrometheusMetrics
from app.services.baseline_seed import ensure_baseline_domain_data_seeded
from app.services.event_bus import event_bus, start_postgres_listener, stop_postgres_listener
from app.services.weather.reference_stations import ensure_baseline_weather_stations_seeded
from app.services.weather.scheduler import weather_scheduler_loop
from sqlalchemy.exc import IntegrityError

settings = get_settings()
setup_logging(settings.environment)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Fail-fast PostgreSQL probe and Alembic schema readiness check on startup."""
    await verify_postgres_connection()
    await verify_schema_migrations_applied()
    await ensure_baseline_weather_stations_seeded()
    await ensure_baseline_domain_data_seeded()
    await start_postgres_listener(settings.database_url)
    weather_task: asyncio.Task | None = None
    if settings.environment != "test" and not os.environ.get("PYTEST_CURRENT_TEST"):
        weather_task = asyncio.create_task(weather_scheduler_loop())
    try:
        yield
    finally:
        if weather_task is not None:
            weather_task.cancel()
            try:
                await weather_task
            except asyncio.CancelledError:
                pass
        await stop_postgres_listener()
        await engine.dispose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def prometheus_metrics_middleware(request: Request, call_next) -> Response:
    start_time = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start_time
    PrometheusMetrics.record_request(request.method, request.url.path, response.status_code, duration)
    return response


app.add_exception_handler(IntegrityError, integrity_error_handler)

app.include_router(auth_router)
app.include_router(admin_router)
app.include_router(users_router)
app.include_router(audit_router)
app.include_router(facilities_router)
app.include_router(lines_router)
app.include_router(lrv_router)
app.include_router(wps_router)
app.include_router(naks_router)
app.include_router(joints_router)
app.include_router(test_circuits_router)
app.include_router(executive_docs_router)
app.include_router(lab_requests_router)
app.include_router(welding_journals_router)
app.include_router(reports_router)
app.include_router(templates_router)
app.include_router(events_router)
app.include_router(weather_router)
app.include_router(exports_router)
app.include_router(imports_router)


@app.get("/api/health", tags=["system"])
async def healthcheck() -> dict[str, str]:
    await verify_postgres_connection()
    schema_ver = await verify_schema_migrations_applied()
    return {"status": "ok", "database": "postgresql", "schema_version": schema_ver}


@app.get("/metrics", response_class=PlainTextResponse, tags=["system"])
async def get_prometheus_metrics() -> PlainTextResponse:
    return PlainTextResponse(
        content=PrometheusMetrics.render(event_bus.active_subscribers_count),
        media_type="text/plain; version=0.0.4; charset=utf-8",
    )


# --- Static SPA Hosting for standalone / cloud container deployment (Amvera, Render, etc.) ---
frontend_dist = os.getenv("FRONTEND_DIST_DIR", "/app/dist")
if not os.path.isdir(frontend_dist):
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    dist_candidate = os.path.join(repo_root, "dist")
    prebuilt_candidate = os.path.join(repo_root, "prebuilt")
    if os.path.isdir(dist_candidate):
        frontend_dist = dist_candidate
    elif os.path.isdir(prebuilt_candidate):
        frontend_dist = prebuilt_candidate

if os.path.isdir(frontend_dist):
    assets_dir = os.path.join(frontend_dist, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="spa-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str) -> Response:
        if full_path.startswith("api/") or full_path == "metrics":
            return Response(status_code=404, content='{"detail":"Not Found"}', media_type="application/json")
        target_path = os.path.join(frontend_dist, full_path)
        if full_path and os.path.isfile(target_path):
            return FileResponse(target_path)
        index_file = os.path.join(frontend_dist, "index.html")
        if os.path.isfile(index_file):
            return FileResponse(index_file)
        return Response(status_code=404, content='{"detail":"SPA build not found"}', media_type="application/json")
