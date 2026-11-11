from __future__ import annotations

import hashlib
import json
import sqlite3
import uuid
from datetime import date, datetime, timezone
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from openpyxl import load_workbook

from app.api.deps import get_db_session
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.audit import AuditLog
from app.models.enums import (
    ControlResultEnum,
    JointKindEnum,
    JointTypeEnum,
    LrvStatusEnum,
    LrvUnitEnum,
    NdtMethodEnum,
    LrvElementCategoryEnum,
    RoleEnum,
)
from app.models.facility import Facility
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.lrv import LrvItem
from app.models.settings import AppSetting, ColumnTemplate
from app.models.user import User
from app.models.welding_tech import TechCard, Welder, WeldingMaterial
from app.services.sqlite_migrator import migrate_sqlite_to_postgres


class _FakeResult:
    def __init__(self, items: list[Any]) -> None:
        self._items = items

    def scalar_one_or_none(self):
        return self._items[0] if self._items else None

    def scalar_one(self):
        return self._items[0] if self._items else None

    def scalars(self):
        return SimpleNamespace(all=lambda: list(self._items))


class _ExportMigrationFakeSession:
    def __init__(self) -> None:
        self.stores: dict[type, dict[Any, Any]] = {
            User: {},
            Facility: {},
            ProjectLine: {},
            LrvItem: {},
            Welder: {},
            TechCard: {},
            WeldingMaterial: {},
            WeldJoint: {},
            ColumnTemplate: {},
            AppSetting: {},
        }
        self.audit_logs: list[AuditLog] = []
        self.committed = 0
        self.rolled_back = 0

    def add(self, obj: Any) -> None:
        now = datetime.now(timezone.utc)
        if isinstance(obj, AuditLog):
            if obj.id is None:
                obj.id = uuid.uuid4()
            if obj.timestamp is None:
                obj.timestamp = now
            if all(a.id != obj.id for a in self.audit_logs):
                self.audit_logs.append(obj)
            return

        if isinstance(obj, AppSetting):
            self.stores[AppSetting][obj.key] = obj
            return

        for cls, store in self.stores.items():
            if isinstance(obj, cls):
                key = getattr(obj, "id", None)
                if key is None:
                    key = uuid.uuid4()
                    obj.id = key
                store[key] = obj
                return

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        self.committed += 1

    async def rollback(self) -> None:
        self.rolled_back += 1

    async def execute(self, stmt):
        sql = str(stmt)
        if "FROM audit_logs" in sql:
            return _FakeResult(list(self.audit_logs))
        table_map = {
            "FROM users": User,
            "FROM facilities": Facility,
            "FROM project_lines": ProjectLine,
            "FROM lrv_items": LrvItem,
            "FROM welders": Welder,
            "FROM tech_cards": TechCard,
            "FROM welding_materials": WeldingMaterial,
            "FROM weld_joints": WeldJoint,
            "FROM column_templates": ColumnTemplate,
            "FROM app_settings": AppSetting,
        }
        for marker, cls in table_map.items():
            if marker in sql:
                return _FakeResult(list(self.stores[cls].values()))
        return _FakeResult([])


