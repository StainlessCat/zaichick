from __future__ import annotations

import asyncio
import json
import logging
import uuid
from collections import deque
from collections.abc import AsyncGenerator
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class SseEventBus:
    """
    Lightweight delta Event Bus for SSE (/api/events/stream).
    Broadcasts pinpoint entity change deltas, never full database dumps.
    Supports PostgreSQL LISTEN/NOTIFY in multi-worker environments with deduplication.
    """

    CHANNEL = "zaychick_events"

    def __init__(self, max_recent_ids: int = 4096) -> None:
        self._subscribers: set[asyncio.Queue[dict[str, Any]]] = set()
        self._lock = asyncio.Lock()
        self._recent_event_ids: set[str] = set()
        self._recent_event_queue: deque[str] = deque(maxlen=max_recent_ids)
        self._max_recent_ids = max_recent_ids

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

    async def publish_local(
        self, payload: dict[str, Any], deduplicate: bool = True
    ) -> bool:
        """
        Publish an event locally to connected SSE queues.
        If deduplicate=True and payload contains event_id, ignores already seen events.
        """
        event_id = payload.get("event_id")
        if deduplicate and event_id:
            async with self._lock:
                if event_id in self._recent_event_ids:
                    return False
                self._recent_event_ids.add(event_id)
                self._recent_event_queue.append(event_id)
                while len(self._recent_event_ids) > self._max_recent_ids:
                    old_id = self._recent_event_queue.popleft()
                    self._recent_event_ids.discard(old_id)

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
        return True

    async def dispatch_pending_session_events(
        self, session: AsyncSession
    ) -> list[dict[str, Any]]:
        """Dispatch buffered delta events after transaction commit and broadcast via PG NOTIFY."""
        info = getattr(session, "info", None)
        if not info or not isinstance(info, dict):
            return []
        events: list[dict[str, Any]] = info.pop("pending_sse_events", [])
        for payload in events:
            # Deliver to local subscribers connected to this worker
            await self.publish_local(payload, deduplicate=False)

            # Broadcast to other workers across processes via PostgreSQL NOTIFY
            try:
                serialized = json.dumps(payload, ensure_ascii=False, default=str)
                # PostgreSQL NOTIFY payload limit is 8000 bytes; truncate large details if needed
                if len(serialized.encode("utf-8")) > 7500:
                    compact_payload = dict(payload)
                    compact_payload["data"] = {"_truncated": True}
                    serialized = json.dumps(compact_payload, ensure_ascii=False, default=str)
                await session.execute(
                    text("SELECT pg_notify(:channel, :payload)"),
                    {"channel": self.CHANNEL, "payload": serialized},
                )
            except Exception as ex:
                logger.debug("pg_notify skipped: %s", ex)
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
        notify_pg: bool = True,
    ) -> dict[str, Any]:
        """
        Publish a compact delta event.
        If a session is provided, the local event is buffered in the session
        and only dispatched after the transaction commits (preventing phantom
        events if the transaction is rolled back).
        """
        event_id = str(uuid.uuid4())
        envelope: dict[str, Any] = {
            "event_id": event_id,
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
            # Mark event_id as seen locally so the reflection from PG NOTIFY is ignored
            async with self._lock:
                self._recent_event_ids.add(event_id)
                self._recent_event_queue.append(event_id)
        else:
            await self.publish_local(envelope)

        return envelope


class PostgresNotificationListener:
    """
    Background worker that listens for PostgreSQL notifications on `zaychick_events`.
    Enables multi-worker uvicorn processes to receive cross-process SSE events seamlessly.
    """

    def __init__(self, dsn: str, bus: SseEventBus) -> None:
        self.dsn = dsn
        self.bus = bus
        self._running = False
        self._task: asyncio.Task | None = None

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._listen_loop())

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None

    async def _listen_loop(self) -> None:
        import asyncpg

        clean_dsn = self.dsn.replace("postgresql+asyncpg://", "postgresql://")
        backoff = 1.0

        while self._running:
            conn = None
            try:
                conn = await asyncpg.connect(clean_dsn)
                backoff = 1.0

                def _on_notification(_conn: Any, _pid: int, _channel: str, payload: str) -> None:
                    try:
                        parsed = json.loads(payload)
                        if isinstance(parsed, dict):
                            asyncio.create_task(self.bus.publish_local(parsed, deduplicate=True))
                    except Exception as err:
                        logger.debug("Failed to parse PG notification: %s", err)

                await conn.add_listener(self.bus.CHANNEL, _on_notification)
                while self._running and not conn.is_closed():
                    await asyncio.sleep(1.0)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.debug("PG LISTEN connection retry in %ss: %s", backoff, exc)
                await asyncio.sleep(min(backoff, 10.0))
                backoff = min(backoff * 2, 10.0)
            finally:
                if conn and not conn.is_closed():
                    try:
                        await conn.close()
                    except Exception:
                        pass


event_bus = SseEventBus()
_pg_listener: PostgresNotificationListener | None = None


async def start_postgres_listener(dsn: str) -> PostgresNotificationListener:
    global _pg_listener
    if _pg_listener is None:
        _pg_listener = PostgresNotificationListener(dsn, event_bus)
        await _pg_listener.start()
    return _pg_listener


async def stop_postgres_listener() -> None:
    global _pg_listener
    if _pg_listener is not None:
        await _pg_listener.stop()
        _pg_listener = None
