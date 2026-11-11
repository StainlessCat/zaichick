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
    _: User = Depends(get_current_user),
) -> StreamingResponse:
    """
    Server-Sent Events (SSE) endpoint authenticated via HttpOnly Cookie or Bearer header.
    Streams pinpoint delta events (no full-database dumps).
    """

    async def event_generator():
        async for evt in event_bus.subscribe():
            if await request.is_disconnected():
                break
            event_name = str(evt.get("event") or "delta")
            yield _format_sse_frame(event_name, evt)
            if once and event_name != "connected":
                break
            await asyncio.sleep(0)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