def _auth_header(user: User) -> dict[str, str]:
    token, _ = create_access_token(
        user_id=user.id,
        login=user.login,
        role=user.role.value,
        session_number=user.session_number,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_server_openpyxl_exports_gost_sto_readiness_and_strict_completeness() -> None:
    db = _ExportMigrationFakeSession()
    now = datetime.now(timezone.utc)
    viewer = User(
        id=uuid.uuid4(),
        login="viewer_export",
        password_hash=hash_password("Pass123!"),
        full_name="Представитель Заказчика",
        role=RoleEnum.VIEWER,
        department="Стройконтроль",
        position_title="Инженер СК",
        session_number=1,
        is_active=True,
        must_change_password=False,
        version=1,
        created_at=now,
        updated_at=now,
    )
    db.add(viewer)

    fac_id = uuid.uuid4()
    line_id = uuid.uuid4()
    line = ProjectLine(
        id=line_id,
        facility_id=fac_id,
        object_name="КС Западная",
        rd_code="0092.049-045.0077.01",
        line_number="L-50",
        unique_line_id="01-L-50",
        line_name="Линия 50",
        product="Газ",
        test_contour="К-1",
        welding_ntd="СТО Газпром 15-1.1-002-2023",
        control_ntd="СТО Газпром 15-1.1-002-2023",
        quality_level="A",
        pipeline_category="I",
        working_pressure="7.4",
        working_temperature="20",
        rk_percent=100.0,
        uzk_percent=0.0,
        pvk_percent=0.0,
        sort_order=1,
        version=1,
    )
    db.add(line)

    # Joint with VIK conducted WITHOUT report number -> must NOT fabricate report number!
    j_incomplete = WeldJoint(
        id=uuid.uuid4(),
        line_id=line_id,
        facility_id=fac_id,
        object_name="КС Западная",
        rd_code="0092.049-045.0077.01",
        contour="К-1",
        line_number="L-50",
        unique_line_id="01-L-50",
        joint_number="10",
        is_supplementary=False,
        joint_kind=JointKindEnum.BUTT,
        joint_type=JointTypeEnum.MOUNTING,
        diameter_mm=159.0,
        diameter_inch='6"',
        equiv_diameter_inch=6.0,
        wall_thickness=6.0,
        lrv1_code="ЛРВ-1",
        elem1_name="Труба 159х6",
        elem1_material="09Г2С",
        elem1_ntd="ГОСТ 8732-78",
        lrv2_code="ЛРВ-2",
        elem2_name="Отвод 159х6",
        elem2_material="09Г2С",
        elem2_ntd="ГОСТ 17375-2001",
        welding_type="РАД",
        gost_joint_type="С17",
        welding_date=date(2026, 4, 1),
        welder_stamp="СВ-01",
        welder_full_name="Петров А.А.",
        welding_materials="Св-08Г2С",
        ambient_temp_c=5.0,
        preheat_temp="н/п",
        responsible_person="Иванов И.И.",
        tech_card_number="ТК-10",
        vik_result=ControlResultEnum.FIT,
        vik_date=date(2026, 4, 2),
        vik_inspector="Смирнов К.К.",
        vik_report_number=None,
        ndt_type=NdtMethodEnum.RK,
        ndt_result=ControlResultEnum.IN_WORK,  # Should NOT count as conducted
        ndt_inspector="",
        ndt_report_number=None,
        dup_ndt_type=NdtMethodEnum.NOT_REQUIRED,
        dup_ndt_result=ControlResultEnum.NOT_CONDUCTED,
        dup_ndt_inspector="",
        sort_order=1,
        version=1,
        updated_by="pto",
    )
    db.add(j_incomplete)

    app.dependency_overrides[get_db_session] = lambda: db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            # 1. Strict completeness export fails with 422 when VIK report number is missing
            res_strict = await client.get(
                "/api/exports/journal.xlsx",
                params={"standard": "СТО Газпром 15-1.1-002-2023", "strict": "true"},
                headers=_auth_header(viewer),
            )
            assert res_strict.status_code == 422
            assert res_strict.json()["detail"]["code"] == "JOURNAL_INCOMPLETE"

            # 2. Non-strict STO Gazprom 49-col workbook succeeds & does NOT fabricate VIK number
            res_sto = await client.get(
                "/api/exports/journal.xlsx",
                params={"standard": "СТО Газпром 15-1.1-002-2023"},
                headers=_auth_header(viewer),
            )
            assert res_sto.status_code == 200
            assert res_sto.headers["x-journal-complete"] == "false"
            assert res_sto.headers["x-journal-missing-count"] == "1"

            wb_sto = load_workbook(BytesIO(res_sto.content))
            ws_sto = wb_sto["Журнал СТО Газпром"]
            assert len(ws_sto.merged_cells.ranges) >= 5  # Title + multi-level header groups
            # Row 7 is column numbers 1..49, row 8 is first data row
            assert [ws_sto.cell(row=7, column=c).value for c in range(1, 50)] == list(range(1, 50))
            assert ws_sto.cell(row=8, column=13).value == "10"  # joint_number
            assert ws_sto.cell(row=8, column=21).value in (None, "")  # col 21 VIK № stays blank, never fake!
            assert ws_sto.cell(row=8, column=27).value == "В работе"  # col 27 outputs journal NDT status ("В работе"), while quota strictly excludes it

            # 3. GOST 32569-2013 17-col workbook
            res_gost = await client.get(
                "/api/exports/journal.xlsx",
                params={"standard": "ГОСТ 32569-2013"},
                headers=_auth_header(viewer),
            )
            assert res_gost.status_code == 200
            wb_gost = load_workbook(BytesIO(res_gost.content))
            ws_gost = wb_gost["Журнал ГОСТ 32569"]
            assert [ws_gost.cell(row=5, column=c).value for c in range(1, 18)] == list(range(1, 18))
            assert "№" not in str(ws_gost.cell(row=6, column=15).value)  # No fabricated VIK act number

            # 4. Readiness + Welder Quotas multi-sheet XLSX
            res_ready = await client.get(
                "/api/exports/readiness.xlsx",
                headers=_auth_header(viewer),
            )
            assert res_ready.status_code == 200
            wb_ready = load_workbook(BytesIO(res_ready.content))
            assert wb_ready.sheetnames == [
                "Сводка готовности",
                "Квоты НК (сварщики)",
                "Прогресс НК по линиям",
            ]
            ws_quotas = wb_ready["Квоты НК (сварщики)"]
            assert ws_quotas.cell(row=5, column=1).value == "СВ-01"
            assert ws_quotas.cell(row=5, column=4).value == 0  # "В работе" NOT counted!
            assert ws_quotas.cell(row=5, column=10).value == "critical"

            # 5. Registry XLSX + Audit log recorded for every export
            res_reg = await client.get("/api/exports/joints.xlsx", headers=_auth_header(viewer))
            assert res_reg.status_code == 200
            wb_reg = load_workbook(BytesIO(res_reg.content))
            assert wb_reg["Реестр стыков"].cell(row=5, column=5).value == "10"

            assert sum(1 for a in db.audit_logs if a.action == "EXPORT") == 4
    finally:
        app.dependency_overrides.clear()


def _create_isolated_legacy_sqlite(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE db_meta (
          id INTEGER PRIMARY KEY,
          global_revision INTEGER,
          last_updated_at TEXT,
          last_updated_by TEXT,
          last_action TEXT,
          templates_json TEXT,
          active_template_id TEXT
        );
        CREATE TABLE user_accounts (
          login TEXT PRIMARY KEY,
          sort_order INTEGER,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE facility_geo (
          object_name TEXT PRIMARY KEY,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE project_linelist (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          unique_line_id TEXT,
          rd_code TEXT,
          object_name TEXT,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE lrv_catalog (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          lrv_code TEXT,
          rd_code TEXT,
          object_name TEXT,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE welders (
          stamp TEXT PRIMARY KEY,
          sort_order INTEGER,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE tech_cards (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          number TEXT,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE welding_materials (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          version INTEGER,
          payload_json TEXT
        );
        CREATE TABLE weld_joints (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          joint_number TEXT,
          unique_line_id TEXT,
          rd_code TEXT,
          object_name TEXT,
          version INTEGER,
          updated_at TEXT,
          updated_by TEXT,
          payload_json TEXT
        );
        CREATE TABLE duplicate_joints_quarantine (
          quarantine_id TEXT PRIMARY KEY,
          original_joint_id TEXT,
          kept_joint_id TEXT,
          normalized_unique_line_id TEXT,
          normalized_joint_number TEXT,
          reason TEXT,
          quarantined_at TEXT,
          sort_order INTEGER,
          joint_number TEXT,
          unique_line_id TEXT,
          rd_code TEXT,
          object_name TEXT,
          version INTEGER,
          updated_at TEXT,
          updated_by TEXT,
          payload_json TEXT
        );
        CREATE TABLE audit_logs (
          id TEXT PRIMARY KEY,
          sort_order INTEGER,
          timestamp TEXT,
          user_login TEXT,
          operation_type TEXT,
          payload_json TEXT
        );
        """
    )

    conn.execute(
        "INSERT INTO db_meta VALUES (1, 5, '2026-04-01T10:00:00Z', 'admin', 'INIT', ?, 'tpl-default')",
        (
            json.dumps(
                [
                    {
                        "id": "tpl-default",
                        "name": "Основной",
                        "description": "Стандартный шаблон",
                        "isSystem": True,
                        "columnOrder": ["jointNumber", "diameterMm"],
                        "visibleColumns": ["jointNumber", "diameterMm"],
                    }
                ]
            ),
        ),
    )
    conn.execute(
        "INSERT INTO user_accounts VALUES ('pil_user', 1, 1, ?)",
        (json.dumps({"login": "pil_user", "fullName": "Спец ПИЛ", "role": "PIL", "password": "LegacyPass1!"}),),
    )
    conn.execute(
        "INSERT INTO facility_geo VALUES ('КС Северная', 1, ?)",
        (
            json.dumps(
                {
                    "id": "fac-1",
                    "shortName": "КС-С",
                    "region": "ЯНАО",
                    "lat": 66.0,
                    "lon": 76.0,
                    "rdCodes": [{"code": "РД-100", "title": "Узел учёта", "contours": ["К1"]}],
                }
            ),
        ),
    )
    conn.execute(
        "INSERT INTO project_linelist VALUES ('ln-1', 1, '100-L1', 'РД-100', 'КС Северная', 2, ?)",
        (json.dumps({"lineNumber": "L1", "rdCode": "РД-100", "rkPercent": 100, "uzkPercent": 20}),),
    )
    conn.execute(
        "INSERT INTO lrv_catalog VALUES ('lrv-1', 1, 'ЛРВ-1', 'РД-100', 'КС Северная', 1, ?)",
        (json.dumps({"shortName": "Труба 219х8", "material": "09Г2С", "diameterMm": 219, "wallThickness": 8}),),
    )
    conn.execute(
        "INSERT INTO welders VALUES ('К77', 1, 1, ?)",
        (json.dumps({"fullName": "Кузнецов К.К.", "allowedMethods": ["РАД"], "naksCerts": [{"weldingType": "РАД", "certNumber": "Ц-77"}]}),),
    )
    conn.execute(
        "INSERT INTO tech_cards VALUES ('tc-1', 1, 'ТК-77', 1, ?)",
        (json.dumps({"title": "ТК Сварка", "weldingType": "РАД", "jointKind": "Стыковое", "elementCombination": "Труба+Труба", "preheatRules": [{"ambientMinC": -40, "ambientMaxC": 0, "minPreheatTempC": 100, "conditionLabel": "<=0C"}]}),),
    )
    conn.execute(
        "INSERT INTO welding_materials VALUES ('mat-1', 1, 1, ?)",
        (json.dumps({"brandAndDiameter": "Св-08Г2С 2.0", "type": "Проволока сварочная", "weldingMethod": "РАД"}),),
    )
    # Intentional duplicate pair on same line ('100-L1', '5') with different versions/timestamps
    conn.execute(
        "INSERT INTO weld_joints VALUES ('j-old', 1, '5', '100-L1', 'РД-100', 'КС Северная', 1, '2026-04-01T08:00:00Z', 'pto', ?)",
        (json.dumps({"jointNumber": "5", "diameterMm": 219, "wallThickness": 8, "welderStamp": "К77", "vikResult": "В работе"}),),
    )
    conn.execute(
        "INSERT INTO weld_joints VALUES ('j-new', 2, ' 5 ', '100-L1', 'РД-100', 'КС Северная', 3, '2026-04-02T12:00:00Z', 'pil', ?)",
        (json.dumps({"jointNumber": "5", "diameterMm": 219, "wallThickness": 8, "welderStamp": "К77", "vikResult": "Годен"}),),
    )
    conn.execute(
        "INSERT INTO duplicate_joints_quarantine VALUES ('q-hist', 'j-hist', 'j-new', '100-l1', '5', 'Исторический дубль', '2026-04-01T07:00:00Z', 1, '5', '100-L1', 'РД-100', 'КС Северная', 1, '2026-04-01T07:00:00Z', 'pto', ?)",
        (json.dumps({"jointNumber": "5", "note": "archived-earlier"}),),
    )
    conn.execute(
        "INSERT INTO audit_logs VALUES ('aud-1', 1, '2026-04-01T08:00:00Z', 'pto', 'CREATE', ?)",
        (json.dumps({"userFullName": "Инженер ПТО", "userRole": "PTO", "summary": "Создан стык 5"}),),
    )
    conn.commit()
    conn.close()


@pytest.mark.asyncio
async def test_sqlite_to_postgres_migration_readonly_quarantine_and_idempotency(tmp_path: Path) -> None:
    sqlite_path = tmp_path / "legacy_isolated.sqlite"
    quarantine_path = tmp_path / "quarantine_report.json"
    _create_isolated_legacy_sqlite(sqlite_path)
    before_sha256 = hashlib.sha256(sqlite_path.read_bytes()).hexdigest()

    fake_pg = _ExportMigrationFakeSession()

    # 1. Dry-run rolls back and commits nothing
    dry_report = await migrate_sqlite_to_postgres(
        sqlite_path,
        fake_pg,  # type: ignore[arg-type]
        quarantine_report_path=quarantine_path,
        dry_run=True,
    )
    assert dry_report.joints_inserted == 1
    assert fake_pg.rolled_back == 1
    assert fake_pg.committed == 0

    # Clear dry-run objects from fake memory to simulate rolled-back transaction
    fake_pg = _ExportMigrationFakeSession()

    # 2. Live migration inserts winning joint, quarantines duplicates, preserves SQLite unchanged
    report1 = await migrate_sqlite_to_postgres(
        sqlite_path,
        fake_pg,  # type: ignore[arg-type]
        quarantine_report_path=quarantine_path,
        dry_run=False,
    )
    after_sha256 = hashlib.sha256(sqlite_path.read_bytes()).hexdigest()
    assert before_sha256 == after_sha256  # Strictly read-only

    assert report1.users_inserted == 1
    assert report1.facilities_inserted == 1
    assert report1.lines_inserted == 1
    assert report1.lrv_inserted == 1
    assert report1.welders_inserted == 1
    assert report1.tech_cards_inserted == 1
    assert report1.materials_inserted == 1
    assert report1.joints_inserted == 1
    assert report1.templates_inserted == 1
    assert len(report1.quarantined_duplicates) == 2  # 1 historical + 1 live duplicate detected

    # Winning joint must be the newer version (j-new, version=3, Годен)
    migrated_joints = list(fake_pg.stores[WeldJoint].values())
    assert len(migrated_joints) == 1
    assert migrated_joints[0].legacy_id == "j-new"
    assert migrated_joints[0].version == 3
    assert migrated_joints[0].vik_result == ControlResultEnum.FIT

    # Quarantine report JSON & AuditLog entry written with full payload
    q_json = json.loads(quarantine_path.read_text(encoding="utf-8"))
    assert q_json["quarantined_duplicates_count"] == 2
    assert any(a.action == "MIGRATION_QUARANTINE" for a in fake_pg.audit_logs)

    # Strict role preserved (PIL, not PTO) & Argon2id password hashed
    migrated_user = next(iter(fake_pg.stores[User].values()))
    assert migrated_user.role == RoleEnum.PIL
    assert migrated_user.password_hash.startswith("$argon2")

    # 3. Re-running migration is 100% idempotent (0 new inserts, no errors)
    report2 = await migrate_sqlite_to_postgres(
        sqlite_path,
        fake_pg,  # type: ignore[arg-type]
        quarantine_report_path=quarantine_path,
        dry_run=False,
    )
    assert report2.users_inserted == 0
    assert report2.users_skipped == 1
    assert report2.lines_inserted == 0
    assert report2.lines_skipped == 1
    assert report2.joints_inserted == 0
    assert report2.joints_skipped == 1
    assert len(fake_pg.stores[WeldJoint]) == 1


@pytest.mark.asyncio
async def test_excel_templates_linelist_lrv_exports_and_parse_spreadsheet():
    db = _ExportMigrationFakeSession()
    now = datetime.now(timezone.utc)
    viewer = User(
        id=uuid.uuid4(),
        login="viewer_tpl",
        password_hash=hash_password("Pass123!"),
        full_name="Инженер ПТО",
        role=RoleEnum.PTO,
        department="ПТО",
        position_title="Инженер",
        session_number=1,
        is_active=True,
        must_change_password=False,
        version=1,
        created_at=now,
        updated_at=now,
    )
    db.add(viewer)

    fac_id = uuid.uuid4()
    line = ProjectLine(
        id=uuid.uuid4(),
        facility_id=fac_id,
        object_name="КС Северная",
        rd_code="0092.049-045.0077.01",
        line_number="L-10",
        unique_line_id="01-L-10",
        line_name="Линия 10",
        product="Газ",
        test_contour="К-1",
        welding_ntd="СТО Газпром 15-1.1-002-2023",
        control_ntd="СТО Газпром 15-1.1-002-2023",
        quality_level="A",
        pipeline_category="I",
        working_pressure="7.4",
        working_temperature="20",
        rk_percent=100.0,
        uzk_percent=0.0,
        pvk_percent=0.0,
        sort_order=1,
        version=1,
    )
    db.add(line)

    lrv_item = LrvItem(
        id=uuid.uuid4(),
        facility_id=fac_id,
        lrv_code="ЛРВ-101",
        category=LrvElementCategoryEnum.PIPE,
        short_name="Труба 219х8",
        diameter_mm=219.0,
        wall_thickness=8.0,
        material="09Г2С",
        ntd="ГОСТ 8732-78",
        unit=LrvUnitEnum.METER,
        spec_qty=120.0,
        rd_code="0092.049-045.0077.01",
        object_name="КС Северная",
        status=LrvStatusEnum.ACTIVE,
        sort_order=1,
        version=1,
    )
    db.add(lrv_item)

    app.dependency_overrides[get_db_session] = lambda: db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
            headers = _auth_header(viewer)

            # 1. Joints template XLSX
            res_tpl = await client.get(
                "/api/exports/joints-template.xlsx",
                params={"rd_code": "0092.049-045.0077.01", "line_number": "L-10"},
                headers=headers,
            )
            assert res_tpl.status_code == 200
            wb_tpl = load_workbook(BytesIO(res_tpl.content))
            assert "Шаблон импорта стыков" in wb_tpl.sheetnames

            # 2. LineList XLSX (template + data) and round-trip parse via /api/imports/parse-spreadsheet
            res_ll_tpl = await client.get(
                "/api/exports/linelist.xlsx",
                params={"template": "true"},
                headers=headers,
            )
            assert res_ll_tpl.status_code == 200

            res_ll = await client.get("/api/exports/linelist.xlsx", headers=headers)
            assert res_ll.status_code == 200
            wb_ll = load_workbook(BytesIO(res_ll.content))
            assert wb_ll["Проект (лайнлист)"].cell(row=2, column=3).value == "L-10"

            res_parse_ll = await client.post(
                "/api/imports/parse-spreadsheet",
                files={
                    "file": (
                        "linelist.xlsx",
                        res_ll.content,
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
                headers=headers,
            )
            assert res_parse_ll.status_code == 200
            parsed_rows = res_parse_ll.json()["rows"]
            assert len(parsed_rows) == 1
            assert parsed_rows[0]["Номер линии"] == "L-10"

            # 3. LRV XLSX (template + data) and CSV parsing
            res_lrv = await client.get("/api/exports/lrv.xlsx", headers=headers)
            assert res_lrv.status_code == 200
            wb_lrv = load_workbook(BytesIO(res_lrv.content))
            assert wb_lrv["Каталог ЛРВ"].cell(row=2, column=1).value == "ЛРВ-101"

            csv_bytes = "Код ЛРВ;Наименование\nЛРВ-202;Отвод 219х8\n".encode("utf-8")
            res_parse_csv = await client.post(
                "/api/imports/parse-spreadsheet",
                files={"file": ("lrv.csv", csv_bytes, "text/csv")},
                headers=headers,
            )
            assert res_parse_csv.status_code == 200
            csv_rows = res_parse_csv.json()["rows"]
            assert csv_rows == [{"Код ЛРВ": "ЛРВ-202", "Наименование": "Отвод 219х8"}]
    finally:
        app.dependency_overrides.clear()
