from __future__ import annotations

import time
from collections import defaultdict
from typing import ClassVar


class PrometheusMetrics:
    """Zero-overhead Prometheus text-format metrics exporter."""

    _start_time: ClassVar[float] = time.time()
    _request_counts: ClassVar[dict[tuple[str, str, int], int]] = defaultdict(int)
    _request_durations: ClassVar[dict[tuple[str, str], float]] = defaultdict(float)

    @classmethod
    def record_request(cls, method: str, path: str, status_code: int, duration: float) -> None:
        # Normalize paths to prevent cardinality explosion (e.g. /api/joints/UUID -> /api/joints/:id)
        norm_path = path
        if norm_path.startswith("/api/joints/") and len(norm_path.split("/")) > 3:
            norm_path = "/api/joints/:id"
        elif norm_path.startswith("/api/test_circuits/") and len(norm_path.split("/")) > 3:
            norm_path = "/api/test_circuits/:id"
        elif norm_path.startswith("/api/lab_requests/") and len(norm_path.split("/")) > 3:
            norm_path = "/api/lab_requests/:id"

        key = (method, norm_path, status_code)
        cls._request_counts[key] += 1
        cls._request_durations[(method, norm_path)] += duration

    @classmethod
    def render(cls, sse_subscribers: int = 0) -> str:
        uptime = time.time() - cls._start_time
        lines: list[str] = [
            "# HELP process_uptime_seconds Seconds since application startup",
            "# TYPE process_uptime_seconds gauge",
            f"process_uptime_seconds {uptime:.2f}",
            "",
            "# HELP sse_active_connections Current active SSE clients connected to this worker",
            "# TYPE sse_active_connections gauge",
            f"sse_active_connections {sse_subscribers}",
            "",
            "# HELP http_requests_total Total number of HTTP requests processed",
            "# TYPE http_requests_total counter",
        ]

        for (method, path, status_code), count in sorted(cls._request_counts.items()):
            lines.append(
                f'http_requests_total{{method="{method}",path="{path}",status="{status_code}"}} {count}'
            )

        lines.extend([
            "",
            "# HELP http_request_duration_seconds_total Total duration of HTTP requests in seconds",
            "# TYPE http_request_duration_seconds_total counter",
        ])
        for (method, path), total_sec in sorted(cls._request_durations.items()):
            lines.append(
                f'http_request_duration_seconds_total{{method="{method}",path="{path}"}} {total_sec:.4f}'
            )

        return "\n".join(lines) + "\n"
