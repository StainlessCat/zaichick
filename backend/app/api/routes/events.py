from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from app.api.deps import get_current_user
from app.models.user import User
from app.services.event_bus import event_bus

router = APIRouter(prefix="/api/events", tags=["events"])


def _format_sse_frame(event_name: str, payload: dict) -> str:
    data = json.dumps(payload, ensure_ascii=False, default=str)
    return f"event: {event_name}\ndata: {data}\n\n"


@router.get("/stream")
async def stream_domain_events(
    request: Request,
    once: bool = Query(default=False, description="Emit initial connected frame and optionally single delta for tests"),
    heartbeat_interval: float = Query(
        default=15.0,
        ge=0.05,
        le=300.0,
        description="SSE heartbeat interval in seconds to keep proxies alive and detect disconnects",
    ),
    _: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Server-Sent Events (SSE) endpoint authenticated via HttpOnly Cookie or Bearer header.
    Streams pinpoint delta events (no full-database dumps) with periodic keepalive heartbeats.
    """

    async def event_generator():
        try:
            async for evt in event_bus.subscribe(heartbeat_interval=heartbeat_interval):
                if await request.is_disconnected():
                    break
                event_name = str(evt.get("event") or "delta")
                if evt.get("heartbeat") or event_name == "ping":
                    # SSE standard comment line resets reverse proxy timeouts without triggering client message events
                    ts = evt.get("timestamp") or ""
                    yield f": keepalive {ts}\n\n"
                    if once:
                        break
                    continue

                yield _format_sse_frame(event_name, evt)
                if once and event_name != "connected":
                    break
                await asyncio.sleep(0)
        except (asyncio.CancelledError, GeneratorExit):
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
