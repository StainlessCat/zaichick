---
name: react-modular-tables
description: Prevents monolithic React components and enforces modular decomposition, pure calculation hooks, granular SSE state updates, and virtualized high-density tables. Apply whenever building or refactoring React views, tables, modals, or state management.
---

# React Modular Architecture & High-Density Tables Rules

When creating or refactoring frontend code (`frontend/src/`), strictly obey these structural rules:

## 1. Component Size Limit & Layer Decomposition
- **Hard file size cap (300–400 lines max):** Never create or expand monolithic files (like 2,000+ line views). If a component approaches 350 lines, split it immediately.
- **Strict separation of concerns:**
  - `types/` — TypeScript interfaces and enums matching backend Pydantic schemas.
  - `api/` — Typed `fetch` wrappers and SSE (`EventSource`) subscription handlers. Never call raw `fetch` inside UI table components.
  - `hooks/` — Pure calculation hooks and state logic (e.g., `useLineListCalculations.ts`, `usePermissions.ts`).
  - `components/<feature>/` — Focused subcomponents: `<Feature>Toolbar.tsx`, `<Feature>Table.tsx`, `<Feature>Row.tsx`, and individual `<Action>Modal.tsx` files.

## 2. High-Density Table Performance & Granular SSE Updates
- **Row virtualization:** For registries exceeding 200 rows (Line List, Welding Journals, LRV catalog), use row virtualization (`@tanstack/react-virtual` or windowed rendering) so thousands of joints render without frame drops.
- **Delta updates over full reloads:** When receiving SSE events (`joint_updated`, `line_updated`, `circuit_updated`, `lrv_updated`), patch only the affected item in local state/cache by `id` instead of re-fetching the entire collection.
- **Optimistic locking handling:** Always pass the entity's current `version` in `PATCH` requests. On `409 Conflict`, display a clear row-level conflict notice and offer to reload the latest row state.

## 3. UI & Permission Integration
- Always pair this skill with `strict-industrial-ui` (`h-8` control heights, `items-end` row alignment, single-line truncated labels, zero obvious helper texts).
- Gate edit/approve/delete controls via `usePermissions()` (`DRAFT` / `VERIFIED` / `LOCKED` and user department), keeping the backend as the final authority.
