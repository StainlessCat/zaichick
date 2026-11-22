from __future__ import annotations

import json
import logging
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.logging_config import JsonLogFormatter
from app.core.metrics import PrometheusMetrics
from app.main import app


def test_prometheus_metrics_unit():
    PrometheusMetrics.record_request("GET", "/api/test", 200, 0.042)
    PrometheusMetrics.record_request("POST", "/api/joints/some-uuid", 201, 0.125)
    rendered = PrometheusMetrics.render(sse_subscribers=3)

    assert "process_uptime_seconds" in rendered
    assert "sse_active_connections 3" in rendered
    assert 'http_requests_total{method="GET",path="/api/test",status="200"}' in rendered
    assert 'http_requests_total{method="POST",path="/api/joints/:id",status="201"}' in rendered
    assert "http_request_duration_seconds_total" in rendered


def test_json_log_formatter():
    formatter = JsonLogFormatter()
    record = logging.LogRecord(
        name="test_logger",
        level=logging.INFO,
        pathname="test_path.py",
        lineno=42,
        msg="Structured event message: %s",
        args=("sample_detail",),
        exc_info=None,
    )
    formatted = formatter.format(record)
    parsed = json.loads(formatted)
    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "test_logger"
    assert parsed["message"] == "Structured event message: sample_detail"
    assert parsed["line"] == 42
    assert "timestamp" in parsed


@pytest.mark.asyncio
async def test_metrics_endpoint_integration():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        resp = await client.get("/metrics")
        assert resp.status_code == 200
        assert "text/plain" in resp.headers["content-type"]
        body = resp.text
        assert "process_uptime_seconds" in body
        assert "sse_active_connections" in body
        assert "http_requests_total" in body



@pytest.mark.asyncio
async def test_spa_serving_fallback():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        # Request root SPA
        resp = await client.get("/")
        assert resp.status_code == 200
        assert "html" in resp.headers.get("content-type", "")

        # Request client-side deep route (HTML5 pushState fallback)
        resp2 = await client.get("/registry/lines")
        assert resp2.status_code == 200
        assert "html" in resp2.headers.get("content-type", "")
