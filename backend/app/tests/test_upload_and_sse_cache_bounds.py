from __future__ import annotations

import asyncio
import io
from pathlib import Path
from typing import Any
import pytest
from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from app.api.routes.imports import _MAX_UPLOAD_BYTES, _read_file_with_size_limit
from app.services.event_bus import SseEventBus


@pytest.mark.asyncio
async def test_upload_file_size_limit_header_abort() -> None:
    """Verifies that an upload with declared size > max limit aborts immediately before chunk reading."""
    mock_file = UploadFile(
        file=io.BytesIO(b"dummy"),
        size=_MAX_UPLOAD_BYTES + 1024,
        filename="huge.xlsx",
    )
    with pytest.raises(HTTPException) as exc_info:
        await _read_file_with_size_limit(mock_file, max_bytes=_MAX_UPLOAD_BYTES)
    assert exc_info.value.status_code == 413
    assert "превышает допустимый лимит" in exc_info.value.detail


@pytest.mark.asyncio
async def test_upload_file_chunked_streaming_abort() -> None:
    """Verifies that chunked streaming aborts early when accumulated bytes exceed limit, even if size is unknown."""
    # 2 MB limit for this test
    test_limit = 2 * 1024 * 1024
    # Create payload of 2 MB + 128 KB
    payload = b"X" * (test_limit + 128 * 1024)
    mock_file = UploadFile(
        file=io.BytesIO(payload),
        filename="streaming_overflow.xlsx",
        # size is None to simulate chunked/streamed upload without Content-Length
    )
    mock_file.size = None

    with pytest.raises(HTTPException) as exc_info:
        await _read_file_with_size_limit(mock_file, max_bytes=test_limit)
    assert exc_info.value.status_code == 413
    assert "превышает допустимый лимит" in exc_info.value.detail


@pytest.mark.asyncio
async def test_upload_file_valid_streaming_read() -> None:
    """Verifies that normal files within limit are read completely and accurately."""
    content = b"test spreadsheet payload"
    mock_file = UploadFile(
        file=io.BytesIO(content),
        filename="normal.csv",
    )
    mock_file.size = len(content)
    result = await _read_file_with_size_limit(mock_file, max_bytes=1024 * 1024)
    assert result == content


@pytest.mark.asyncio
async def test_sse_cache_bounded_growth_and_eviction() -> None:
    """
    Verifies that SseEventBus enforces a strict bound on recent_event_ids and recent_event_queue,
    preventing unbounded memory growth in long-running instances.
    """
    bus = SseEventBus(max_recent_ids=15)

    # Publish 50 distinct events
    for i in range(50):
        await bus.publish_local({"event_id": f"event_{i}", "event": "joint.created"}, deduplicate=True)

    # Cache must be strictly bounded at max_recent_ids (15)
    assert len(bus._recent_event_ids) == 15
    assert len(bus._recent_event_queue) == 15

    # Early events 0..34 must have been evicted
    for i in range(35):
        assert f"event_{i}" not in bus._recent_event_ids

    # Recent events 35..49 must be retained
    for i in range(35, 50):
        assert f"event_{i}" in bus._recent_event_ids

    # Deduplication test: re-publishing a retained event returns False (ignored)
    re_added = await bus.publish_local({"event_id": "event_49", "event": "joint.updated"}, deduplicate=True)
    assert re_added is False

    # Evicted event can be received as new without crashing
    evicted_readded = await bus.publish_local({"event_id": "event_0", "event": "joint.created"}, deduplicate=True)
    assert evicted_readded is True
    assert "event_0" in bus._recent_event_ids
    assert len(bus._recent_event_ids) == 15

    # Zero or negative max_recent_ids is clamped to at least 1 (never raises IndexError)
    min_bus = SseEventBus(max_recent_ids=0)
    assert min_bus._max_recent_ids == 1
    assert await min_bus.publish_local({"event_id": "e1", "event": "joint.created"}, deduplicate=True) is True
    assert await min_bus.publish_local({"event_id": "e2", "event": "joint.created"}, deduplicate=True) is True
    assert len(min_bus._recent_event_ids) == 1


