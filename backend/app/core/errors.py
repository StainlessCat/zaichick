from __future__ import annotations

import logging
from typing import Any

from fastapi import Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

logger = logging.getLogger("zaychick.database")


def parse_pg_integrity_error(exc: IntegrityError) -> dict[str, str]:
    """Extract pgcode, constraint name, detail, and table from an asyncpg/SQLAlchemy IntegrityError."""
    orig = getattr(exc, "orig", None)
    cause = getattr(orig, "__cause__", None) or orig

    pgcode = (
        getattr(cause, "pgcode", None)
        or getattr(orig, "pgcode", None)
        or getattr(cause, "sqlstate", None)
        or ""
    )
    constraint = (
        getattr(cause, "constraint_name", None)
        or getattr(orig, "constraint_name", None)
        or ""
    )
    detail = (
        getattr(cause, "detail", None)
        or getattr(orig, "detail", None)
        or ""
    )
    table = (
        getattr(cause, "table_name", None)
        or getattr(orig, "table_name", None)
        or ""
    )
    return {
        "pgcode": str(pgcode or ""),
        "constraint": str(constraint or ""),
        "detail": str(detail or ""),
        "table": str(table or ""),
    }


async def integrity_error_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    info = parse_pg_integrity_error(exc)
    pgcode = info["pgcode"]
    constraint = info["constraint"]
    detail = info["detail"]
    table = info["table"]

    logger.warning(
        "Database integrity error on %s %s: pgcode=%s, constraint=%s, detail=%s",
        request.method,
        request.url.path,
        pgcode,
        constraint,
        detail,
    )

    if pgcode == "23505":  # unique_violation
        message = "Запись с такими ключевыми параметрами уже существует (конфликт уникальности)."
        if constraint == "uq_line_joint_number":
            message = "Стык с таким номером уже существует на данной линии."
        elif "unique_line_id" in constraint:
            message = "Линия с таким уникальным шифром уже существует."
        elif "login" in constraint:
            message = "Пользователь с таким логином уже существует."
        elif "stamp" in constraint:
            message = "Сварщик с таким клеймом уже зарегистрирован."

        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "code": "UNIQUE_CONSTRAINT_VIOLATION",
                "message": message,
                "constraint": constraint or None,
                "table": table or None,
                "detail": detail or None,
            },
        )

    if pgcode == "23503":  # foreign_key_violation
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "code": "FOREIGN_KEY_VIOLATION",
                "message": (
                    "Нарушение ссылочной целостности: связанная запись не найдена "
                    "либо на удаляемую запись ссылаются другие объекты."
                ),
                "constraint": constraint or None,
                "table": table or None,
                "detail": detail or None,
            },
        )

    if pgcode == "23514":  # check_violation
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "code": "CHECK_CONSTRAINT_VIOLATION",
                "message": "Нарушение проверочного ограничения базы данных.",
                "constraint": constraint or None,
                "table": table or None,
                "detail": detail or None,
            },
        )

    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={
            "code": "DATABASE_INTEGRITY_ERROR",
            "message": "Ошибка целостности данных в базе данных.",
            "constraint": constraint or None,
            "table": table or None,
            "detail": detail or str(exc),
        },
    )
