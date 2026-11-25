from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_client_ip,
    get_current_user,
    get_db_session,
    require_dept_access,
)
from app.models.enums import SystemRoleEnum
from app.models.user import User
from app.schemas.executive_doc import ExecutiveDocOut, ExecutiveDocUpsert
from app.services.executive_doc_service import (
    EXECUTIVE_DOC_ALLOWED_DEPTS,
    list_executive_docs,
    upsert_executive_doc,
)

router = APIRouter(prefix="/api/executive-docs", tags=["executive-docs"])


@router.get("", response_model=list[ExecutiveDocOut])
async def api_list_executive_docs(
    facility_id: uuid.UUID | None = Query(default=None),
    object_name: str | None = Query(default=None),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[ExecutiveDocOut]:
    return await list_executive_docs(
        session,
        facility_id=facility_id,
        object_name=object_name,
    )


@router.put("/{line_id}", response_model=ExecutiveDocOut)
async def api_upsert_executive_doc(
    line_id: uuid.UUID,
    payload: ExecutiveDocUpsert,
    request: Request,
    current_user: User = Depends(
        require_dept_access(EXECUTIVE_DOC_ALLOWED_DEPTS, SystemRoleEnum.OPERATOR)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> ExecutiveDocOut:
    return await upsert_executive_doc(
        session,
        line_id,
        payload,
        user=current_user,
        ip_address=get_client_ip(request),
    )