def test_docker_compose_and_env_templates() -> None:
    """Verifies that docker-compose.yml enforces secure production defaults and fails fast on missing secrets."""
    repo_root = Path(__file__).resolve().parents[3]
    compose_path = repo_root / "docker-compose.yml"
    env_example_path = repo_root / ".env.example"

    assert compose_path.exists(), f"docker-compose.yml not found at {compose_path}"
    assert env_example_path.exists(), f".env.example not found at {env_example_path}"

    compose_text = compose_path.read_text(encoding="utf-8")
    env_text = env_example_path.read_text(encoding="utf-8")

    # Production environment mode enabled by default
    assert "ENVIRONMENT: ${ENVIRONMENT:-production}" in compose_text
    assert "ENVIRONMENT=production" in env_text

    # Fail-safe parameter expansions for secrets
    assert "${POSTGRES_PASSWORD:?" in compose_text
    assert "${JWT_SECRET_KEY:?" in compose_text

    # Ports restricted to 127.0.0.1
    assert "127.0.0.1:5432:5432" in compose_text
    assert "127.0.0.1:8000:8000" in compose_text

    # Secure cookies default
    assert "COOKIE_SECURE: ${COOKIE_SECURE:-true}" in compose_text

    # .env.example contains configuration guides
    assert "POSTGRES_PASSWORD=" in env_text
    assert "JWT_SECRET_KEY=" in env_text
    assert "COOKIE_SECURE=true" in env_text

    # [C-01] Ensure docker-compose.override.yml is absent so docker compose up cannot auto-merge dev secrets in production
    assert not (repo_root / "docker-compose.override.yml").exists(), (
        "docker-compose.override.yml is forbidden as Docker Compose automatically merges it in production. "
        "Use docker-compose.dev.yml instead."
    )
    assert not (repo_root / "docker-compose.override.yaml").exists()

    # Verify dedicated dev compose file exists with explicit dev environment profile
    dev_compose_path = repo_root / "docker-compose.dev.yml"
    assert dev_compose_path.exists(), f"docker-compose.dev.yml not found at {dev_compose_path}"
    dev_compose_text = dev_compose_path.read_text(encoding="utf-8")
    assert "ENVIRONMENT: development" in dev_compose_text

@pytest.mark.asyncio
async def test_sse_heartbeat_idle_timeout() -> None:
    bus = SseEventBus()
    events_received: list[dict[str, Any]] = []

    async def collect() -> None:
        async for evt in bus.subscribe(heartbeat_interval=0.05):
            events_received.append(evt)
            if len(events_received) >= 3:
                break

    await asyncio.wait_for(collect(), timeout=1.0)

    assert len(events_received) >= 3
    assert events_received[0]["event"] == "connected"
    assert events_received[1]["event"] == "ping"
    assert events_received[1]["heartbeat"] is True
    assert "timestamp" in events_received[1]
    assert events_received[2]["event"] == "ping"


@pytest.mark.asyncio
async def test_sse_stream_heartbeat_comment_and_clean_cleanup() -> None:
    from httpx import ASGITransport, AsyncClient
    from app.main import app
    from app.api.deps import get_current_user
    import uuid
    from app.models.user import User
    from app.models.enums import RoleEnum, DepartmentEnum
    from app.services.event_bus import event_bus

    fake_user = User(
        id=uuid.UUID("00000000-0000-0000-0000-000000000001"),
        login="sse_test_user",
        password_hash="fake",
        full_name="SSE Test User",
        role=RoleEnum.OPERATOR,
        department=DepartmentEnum.PTO,
        is_active=True,
    )

    app.dependency_overrides[get_current_user] = lambda: fake_user
    initial_subscribers_count = len(event_bus._subscribers)

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            async with client.stream(
                "GET",
                "/api/events/stream?heartbeat_interval=0.05&once=true",
            ) as response:
                assert response.status_code == 200
                body = (await response.aread()).decode("utf-8")
                assert ": keepalive" in body

        await asyncio.sleep(0.05)
        assert len(event_bus._subscribers) == initial_subscribers_count
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_python_runtime_and_ci_alignment() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    pyproject_path = repo_root / "backend" / "pyproject.toml"
    ci_path = repo_root / ".github" / "workflows" / "ci.yml"
    dockerfile_path = repo_root / "Dockerfile"

    assert pyproject_path.exists()
    assert ci_path.exists()
    assert dockerfile_path.exists()

    pyproject_text = pyproject_path.read_text(encoding="utf-8")
    ci_text = ci_path.read_text(encoding="utf-8")
    docker_text = dockerfile_path.read_text(encoding="utf-8")

    assert 'requires-python = ">=3.10, <3.14"' in pyproject_text
    assert '"Programming Language :: Python :: 3.12"' in pyproject_text

    assert "python-version: '3.12'" in ci_text
    assert "python:3.12-slim" in docker_text
