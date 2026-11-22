---
name: fastapi-postgres-integrity
description: Enforces strict relational PostgreSQL schema design, row-level optimistic locking, append-only transactional audit trails, and role/department RBAC in FastAPI + SQLAlchemy 2.0. Apply whenever creating or modifying backend models, Alembic migrations, services, or API endpoints.
---

# FastAPI & PostgreSQL Integrity Rules

When writing or refactoring backend code (`backend/`), strictly enforce these architectural invariants:

## 1. Relational Normalization & Fail-Fast Persistence
- **No JSON blobs for core entities:** Never store business entities in `payload_json` columns. Use normalized PostgreSQL tables with explicit column types, `ForeignKey` constraints, and indexes.
- **No silent fallbacks or startup auto-cleanup:** Never fall back to SQLite or local JSON files if PostgreSQL is unavailable — fail fast on startup. Never run silent deduplication scripts on startup; enforce uniqueness at the database level via `UniqueConstraint` (e.g., `UniqueConstraint("line_id", "joint_number", name="uq_line_joint_number")`).
- **Async SQLAlchemy 2.0 + Alembic:** Use typed `Mapped[...]` annotations and generate Alembic migrations for every schema change.

## 2. Granular Mutations & Row-Level Optimistic Locking
- Never create monolithic full-database sync endpoints (`/api/db/sync`). All mutations must be granular (`POST`, `PATCH`, `DELETE` per resource).
- Mutable domain entities (`Joint`, `Line`, `TestCircuit`, `MaterialUnit`, `LrvItem`) MUST include a `version: Mapped[int]` column (`default=1, nullable=False`).
- Every `PATCH` / update operation MUST verify the expected `version` in the `WHERE` clause (or before commit) and increment `version += 1`. On mismatch, return `409 Conflict` scoped strictly to that row.
- Emit lightweight SSE delta events (`joint_updated`, `line_updated`, `circuit_updated`, `lrv_updated`) instead of full database snapshots.

## 3. Immutable Server-Side Audit Trail
- The client MUST NEVER send audit log arrays.
- Every state-changing service function (`CREATE`, `UPDATE`, `DELETE`, `STATUS_CHANGE`, `REPLACE`, `PURGE`) MUST insert a record into `audit_logs` (`user_id`, `action`, `entity_type`, `entity_id`, `old_value`, `new_value`, `ip_address`) **inside the exact same database transaction** as the business mutation.
- `audit_logs` is strictly `append-only`: never expose `PUT`, `PATCH`, or `DELETE` endpoints or service methods for audit records.

## 4. Strict RBAC, Record Locking & Auth Security
- **No substring role heuristics:** Never infer roles from substrings in logins or department names. Use explicit `SystemRoleEnum` (`SUPERADMIN`, `DEPT_ADMIN`, `OPERATOR`, `VIEWER`) and `DepartmentEnum` (`PTO`, `OGS`, `PIL`, `SK`, `ALL`).
- **Record lifecycle locks:** Respect `RecordStatusEnum` (`DRAFT`, `VERIFIED`, `LOCKED`):
  - `OPERATOR` can modify/delete only `DRAFT` records within their own `department`.
  - `DEPT_ADMIN` can modify and transition `DRAFT` <-> `VERIFIED` within their `department`.
  - `LOCKED` records can only be unlocked by `SUPERADMIN` with a logged reason.
- **Auth & Tokens:** `REQUIRE_AUTH` is always `True`. Never accept session/JWT tokens in URL query parameters (`?token=`). Use `HttpOnly, SameSite=Lax` cookies and `Authorization: Bearer` headers, plus rate limiting on `/api/auth/login`.
