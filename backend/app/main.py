from __future__ import annotations

import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from app.api.routes.admin import router as admin_router
from app.api.routes.audit import router as audit_router
from app.api.routes.auth import router as auth_router
from app.api.routes.events import router as events_router
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
from app.services.event_bus import event_bus, start_postgres_listener, stop_postgres_listener
from app.services.weather.reference_stations import ensure_baseline_weather_stations_seeded
from sqlalchemy.exc import IntegrityError

settings = get_settings()
setup_logging(settings.environment)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Fail-fast PostgreSQL probe and Alembic schema readiness check on startup."""
    await verify_postgres_connection()
    await verify_schema_migrations_applied()
    await ensure_baseline_weather_stations_seeded()
    await start_postgres_listener(settings.database_url)
    try:
        yield
    finally:
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
