from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class SseEventBus:
    """
    Lightweight delta Event Bus for SSE (/api/events/stream).
    Broadcasts only pinpoint entity change deltas, never full database dumps.
    Also supports PostgreSQL NOTIFY in multi-worker environments.
    """

    CHANNEL = "zaychick_events"

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> AsyncGenerator[dict[str, Any], None]:
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=256)
        async with self._lock:
            self._subscribers.add(queue)
        try:
            yield await self._emit_connected_sentinel()
            while True:
                event = await queue.get()
                yield event
        finally:
            async with self._lock:
                self._subscribers.discard(queue)

    @staticmethod
    async def _emit_connected_sentinel() -> dict[str, Any]:
        return {
            "event": "connected",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }

    async def publish_local(self, payload: dict[str, Any]) -> None:
        async with self._lock:
            subscribers = list(self._subscribers)
        for queue in subscribers:
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                pass

    async def dispatch_pending_session_events(
        self, session: AsyncSession
    ) -> list[dict[str, Any]]:
        """Dispatch buffered delta events after transaction commit."""
        info = getattr(session, "info", None)
        if not info or not isinstance(info, dict):
            return []
        events: list[dict[str, Any]] = info.pop("pending_sse_events", [])
        for payload in events:
            await self.publish_local(payload)
        return events

    def clear_pending_session_events(self, session: AsyncSession) -> None:
        """Clear buffered events without publishing (e.g. on transaction rollback)."""
        info = getattr(session, "info", None)
        if info and isinstance(info, dict):
            info.pop("pending_sse_events", None)

    async def emit_delta(
        self,
        session: AsyncSession | None = None,
        *,
        event: str,
        entity_type: str,
        entity_id: str | uuid.UUID,
        version: int | None = None,
        updated_by: str | None = None,
        data: dict[str, Any] | None = None,
        notify_pg: bool = False,
    ) -> dict[str, Any]:
        """
        Publish a compact delta event.
        If a session is provided, the local event is buffered in the session
        and only dispatched after the transaction commits (preventing phantom
        events if the transaction is rolled back).
        """
        envelope: dict[str, Any] = {
            "event": event,
            "entity_type": entity_type,
            "entity_id": str(entity_id),
            "version": version,
            "updated_by": updated_by,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data or {},
        }
        info = getattr(session, "info", None) if session is not None else None
        if info is not None and isinstance(info, dict):
            info.setdefault("pending_sse_events", []).append(envelope)
            if notify_pg:
                try:
                    serialized = json.dumps(envelope, ensure_ascii=False, default=str)
                    await session.execute(
                        text("SELECT pg_notify(:channel, :payload)"),
                        {"channel": self.CHANNEL, "payload": serialized},
                    )
                except Exception:
                    # Non-PostgreSQL test sessions safely skip pg_notify
                    pass
        else:
            await self.publish_local(envelope)

        return envelope


event_bus = SseEventBus()
