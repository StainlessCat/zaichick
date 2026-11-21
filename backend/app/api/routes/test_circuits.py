from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    get_client_ip,
    get_current_user,
    get_db_session,
    require_dept_access,
)
from app.models.enums import (
    CircuitTestStatusEnum,
    SriStatusEnum,
    SystemRoleEnum,
)
from app.models.user import User
from app.schemas.auth import RecordStatusChangeRequest
from app.schemas.test_circuit import (
    AssignJointsRequest,
    AssignLinesRequest,
    CircuitAssignmentResultOut,
    TestCircuitCreate,
    TestCircuitDetailOut,
    TestCircuitOut,
    TestCircuitUpdate,
    UnassignJointsRequest,
)
from app.services.test_circuit_service import (
    CIRCUIT_ALLOWED_DEPTS,
    assign_joints_to_circuit,
    assign_lines_to_circuit,
    change_test_circuit_record_status,
    create_test_circuit,
    delete_test_circuit,
    get_test_circuit_detail,
    list_test_circuits,
    unassign_joints_from_circuit,
    update_test_circuit,
)

router = APIRouter(prefix="/api/test-circuits", tags=["test-circuits"])


@router.get("", response_model=list[TestCircuitOut])
async def api_list_test_circuits(
    facility_id: uuid.UUID | None = Query(default=None),
    object_name: str | None = Query(default=None),
    test_status: CircuitTestStatusEnum | None = Query(default=None),
    sri_status: SriStatusEnum | None = Query(default=None),
    search: str | None = Query(default=None),
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> list[TestCircuitOut]:
    return await list_test_circuits(
        session,
        facility_id=facility_id,
        object_name=object_name,
        test_status=test_status,
        sri_status=sri_status,
        search=search,
    )


@router.get("/{circuit_id}", response_model=TestCircuitDetailOut)
async def api_get_test_circuit(
    circuit_id: uuid.UUID,
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> TestCircuitDetailOut:
    return await get_test_circuit_detail(session, circuit_id)


@router.post("", response_model=TestCircuitOut, status_code=status.HTTP_201_CREATED)
async def api_create_test_circuit(
    payload: TestCircuitCreate,
    request: Request,
    current_user: User = Depends(
        require_dept_access(CIRCUIT_ALLOWED_DEPTS, SystemRoleEnum.OPERATOR)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> TestCircuitOut:
    return await create_test_circuit(
        session,
        payload,
        user=current_user,
        ip_address=get_client_ip(request),
    )


@router.patch("/{circuit_id}", response_model=TestCircuitDetailOut)
async def api_update_test_circuit(
    circuit_id: uuid.UUID,
    payload: TestCircuitUpdate,
    request: Request,
    current_user: User = Depends(
        require_dept_access(CIRCUIT_ALLOWED_DEPTS, SystemRoleEnum.OPERATOR)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> TestCircuitDetailOut:
    return await update_test_circuit(
        session,
        circuit_id,
        payload,
        user=current_user,
        ip_address=get_client_ip(request),
    )


@router.patch("/{circuit_id}/status", response_model=TestCircuitDetailOut)
async def api_change_test_circuit_status(
    circuit_id: uuid.UUID,
    payload: RecordStatusChangeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session),
) -> TestCircuitDetailOut:
    return await change_test_circuit_record_status(
        session,
        circuit_id,
        target_status=payload.record_status,
        expected_version=payload.version,
        reason=payload.reason,
        user=current_user,
        ip_address=get_client_ip(request),
    )


@router.delete("/{circuit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def api_delete_test_circuit(
    circuit_id: uuid.UUID,
    request: Request,
    expected_version: int | None = Query(default=None, alias="version"),
    current_user: User = Depends(
        require_dept_access(CIRCUIT_ALLOWED_DEPTS, SystemRoleEnum.OPERATOR)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await delete_test_circuit(
        session,
        circuit_id,
        expected_version=expected_version,
        user=current_user,
        ip_address=get_client_ip(request),
    )


@router.post("/{circuit_id}/assign-lines", response_model=CircuitAssignmentResultOut)
async def api_assign_lines_to_circuit(
    circuit_id: uuid.UUID,
    payload: AssignLinesRequest,
    request: Request,
    current_user: User = Depends(
        require_dept_access(CIRCUIT_ALLOWED_DEPTS, SystemRoleEnum.OPERATOR)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> CircuitAssignmentResultOut:
    detail, affected = await assign_lines_to_circuit(
        session,
        circuit_id,
        payload,
        user=current_user,
        ip_address=get_client_ip(request),
    )
    return CircuitAssignmentResultOut(
        circuit=detail,
        affected_joints_count=affected,
    )


@router.post("/{circuit_id}/assign-joints", response_model=CircuitAssignmentResultOut)
async def api_assign_joints_to_circuit(
    circuit_id: uuid.UUID,
    payload: AssignJointsRequest,
    request: Request,
    current_user: User = Depends(
        require_dept_access(CIRCUIT_ALLOWED_DEPTS, SystemRoleEnum.OPERATOR)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> CircuitAssignmentResultOut:
    detail, affected = await assign_joints_to_circuit(
        session,
        circuit_id,
        payload,
        user=current_user,
        ip_address=get_client_ip(request),
    )
    return CircuitAssignmentResultOut(
        circuit=detail,
        affected_joints_count=affected,
    )


@router.post("/{circuit_id}/unassign-joints", response_model=CircuitAssignmentResultOut)
async def api_unassign_joints_from_circuit(
    circuit_id: uuid.UUID,
    payload: UnassignJointsRequest,
    request: Request,
    current_user: User = Depends(
        require_dept_access(CIRCUIT_ALLOWED_DEPTS, SystemRoleEnum.OPERATOR)
    ),
    session: AsyncSession = Depends(get_db_session),
) -> CircuitAssignmentResultOut:
    detail, affected = await unassign_joints_from_circuit(
        session,
        circuit_id,
        payload,
        user=current_user,
        ip_address=get_client_ip(request),
    )
    return CircuitAssignmentResultOut(
        circuit=detail,
        affected_joints_count=affected,
    )
