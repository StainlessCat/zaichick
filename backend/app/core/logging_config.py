from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any


class JsonLogFormatter(logging.Formatter):
    """Structured JSON formatter for production container environments (ELK, Loki, CloudWatch)."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "func": record.funcName,
            "line": record.lineno,
        }
        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)
        if hasattr(record, "client_ip") and record.client_ip:
            log_entry["client_ip"] = record.client_ip
        if hasattr(record, "request_id") and record.request_id:
            log_entry["request_id"] = record.request_id
        return json.dumps(log_entry, ensure_ascii=False)


def setup_logging(environment: str = "development") -> None:
    """Configure system-wide logging with JSON formatting in production."""
    root_logger = logging.getLogger()
    handler = logging.StreamHandler(sys.stdout)

    if environment == "production":
        handler.setFormatter(JsonLogFormatter())
        root_logger.setLevel(logging.INFO)
    else:
        standard_fmt = logging.Formatter(
            fmt="%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d): %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(standard_fmt)
        root_logger.setLevel(logging.DEBUG)

    # Avoid duplicate handlers on re-initialization
    root_logger.handlers.clear()
    root_logger.addHandler(handler)

    # Silence excessively verbose third-party loggers
    logging.getLogger("asyncio").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
