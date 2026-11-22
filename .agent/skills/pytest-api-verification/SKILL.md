---
name: pytest-api-verification
description: Enforces atomic, isolated Pytest verification covering RBAC permissions, optimistic locking conflicts, transactional audit logs, and pipeline domain edge cases. Apply whenever writing or updating backend tests.
---

# Atomic Pytest Verification Rules

When writing or updating tests (`backend/tests/`), strictly follow these testing standards:

## 1. Atomic One-Scenario-Per-Test Design
- Never write giant monolithic tests that verify ten unrelated workflows in a single function.
- Each `test_*` function MUST test **one specific business scenario or invariant** with clear Arrange-Act-Assert structure and descriptive naming (e.g., `test_operator_cannot_edit_verified_joint`, `test_partial_lrv_replacement_preserves_original_unit`).

## 2. Mandatory Coverage Matrix for Every Feature
Whenever implementing or modifying an endpoint or domain service, write dedicated tests for:
1. **Happy path & SQL aggregation accuracy:** Verify exact values (e.g., `d-inch` sums, construction length with/without `VALVE`, partial incoming control percentages).
2. **Audit trail verification:** Assert that the mutation created an exact `AuditLog` entry inside the same transaction with `old_value`, `new_value`, and `user_id`.
3. **Authentication & RBAC boundaries (Negative tests):**
   - Unauthenticated request -> `401 Unauthorized`.
   - Wrong department or insufficient role (`OPERATOR` editing `VERIFIED`/`LOCKED`, `DEPT_ADMIN` accessing another department) -> `403 Forbidden`.
4. **Optimistic locking conflict:** Sending a stale `version` in `PATCH` -> `409 Conflict`.
5. **Domain guardrails:** Duplicate `(line_id, joint_number)` rejection, hiding construction length when 1 element has `length_mm=None`, blocking `TESTED` circuit status without `act_number` or when `sri_status != APPROVED`.

## 3. Test Isolation
- Use transactional fixtures or isolated test database schemas so tests never depend on execution order or leftover state.
