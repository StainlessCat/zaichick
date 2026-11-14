from __future__ import annotations

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

