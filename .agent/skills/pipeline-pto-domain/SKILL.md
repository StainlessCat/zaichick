---
name: pipeline-pto-domain
description: Defines core domain invariants, engineering formulas, material traceability rules, and server-side Excel report generation for trunk pipeline construction (PTO, OGS, PIL). Apply when working on joints, line lists, LRV materials, incoming control, WPS, NAKS, STO repairs, test circuits, or Excel exports.
---

# Pipeline Construction (PTO / OGS / PIL) Domain Rules

Strictly enforce these engineering and regulatory invariants across backend services and frontend displays:

## 1. Diameter-Inch (`d-inch`) & Welding Readiness Math
- **Standard formula:** Convert outer diameter in millimeters to diameter-inches using `d_inch = diameter_mm / 25.4` (unless an explicit project diameter lookup table is already configured in the service).
- Calculate test circuit and line welding readiness in both **joint count** (`welded_joints / total_joints * 100`) and **diameter-inches** (`welded_d_inch / total_d_inch * 100`).

## 2. Line Construction Lengths (With & Without Valves)
- Rely exclusively on the LRV element classifier (`PIPE`, `FITTING`, `VALVE`) to distinguish shut-off/control valves (`VALVE` / ЗРА) from pipes and fittings.
- Compute two metrics per diameter (`DN` / outer diameter) and for the line total:
  - **Length WITH valves:** sum of `length_mm` for all active elements (`PIPE` + `FITTING` + `VALVE`).
  - **Length WITHOUT valves:** sum of `length_mm` for non-valve elements (`element_type != VALVE`).
- **100% completeness rule:** Never display or export partial construction lengths. If ANY active element in the diameter group (or line) has `length_mm IS NULL` or `<= 0`, return `None` for the length totals and expose `missing_length_count` so the UI highlights incomplete rows. Exclude `REPLACED` units from all length sums.

## 3. LRV Material Traceability, Partial Incoming Control & Replacements
- Never treat an `lrv_items` row as a single indivisible physical item; track physical pieces/sub-lots in `material_units` linked to `incoming_control_acts`.
- Aggregate `lrv_items` incoming control status dynamically from non-replaced `material_units`: `NOT_PASSED` (0%), `PARTIALLY_PASSED` (>0% and <100%), `PASSED` (100%).
- **No destructive overwrites on replacement:** When replacing materials (partially or fully), split the sub-lot if partial, mark the replaced unit `ic_status = REPLACED`, link `replaced_by_unit_id`, store `replacement_reason`, create the new unit with `ic_status = PENDING`, and surface any `affected_joints` to the user.

## 4. Welding Quality, NAKS, STO Repairs & Test Circuits
- Validate welder NAKS certification scope (welding method, diameter range, wall thickness range, material group, expiration date) and WPS pre-heating requirements against ambient air temperature (`weather_daily`).
- Enforce STO repair cascade rules (`R1`, `R2`, cutout/re-weld limits).
- **Test circuit closure:** Forbid setting `test_status = TESTED` unless `act_number` and `actual_test_date` are provided, welding readiness is 100%, and `sri_status == APPROVED` (unless explicitly overridden with `force=True` by `DEPT_ADMIN`/`SUPERADMIN` and logged in `audit_logs`).

## 5. Server-Side Excel & Document Generation
- Generate all official forms (**Form Г.1**, **GOST 32569**, **EDI**, **Readiness Reports**) exclusively on the Python backend using `openpyxl`. Never use client-side `xlsx` packages.
