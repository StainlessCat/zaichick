from __future__ import annotations

import json
import secrets
import sqlite3
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.audit import AuditLog
from app.models.enums import (
    ControlResultEnum,
    ElementCombinationEnum,
    JointKindEnum,
    JointTypeEnum,
    LrvElementCategoryEnum,
    LrvStatusEnum,
    LrvUnitEnum,
    NdtMethodEnum,
    RoleEnum,
    WeldingMaterialStatusEnum,
    WeldingMaterialTypeEnum,
    WeldingTypeEnum,
)
from app.models.facility import CustomWeatherStation, Facility, FacilityRdCode
from app.models.joint import WeldJoint
from app.models.line import ProjectLine
from app.models.lrv import LrvItem
from app.models.settings import AppSetting, ColumnTemplate
from app.models.user import User
from app.models.welding_tech import (
    TechCard,
    TechCardPreheatRule,
    Welder,
    WelderNaksCert,
    WeldingMaterial,
)
from app.services.domain_validation import build_unique_line_id, parse_stamps
from app.services.pipe_calc import calculate_equivalent_dia_inch, mm_to_inch_diameter


@dataclass(slots=True)
class MigrationReport:
    sqlite_path: str
    dry_run: bool
    users_inserted: int = 0
    users_skipped: int = 0
    facilities_inserted: int = 0
    facilities_skipped: int = 0
    lines_inserted: int = 0
    lines_skipped: int = 0
    lrv_inserted: int = 0
    lrv_skipped: int = 0
    welders_inserted: int = 0
    welders_skipped: int = 0
    tech_cards_inserted: int = 0
    tech_cards_skipped: int = 0
    materials_inserted: int = 0
    materials_skipped: int = 0
    joints_inserted: int = 0
    joints_skipped: int = 0
    templates_inserted: int = 0
    audit_inserted: int = 0
    quarantined_duplicates: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sqlite_path": self.sqlite_path,
            "dry_run": self.dry_run,
            "users": {"inserted": self.users_inserted, "skipped": self.users_skipped},
            "facilities": {"inserted": self.facilities_inserted, "skipped": self.facilities_skipped},
            "lines": {"inserted": self.lines_inserted, "skipped": self.lines_skipped},
            "lrv": {"inserted": self.lrv_inserted, "skipped": self.lrv_skipped},
            "welders": {"inserted": self.welders_inserted, "skipped": self.welders_skipped},
            "tech_cards": {"inserted": self.tech_cards_inserted, "skipped": self.tech_cards_skipped},
            "materials": {"inserted": self.materials_inserted, "skipped": self.materials_skipped},
            "joints": {"inserted": self.joints_inserted, "skipped": self.joints_skipped},
            "templates_inserted": self.templates_inserted,
            "audit_inserted": self.audit_inserted,
            "quarantined_duplicates_count": len(self.quarantined_duplicates),
            "quarantined_duplicates": self.quarantined_duplicates,
            "warnings": self.warnings,
        }


def _open_sqlite_readonly(sqlite_path: Path) -> sqlite3.Connection:
    resolved = sqlite_path.resolve()
    if not resolved.exists():
        raise FileNotFoundError(f"SQLite database not found: {resolved}")
    uri = f"file:{resolved.as_posix()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name = ?", (table_name,)
    ).fetchone()
    return row is not None


def _safe_json(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if not raw:
        return {}
    try:
        parsed = json.loads(str(raw))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _parse_date(val: Any) -> date | None:
    if val is None or val == "":
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    s = str(val).strip()
    if not s or s.lower() in ("н/п", "-", "—"):
        return None
    for fmt in ("%Y-%m-%d", "%d.%m.%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            pass
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def _parse_datetime(val: Any) -> datetime:
    if isinstance(val, datetime):
        return val if val.tzinfo else val.replace(tzinfo=timezone.utc)
    s = str(val or "").strip()
    if s:
        try:
            dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def _parse_float(val: Any, default: float | None = 0.0) -> float | None:
    if val is None or val == "":
        return default
    if isinstance(val, (int, float)):
        return float(val)
    try:
        return float(str(val).strip().replace(",", "."))
    except ValueError:
        return default


def _parse_enum(enum_cls: type, val: Any, fallback: Any) -> Any:
    if val is None or val == "":
        return fallback
    s = str(val).strip()
    for item in enum_cls:
        if item.value == s or item.name == s.upper():
            return item
    return fallback


def _map_legacy_role(raw_role: Any, is_admin: bool = False) -> RoleEnum:
    if is_admin:
        return RoleEnum.ADMIN
    s = str(raw_role or "").strip().upper()
    mapping = {
        "ADMIN": RoleEnum.ADMIN,
        "АДМИНИСТРАТОР": RoleEnum.ADMIN,
        "АДМИНИСТРАТОР СИСТЕМЫ": RoleEnum.ADMIN,
        "СИСТЕМНЫЙ АДМИНИСТРАТОР (ПОЛНЫЙ ДОСТУП)": RoleEnum.ADMIN,
        "PTO": RoleEnum.PTO,
        "ПТО": RoleEnum.PTO,
        "ИНЖЕНЕР ПТО": RoleEnum.PTO,
        "OGS": RoleEnum.OGS,
        "ОГС": RoleEnum.OGS,
        "ТЕХНОЛОГ ПО СВАРКЕ (ОГС)": RoleEnum.OGS,
        "ТЕХНОЛОГ ПО СВАРКЕ (СЛУЖБА ГС)": RoleEnum.OGS,
        "PIL": RoleEnum.PIL,
        "ПИЛ": RoleEnum.PIL,
        "ЛНК": RoleEnum.PIL,
        "СПЕЦИАЛИСТ ЛНК": RoleEnum.PIL,
        "СПЕЦИАЛИСТ ЛНК / ПИЛ": RoleEnum.PIL,
        "VIEWER": RoleEnum.VIEWER,
        "НАБЛЮДАТЕЛЬ": RoleEnum.VIEWER,
        "ПРЕДСТАВИТЕЛЬ ЗАКАЗЧИКА": RoleEnum.VIEWER,
    }
    if s in mapping:
        return mapping[s]
    if "АДМИНИСТРАТОР" in s or "ADMIN" in s:
        return RoleEnum.ADMIN
    if "ТЕХНОЛОГ" in s or "ОГС" in s or "СЛУЖБА ГС" in s:
        return RoleEnum.OGS
    if "ЛНК" in s or "ПИЛ" in s:
        return RoleEnum.PIL
    if "ПТО" in s:
        return RoleEnum.PTO
    return RoleEnum.VIEWER


def _deterministic_uuid(namespace_key: str) -> uuid.UUID:
    return uuid.uuid5(uuid.NAMESPACE_URL, f"zaychick:{namespace_key}")


def _migrate_users(
    conn: sqlite3.Connection,
    session: AsyncSession,
    existing_logins: dict[str, User],
    report: MigrationReport,
    *,
    default_password: str | None,
) -> None:
    if not _table_exists(conn, "user_accounts"):
        return
    rows = conn.execute("SELECT login, sort_order, version, payload_json FROM user_accounts ORDER BY sort_order ASC").fetchall()
    now = datetime.now(timezone.utc)
    for row in rows:
        data = _safe_json(row["payload_json"])
        login = str(row["login"] or data.get("login") or "").strip()
        if not login:
            continue
        norm_login = login.lower()
        if norm_login in existing_logins:
            report.users_skipped += 1
            continue

        role = _map_legacy_role(data.get("role"), bool(data.get("isAdmin")))
        raw_pw = data.get("password") or ""
        raw_hash = data.get("passwordHash") or ""
        must_change = False
        if isinstance(raw_hash, str) and raw_hash.startswith("$argon2"):
            pw_hash = raw_hash
        elif isinstance(raw_pw, str) and raw_pw.startswith("$argon2"):
            pw_hash = raw_pw
        elif isinstance(raw_pw, str) and raw_pw and not raw_pw.startswith("$"):
            pw_hash = hash_password(raw_pw)
        else:
            fallback_pw = default_password or secrets.token_urlsafe(12)
            pw_hash = hash_password(fallback_pw)
            must_change = True

        user = User(
            id=_deterministic_uuid(f"user:{norm_login}"),
            login=login,
            password_hash=pw_hash,
            full_name=str(data.get("fullName") or login).strip(),
            role=role,
            department=str(data.get("department") or "").strip(),
            position_title=str(data.get("position") or role.value).strip(),
            session_number=max(1, int(data.get("sessionNumber") or 1)),
            is_active=True,
            must_change_password=must_change,
            version=max(1, int(row["version"] or 1)),
            created_at=now,
            updated_at=now,
        )
        session.add(user)
        existing_logins[norm_login] = user
        report.users_inserted += 1


def _ensure_facility(
    name: str,
    *,
    session: AsyncSession,
    fac_by_name: dict[str, Facility],
    report: MigrationReport,
    payload: dict[str, Any] | None = None,
    version: int = 1,
) -> Facility:
    clean_name = name.strip() or "Объект по умолчанию"
    if clean_name in fac_by_name:
        return fac_by_name[clean_name]

    p = payload or {}
    now = datetime.now(timezone.utc)
    fac_id = _deterministic_uuid(f"facility:{clean_name}")
    fac = Facility(
        id=fac_id,
        external_id=str(p.get("id") or "")[:64] or None,
        name=clean_name,
        short_name=str(p.get("shortName") or clean_name[:32]).strip(),
        region=str(p.get("region") or "").strip(),
        latitude=_parse_float(p.get("lat"), None),
        longitude=_parse_float(p.get("lon"), None),
        weather_station=p.get("weatherStation"),
        weather_station_id=p.get("weatherStationId"),
        weather_station_distance_km=_parse_float(p.get("weatherStationDistanceKm"), None),
        weather_station_source=p.get("weatherStationSource"),
        weather_last_check_status=p.get("weatherLastCheckStatus"),
        weather_last_error_message=p.get("weatherLastErrorMessage"),
        weather_archive=p.get("weatherArchive") if isinstance(p.get("weatherArchive"), dict) else {},
        weather_observations=p.get("weatherObservations") if isinstance(p.get("weatherObservations"), dict) else {},
        version=max(1, int(version or 1)),
        created_at=now,
        updated_at=now,
    )
    fac.rd_codes = [
        FacilityRdCode(
            id=_deterministic_uuid(f"fac_rd:{clean_name}:{rd.get('code')}"),
            facility_id=fac_id,
            code=str(rd.get("code") or "").strip(),
            title=str(rd.get("title") or "").strip(),
            contours=list(rd.get("contours") or []),
        )
        for rd in (p.get("rdCodes") or [])
        if isinstance(rd, dict) and str(rd.get("code") or "").strip()
    ]
    fac.custom_weather_stations = [
        CustomWeatherStation(
            id=_deterministic_uuid(f"fac_ws:{clean_name}:{st.get('code')}"),
            facility_id=fac_id,
            station_code=str(st.get("code") or f"WS-{idx}"),
            name=str(st.get("name") or "АМК"),
            region=str(st.get("region") or ""),
            latitude=float(st.get("lat") or 0.0),
            longitude=float(st.get("lon") or 0.0),
            elevation_m=_parse_float(st.get("elevationM"), None),
            device_model=st.get("deviceModel"),
            verification_cert_number=st.get("verificationCertNumber"),
            verification_valid_until=_parse_date(st.get("verificationValidUntil")),
            is_verified=bool(st.get("isVerified")),
            source=str(st.get("source") or "custom"),
            created_at=now,
        )
        for idx, st in enumerate(p.get("customWeatherStations") or [], start=1)
        if isinstance(st, dict)
    ]
    session.add(fac)
    fac_by_name[clean_name] = fac
    report.facilities_inserted += 1
    return fac


def _migrate_facilities(
    conn: sqlite3.Connection,
    session: AsyncSession,
    fac_by_name: dict[str, Facility],
    report: MigrationReport,
) -> None:
    if not _table_exists(conn, "facility_geo"):
        return
    rows = conn.execute("SELECT object_name, version, payload_json FROM facility_geo").fetchall()
    for row in rows:
        name = str(row["object_name"] or "").strip()
        if not name:
            continue
        if name in fac_by_name:
            report.facilities_skipped += 1
            continue
        _ensure_facility(
            name,
            session=session,
            fac_by_name=fac_by_name,
            report=report,
            payload=_safe_json(row["payload_json"]),
            version=int(row["version"] or 1),
        )


def _migrate_lines(
    conn: sqlite3.Connection,
    session: AsyncSession,
    fac_by_name: dict[str, Facility],
    lines_by_uid: dict[str, ProjectLine],
    report: MigrationReport,
) -> None:
    if not _table_exists(conn, "project_linelist"):
        return
    rows = conn.execute(
        "SELECT id, sort_order, unique_line_id, rd_code, object_name, version, payload_json FROM project_linelist ORDER BY sort_order ASC"
    ).fetchall()
    now = datetime.now(timezone.utc)
    for row in rows:
        p = _safe_json(row["payload_json"])
        rd_code = str(row["rd_code"] or p.get("rdCode") or "").strip()
        line_number = str(p.get("lineNumber") or "").strip()
        uid_str = str(row["unique_line_id"] or p.get("uniqueLineId") or build_unique_line_id(rd_code, line_number)).strip()
        if not uid_str:
            continue
        if uid_str in lines_by_uid:
            report.lines_skipped += 1
            continue

        obj_name = str(row["object_name"] or p.get("objectName") or "").strip()
        fac = _ensure_facility(obj_name, session=session, fac_by_name=fac_by_name, report=report)
        line = ProjectLine(
            id=_deterministic_uuid(f"line:{uid_str}"),
            legacy_id=str(row["id"] or p.get("id") or "")[:128] or None,
            facility_id=fac.id,
            object_name=fac.name,
            rd_code=rd_code,
            line_number=line_number or uid_str,
            unique_line_id=uid_str,
            line_name=str(p.get("lineName") or ""),
            product=str(p.get("product") or ""),
            test_contour=str(p.get("testContour") or ""),
            welding_ntd=str(p.get("weldingNtd") or "СТО Газпром 15-1.1-002-2023"),
            control_ntd=str(p.get("controlNtd") or "СТО Газпром 15-1.1-002-2023"),
            quality_level=str(p.get("qualityLevel") or ""),
            pipeline_category=str(p.get("pipelineCategory") or ""),
            working_pressure=str(p.get("workingPressure") or ""),
            working_temperature=str(p.get("workingTemperature") or ""),
            rk_percent=float(_parse_float(p.get("rkPercent"), 0.0) or 0.0),
            uzk_percent=float(_parse_float(p.get("uzkPercent"), 0.0) or 0.0),
            pvk_percent=float(_parse_float(p.get("pvkPercent"), 0.0) or 0.0),
            manual_status=p.get("manualStatus"),
            test_date=_parse_date(p.get("testDate")),
            sort_order=int(row["sort_order"] or 0),
            version=max(1, int(row["version"] or 1)),
            created_at=now,
            updated_at=now,
        )
        session.add(line)
        lines_by_uid[uid_str] = line
        report.lines_inserted += 1


def _migrate_lrv(
    conn: sqlite3.Connection,
    session: AsyncSession,
    fac_by_name: dict[str, Facility],
    lrv_by_key: dict[tuple[str, str], LrvItem],
    report: MigrationReport,
) -> None:
    if not _table_exists(conn, "lrv_catalog"):
        return
    rows = conn.execute(
        "SELECT id, sort_order, lrv_code, rd_code, object_name, version, payload_json FROM lrv_catalog ORDER BY sort_order ASC"
    ).fetchall()
    now = datetime.now(timezone.utc)
    for row in rows:
        p = _safe_json(row["payload_json"])
        rd_code = str(row["rd_code"] or p.get("rdCode") or "").strip()
        lrv_code = str(row["lrv_code"] or p.get("lrvCode") or "").strip()
        if not rd_code or not lrv_code:
            continue
        key = (rd_code, lrv_code)
        if key in lrv_by_key:
            report.lrv_skipped += 1
            continue

        obj_name = str(row["object_name"] or p.get("objectName") or "").strip()
        fac = _ensure_facility(obj_name, session=session, fac_by_name=fac_by_name, report=report)
        item = LrvItem(
            id=_deterministic_uuid(f"lrv:{rd_code}:{lrv_code}"),
            legacy_id=str(row["id"] or p.get("id") or "")[:128] or None,
            facility_id=fac.id,
            lrv_code=lrv_code,
            rd_code=rd_code,
            object_name=fac.name,
            short_name=str(p.get("shortName") or lrv_code).strip(),
            category=_parse_enum(LrvElementCategoryEnum, p.get("category"), None) if p.get("category") else None,
            connection_type=p.get("connectionType"),
            material=str(p.get("material") or ""),
            ntd=str(p.get("ntd") or ""),
            manufacturer=p.get("manufacturer"),
            dn1=int(p["dn1"]) if p.get("dn1") is not None else None,
            diameter_mm=float(_parse_float(p.get("diameterMm"), 0.0) or 0.0),
            wall_thickness=float(_parse_float(p.get("wallThickness"), 0.0) or 0.0),
            dn2=int(p["dn2"]) if p.get("dn2") is not None else None,
            diameter_mm2=_parse_float(p.get("diameterMm2"), None),
            wall_thickness2=_parse_float(p.get("wallThickness2"), None),
            spec_qty=float(_parse_float(p.get("specQty"), 0.0) or 0.0),
            unit=_parse_enum(LrvUnitEnum, p.get("unit"), LrvUnitEnum.PCS),
            status=_parse_enum(LrvStatusEnum, p.get("status"), LrvStatusEnum.ACTIVE),
            replacement_letter=p.get("replacementLetter"),
            replacement_date=_parse_date(p.get("replacementDate")),
            sort_order=int(row["sort_order"] or 0),
            version=max(1, int(row["version"] or 1)),
            created_at=now,
            updated_at=now,
        )
        session.add(item)
        lrv_by_key[key] = item
        report.lrv_inserted += 1


def _migrate_welding_tech(
    conn: sqlite3.Connection,
    session: AsyncSession,
    welders_by_stamp: dict[str, Welder],
    tc_by_num: dict[str, TechCard],
    materials_by_legacy: dict[str, WeldingMaterial],
    report: MigrationReport,
) -> None:
    now = datetime.now(timezone.utc)
    if _table_exists(conn, "welders"):
        for row in conn.execute("SELECT stamp, sort_order, version, payload_json FROM welders ORDER BY sort_order ASC").fetchall():
            p = _safe_json(row["payload_json"])
            stamp = str(row["stamp"] or p.get("stamp") or "").strip()
            if not stamp:
                continue
            if stamp in welders_by_stamp:
                report.welders_skipped += 1
                continue
            w_id = _deterministic_uuid(f"welder:{stamp}")
            certs = [
                WelderNaksCert(
                    id=_deterministic_uuid(f"welder_cert:{stamp}:{idx}"),
                    welder_id=w_id,
                    welding_type=_parse_enum(WeldingTypeEnum, c.get("weldingType"), WeldingTypeEnum.RAD),
                    cert_number=str(c.get("certNumber") or "н/д"),
                    issue_date=_parse_date(c.get("issueDate")),
                    expiry_date=_parse_date(c.get("expiryDate")),
                    admission_sheet_number=c.get("admissionSheetNumber"),
                    admission_sheet_date=_parse_date(c.get("admissionSheetDate")),
                    min_diameter_mm=_parse_float(c.get("minDiameterMm"), None),
                    max_diameter_mm=_parse_float(c.get("maxDiameterMm"), None),
                    min_wall_thickness_mm=_parse_float(c.get("minWallThicknessMm"), None),
                    max_wall_thickness_mm=_parse_float(c.get("maxWallThicknessMm"), None),
                    steel_groups=list(c.get("steelGroups") or []) if c.get("steelGroups") else None,
                )
                for idx, c in enumerate(p.get("naksCerts") or [], start=1)
                if isinstance(c, dict)
            ]
            welder = Welder(
                id=w_id,
                legacy_id=str(p.get("id") or "")[:128] or None,
                stamp=stamp,
                is_brigade=bool(p.get("isBrigade")),
                brigade_members=list(p.get("brigadeMembers") or []) if p.get("brigadeMembers") else None,
                full_name=str(p.get("fullName") or stamp),
                cert_number=str(p.get("certNumber") or ""),
                cert_issue_date=_parse_date(p.get("certIssueDate")),
                cert_expiry_date=_parse_date(p.get("certExpiryDate")),
                attestation_area=p.get("attestationArea"),
                admission_sheet_number=p.get("admissionSheetNumber"),
                admission_sheet_date=_parse_date(p.get("admissionSheetDate")),
                allowed_methods=[str(m) for m in (p.get("allowedMethods") or [])],
                crew_foreman=str(p.get("crewForeman") or ""),
                steel_groups=list(p.get("steelGroups") or []) if p.get("steelGroups") else None,
                min_diameter_mm=_parse_float(p.get("minDiameterMm"), None),
                max_diameter_mm=_parse_float(p.get("maxDiameterMm"), None),
                min_wall_thickness_mm=_parse_float(p.get("minWallThicknessMm"), None),
                max_wall_thickness_mm=_parse_float(p.get("maxWallThicknessMm"), None),
                sort_order=int(row["sort_order"] or 0),
                version=max(1, int(row["version"] or 1)),
                naks_certs=certs,
                created_at=now,
                updated_at=now,
            )
            session.add(welder)
            welders_by_stamp[stamp] = welder
            report.welders_inserted += 1

    if _table_exists(conn, "tech_cards"):
        for row in conn.execute("SELECT id, sort_order, number, version, payload_json FROM tech_cards ORDER BY sort_order ASC").fetchall():
            p = _safe_json(row["payload_json"])
            number = str(row["number"] or p.get("number") or "").strip()
            if not number:
                continue
            if number in tc_by_num:
                report.tech_cards_skipped += 1
                continue
            tc_id = _deterministic_uuid(f"tc:{number}")
            rules = [
                TechCardPreheatRule(
                    id=_deterministic_uuid(f"tc_rule:{number}:{idx}"),
                    tech_card_id=tc_id,
                    ambient_min_c=float(_parse_float(r.get("ambientMinC"), -60.0) or -60.0),
                    ambient_max_c=float(_parse_float(r.get("ambientMaxC"), 45.0) or 45.0),
                    min_preheat_temp_c=float(_parse_float(r.get("minPreheatTempC"), 0.0) or 0.0),
                    condition_label=str(r.get("conditionLabel") or "По ТК"),
                )
                for idx, r in enumerate(p.get("preheatRules") or [], start=1)
                if isinstance(r, dict)
            ]
            tc = TechCard(
                id=tc_id,
                legacy_id=str(row["id"] or p.get("id") or "")[:128] or None,
                number=number,
                title=str(p.get("title") or number),
                welding_type=_parse_enum(WeldingTypeEnum, p.get("weldingType"), WeldingTypeEnum.RAD),
                joint_kind=_parse_enum(JointKindEnum, p.get("jointKind"), JointKindEnum.BUTT),
                element_combination=_parse_enum(
                    ElementCombinationEnum, p.get("elementCombination"), ElementCombinationEnum.PIPE_PIPE
                ),
                ntd=str(p.get("ntd") or "СТО Газпром 15-1.1-002-2023"),
                steel_group=str(p.get("steelGroup") or ""),
                min_diameter_mm=float(_parse_float(p.get("minDiameterMm"), 0.0) or 0.0),
                max_diameter_mm=float(_parse_float(p.get("maxDiameterMm"), 9999.0) or 9999.0),
                min_wall_thickness_mm=float(_parse_float(p.get("minWallThicknessMm"), 0.0) or 0.0),
                max_wall_thickness_mm=float(_parse_float(p.get("maxWallThicknessMm"), 999.0) or 999.0),
                recommended_materials=str(p.get("recommendedMaterials") or ""),
                sort_order=int(row["sort_order"] or 0),
                version=max(1, int(row["version"] or 1)),
                preheat_rules=rules,
                created_at=now,
                updated_at=now,
            )
            session.add(tc)
            tc_by_num[number] = tc
            report.tech_cards_inserted += 1

    if _table_exists(conn, "welding_materials"):
        for row in conn.execute("SELECT id, sort_order, version, payload_json FROM welding_materials ORDER BY sort_order ASC").fetchall():
            p = _safe_json(row["payload_json"])
            leg_id = str(row["id"] or p.get("id") or "").strip()
            if not leg_id:
                continue
            if leg_id in materials_by_legacy:
                report.materials_skipped += 1
                continue
            mat = WeldingMaterial(
                id=_deterministic_uuid(f"mat:{leg_id}"),
                legacy_id=leg_id[:128],
                brand_and_diameter=str(p.get("brandAndDiameter") or leg_id),
                material_type=_parse_enum(WeldingMaterialTypeEnum, p.get("type"), WeldingMaterialTypeEnum.WIRE),
                welding_method=_parse_enum(WeldingTypeEnum, p.get("weldingMethod"), WeldingTypeEnum.RAD),
                batch_number=str(p.get("batchNumber") or ""),
                certificate_number=str(p.get("certificateNumber") or ""),
                incoming_control_act=str(p.get("incomingControlAct") or ""),
                incoming_control_date=_parse_date(p.get("incomingControlDate")),
                status=_parse_enum(WeldingMaterialStatusEnum, p.get("status"), WeldingMaterialStatusEnum.ADMITTED),
                sort_order=int(row["sort_order"] or 0),
                version=max(1, int(row["version"] or 1)),
                created_at=now,
                updated_at=now,
            )
            session.add(mat)
            materials_by_legacy[leg_id] = mat
            report.materials_inserted += 1


def _migrate_joints_with_quarantine(
    conn: sqlite3.Connection,
    session: AsyncSession,
    fac_by_name: dict[str, Facility],
    lines_by_uid: dict[str, ProjectLine],
    lrv_by_key: dict[tuple[str, str], LrvItem],
    tc_by_num: dict[str, TechCard],
    existing_joint_keys: set[tuple[uuid.UUID, str]],
    existing_legacy_ids: set[str],
    report: MigrationReport,
) -> None:
    now = datetime.now(timezone.utc)

    # First preserve any already-quarantined legacy duplicate records in report
    if _table_exists(conn, "duplicate_joints_quarantine"):
        q_rows = conn.execute(
            "SELECT quarantine_id, original_joint_id, kept_joint_id, normalized_unique_line_id, "
            "normalized_joint_number, reason, quarantined_at, payload_json FROM duplicate_joints_quarantine"
        ).fetchall()
        for q in q_rows:
            report.quarantined_duplicates.append(
                {
                    "source": "sqlite_duplicate_joints_quarantine",
                    "quarantine_id": q["quarantine_id"],
                    "original_joint_id": q["original_joint_id"],
                    "kept_joint_id": q["kept_joint_id"],
                    "unique_line_id": q["normalized_unique_line_id"],
                    "joint_number": q["normalized_joint_number"],
                    "reason": q["reason"],
                    "quarantined_at": q["quarantined_at"],
                    "payload": _safe_json(q["payload_json"]),
                }
            )

    if not _table_exists(conn, "weld_joints"):
        return

    rows = conn.execute(
        "SELECT id, sort_order, joint_number, unique_line_id, rd_code, object_name, "
        "version, updated_at, updated_by, payload_json FROM weld_joints ORDER BY sort_order ASC"
    ).fetchall()

    # Group by normalized (unique_line_id, joint_number) choosing latest by (updated_at, version, id)
    grouped: dict[tuple[str, str], list[sqlite3.Row]] = {}
    for row in rows:
        p = _safe_json(row["payload_json"])
        uid = str(row["unique_line_id"] or p.get("uniqueLineId") or "").strip()
        jnum = str(row["joint_number"] or p.get("jointNumber") or "").strip()
        if not uid or not jnum:
            continue
        grouped.setdefault((uid.lower(), jnum.lower()), []).append(row)

    for (norm_uid, norm_jnum), candidates in grouped.items():
        candidates_sorted = sorted(
            candidates,
            key=lambda r: (str(r["updated_at"] or ""), int(r["version"] or 1), str(r["id"] or "")),
            reverse=True,
        )
        winner = candidates_sorted[0]
        p = _safe_json(winner["payload_json"])
        winner_legacy_id = str(winner["id"] or p.get("id") or "").strip()

        uid = str(winner["unique_line_id"] or p.get("uniqueLineId") or "").strip()
        rd_code = str(winner["rd_code"] or p.get("rdCode") or "").strip()
        obj_name = str(winner["object_name"] or p.get("objectName") or "").strip()
        line_num = str(p.get("lineNumber") or uid).strip()
        fac = _ensure_facility(obj_name, session=session, fac_by_name=fac_by_name, report=report)

        if uid not in lines_by_uid:
            # Auto-create missing ProjectLine so relational FK never drops historical joints
            auto_line = ProjectLine(
                id=_deterministic_uuid(f"line:{uid}"),
                facility_id=fac.id,
                object_name=fac.name,
                rd_code=rd_code or "LEGACY-RD",
                line_number=line_num,
                unique_line_id=uid,
                line_name=f"Авто-линия из миграции ({uid})",
                product="",
                test_contour=str(p.get("contour") or ""),
                welding_ntd="СТО Газпром 15-1.1-002-2023",
                control_ntd="СТО Газпром 15-1.1-002-2023",
                quality_level="",
                pipeline_category="",
                working_pressure="",
                working_temperature="",
                rk_percent=100.0,
                uzk_percent=0.0,
                pvk_percent=0.0,
                sort_order=0,
                version=1,
                created_at=now,
                updated_at=now,
            )
            session.add(auto_line)
            lines_by_uid[uid] = auto_line
            report.lines_inserted += 1
            report.warnings.append(f"Создана недостающая линия лайнлиста '{uid}' для сохранения стыков при миграции.")

        line = lines_by_uid[uid]
        # Record extra duplicates found in weld_joints to quarantine (never delete silently)
        for dup in candidates_sorted[1:]:
            dup_id = str(dup["id"])
            report.quarantined_duplicates.append(
                {
                    "source": "weld_joints_duplicate_detected",
                    "original_joint_id": dup_id,
                    "kept_joint_id": winner_legacy_id,
                    "unique_line_id": uid,
                    "joint_number": str(dup["joint_number"] or ""),
                    "reason": "Дубликат пары (unique_line_id, joint_number) при миграции в PostgreSQL; сохранена более свежая запись.",
                    "quarantined_at": now.isoformat(),
                    "payload": _safe_json(dup["payload_json"]),
                }
            )

        if (line.id, norm_jnum) in existing_joint_keys or (winner_legacy_id and winner_legacy_id in existing_legacy_ids):
            report.joints_skipped += 1
            continue

        diam_mm = float(_parse_float(p.get("diameterMm"), 0.0) or 0.0)
        wall_mm = float(_parse_float(p.get("wallThickness"), 0.0) or 0.0)
        diam_in = str(p.get("diameterInch") or mm_to_inch_diameter(diam_mm)).strip()
        equiv_in = _parse_float(p.get("equivDiameterInch"), None)
        if equiv_in is None and diam_mm > 0:
            equiv_in = calculate_equivalent_dia_inch(diam_in or diam_mm, wall_mm)

        lrv1_code = str(p.get("lrv1Code") or "").strip()
        lrv2_code = str(p.get("lrv2Code") or "").strip()
        lrv1_item = lrv_by_key.get((rd_code, lrv1_code))
        lrv2_item = lrv_by_key.get((rd_code, lrv2_code))
        tc_num = str(p.get("techCardNumber") or "").strip()
        tc = tc_by_num.get(tc_num)

        w_stamp = str(p.get("welderStamp") or "").strip()
        stamps_list = p.get("welderStampsList") or parse_stamps(w_stamp, None) or None

        joint = WeldJoint(
            id=_deterministic_uuid(f"joint:{uid}:{norm_jnum}"),
            legacy_id=winner_legacy_id[:128] or None,
            line_id=line.id,
            facility_id=fac.id,
            lrv1_item_id=lrv1_item.id if lrv1_item else None,
            lrv2_item_id=lrv2_item.id if lrv2_item else None,
            tech_card_id=tc.id if tc else None,
            object_name=fac.name,
            rd_code=rd_code or line.rd_code,
            contour=str(p.get("contour") or line.test_contour),
            line_number=line_num,
            unique_line_id=uid,
            joint_number=str(winner["joint_number"] or p.get("jointNumber") or "").strip(),
            is_supplementary=bool(p.get("isSupplementary")),
            joint_kind=_parse_enum(JointKindEnum, p.get("jointKind"), JointKindEnum.BUTT),
            joint_type=_parse_enum(JointTypeEnum, p.get("jointType"), JointTypeEnum.MOUNTING),
            diameter_mm=diam_mm,
            diameter_inch=diam_in,
            equiv_diameter_inch=equiv_in,
            wall_thickness=wall_mm,
            lrv1_code=lrv1_code,
            elem1_name=str(p.get("elem1Name") or ""),
            elem1_material=str(p.get("elem1Material") or ""),
            elem1_ntd=str(p.get("elem1Ntd") or ""),
            elem1_diameter_mm=_parse_float(p.get("elem1DiameterMm"), None),
            elem1_wall_thickness=_parse_float(p.get("elem1WallThickness"), None),
            elem1_factory_number=p.get("elem1FactoryNumber"),
            elem1_manufacturer=p.get("elem1Manufacturer"),
            elem1_length=str(p["elem1Length"]) if p.get("elem1Length") is not None else None,
            elem1_cert_number=p.get("elem1CertNumber"),
            elem1_heat_number=p.get("elem1HeatNumber"),
            elem1_batch_number=p.get("elem1BatchNumber"),
            lrv2_code=lrv2_code,
            elem2_name=str(p.get("elem2Name") or ""),
            elem2_material=str(p.get("elem2Material") or ""),
            elem2_ntd=str(p.get("elem2Ntd") or ""),
            elem2_diameter_mm=_parse_float(p.get("elem2DiameterMm"), None),
            elem2_wall_thickness=_parse_float(p.get("elem2WallThickness"), None),
            elem2_factory_number=p.get("elem2FactoryNumber"),
            elem2_manufacturer=p.get("elem2Manufacturer"),
            elem2_length=str(p["elem2Length"]) if p.get("elem2Length") is not None else None,
            elem2_cert_number=p.get("elem2CertNumber"),
            elem2_heat_number=p.get("elem2HeatNumber"),
            elem2_batch_number=p.get("elem2BatchNumber"),
            welding_type=str(p.get("weldingType") or ""),
            gost_joint_type=p.get("gostJointType"),
            welding_position=p.get("weldingPosition"),
            welding_date=_parse_date(p.get("weldingDate")),
            welder_stamp=w_stamp,
            welder_stamps_list=list(stamps_list) if stamps_list else None,
            brigade_stamp=p.get("brigadeStamp"),
            welding_materials=str(p.get("weldingMaterials") or ""),
            ambient_temp_c=_parse_float(p.get("ambientTemp"), None),
            weather_source=p.get("weatherSource"),
            preheat_temp=str(p["preheatTemp"]) if p.get("preheatTemp") is not None else None,
            responsible_person=str(p.get("responsiblePerson") or ""),
            welder_full_name=str(p.get("welderFullName") or ""),
            welder_cert_number=str(p.get("welderCertNumber") or ""),
            tech_card_number=tc_num,
            vik_result=_parse_enum(ControlResultEnum, p.get("vikResult"), ControlResultEnum.NOT_CONDUCTED),
            vik_date=_parse_date(p.get("vikDate")),
            vik_inspector=str(p.get("vikInspector") or ""),
            vik_report_number=p.get("vikReportNumber"),
            ndt_type=_parse_enum(NdtMethodEnum, p.get("ndtType"), NdtMethodEnum.NOT_REQUIRED),
            ndt_date=_parse_date(p.get("ndtDate")),
            ndt_result=_parse_enum(ControlResultEnum, p.get("ndtResult"), ControlResultEnum.NOT_CONDUCTED),
            ndt_inspector=str(p.get("ndtInspector") or ""),
            ndt_report_number=p.get("ndtReportNumber"),
            dup_ndt_type=_parse_enum(NdtMethodEnum, p.get("dupNdtType"), NdtMethodEnum.NOT_REQUIRED),
            dup_ndt_date=_parse_date(p.get("dupNdtDate")),
            dup_ndt_result=_parse_enum(ControlResultEnum, p.get("dupNdtResult"), ControlResultEnum.NOT_CONDUCTED),
            dup_ndt_inspector=str(p.get("dupNdtInspector") or ""),
            dup_ndt_report_number=p.get("dupNdtReportNumber"),
            root_weld_control=p.get("rootWeldControl"),
            steeloscopy_info=p.get("steeloscopyInfo"),
            heat_treat_operator=p.get("heatTreatOperator"),
            heat_treat_diagram_number=p.get("heatTreatDiagramNumber"),
            hardness_test_info=p.get("hardnessTestInfo"),
            ferrite_phase_info=p.get("ferritePhaseInfo"),
            repair_action=p.get("repairAction"),
            repair_date=_parse_date(p.get("repairDate")),
            repair_tech_card=p.get("repairTechCard"),
            repair_welder_stamp=p.get("repairWelderStamp"),
            repair_foreman=p.get("repairForeman"),
            repair_length_mm=_parse_float(p.get("repairLengthMm"), None),
            repair_defect_type=p.get("repairDefectType"),
            repair_count=max(0, int(p.get("repairCount") or 0)),
            repair_vik_number=p.get("repairVikNumber"),
            repair_vik_date=_parse_date(p.get("repairVikDate")),
            repair_vik_result=_parse_enum(ControlResultEnum, p.get("repairVikResult"), None)
            if p.get("repairVikResult")
            else None,
            repair_vik_inspector=p.get("repairVikInspector"),
            repair_ndt_type=_parse_enum(NdtMethodEnum, p.get("repairNdtType"), None)
            if p.get("repairNdtType")
            else None,
            repair_ndt_number=p.get("repairNdtNumber"),
            repair_ndt_date=_parse_date(p.get("repairNdtDate")),
            repair_ndt_result=_parse_enum(ControlResultEnum, p.get("repairNdtResult"), None)
            if p.get("repairNdtResult")
            else None,
            repair_ndt_inspector=p.get("repairNdtInspector"),
            repair_dup_ndt_type=_parse_enum(NdtMethodEnum, p.get("repairDupNdtType"), None)
            if p.get("repairDupNdtType")
            else None,
            repair_dup_ndt_number=p.get("repairDupNdtNumber"),
            repair_dup_ndt_date=_parse_date(p.get("repairDupNdtDate")),
            repair_dup_ndt_result=_parse_enum(ControlResultEnum, p.get("repairDupNdtResult"), None)
            if p.get("repairDupNdtResult")
            else None,
            repair_dup_ndt_inspector=p.get("repairDupNdtInspector"),
            sort_order=int(winner["sort_order"] or 0),
            version=max(1, int(winner["version"] or 1)),
            updated_by=str(winner["updated_by"] or p.get("updatedBy") or "sqlite_migration"),
            created_at=_parse_datetime(winner["updated_at"]),
            updated_at=_parse_datetime(winner["updated_at"]),
        )
        session.add(joint)
        existing_joint_keys.add((line.id, norm_jnum))
        if winner_legacy_id:
            existing_legacy_ids.add(winner_legacy_id)
        report.joints_inserted += 1


def _migrate_templates_and_audit(
    conn: sqlite3.Connection,
    session: AsyncSession,
    existing_template_ids: set[str],
    existing_audit_ids: set[uuid.UUID],
    report: MigrationReport,
) -> None:
    now = datetime.now(timezone.utc)
    if _table_exists(conn, "db_meta"):
        meta = conn.execute("SELECT templates_json, active_template_id FROM db_meta WHERE id = 1").fetchone()
        if meta:
            try:
                tpls = json.loads(meta["templates_json"] or "[]")
            except Exception:
                tpls = []
            for tpl in tpls:
                if not isinstance(tpl, dict):
                    continue
                tpl_id = str(tpl.get("id") or "").strip()
                if not tpl_id or tpl_id in existing_template_ids:
                    continue
                session.add(
                    ColumnTemplate(
                        id=tpl_id[:64],
                        name=str(tpl.get("name") or tpl_id),
                        description=str(tpl.get("description") or ""),
                        is_system=bool(tpl.get("isSystem")),
                        column_order=list(tpl.get("columnOrder") or []),
                        visible_columns=list(tpl.get("visibleColumns") or []),
                        custom_widths=tpl.get("customWidths"),
                        is_active_default=(tpl_id == meta["active_template_id"]),
                        created_at=now,
                        updated_at=now,
                    )
                )
                existing_template_ids.add(tpl_id)
                report.templates_inserted += 1

            active_id = str(meta["active_template_id"] or "").strip()
            if active_id:
                session.add(AppSetting(key="active_template_id", value_json={"template_id": active_id}, updated_at=now))

    if _table_exists(conn, "audit_logs"):
        rows = conn.execute(
            "SELECT id, timestamp, user_login, operation_type, payload_json FROM audit_logs"
        ).fetchall()
        for row in rows:
            leg_id = str(row["id"] or "").strip()
            audit_uuid = _deterministic_uuid(f"audit:{leg_id}")
            if audit_uuid in existing_audit_ids:
                continue
            p = _safe_json(row["payload_json"])
            session.add(
                AuditLog(
                    id=audit_uuid,
                    timestamp=_parse_datetime(row["timestamp"]),
                    user_login=str(row["user_login"] or "legacy")[:64],
                    user_full_name=str(p.get("userFullName") or row["user_login"] or "")[:255],
                    user_role=str(p.get("userRole") or "LEGACY")[:32],
                    action=str(row["operation_type"] or p.get("operationType") or "LEGACY")[:64],
                    entity_type="legacy_audit",
                    entity_id=str(p.get("entityId") or leg_id)[:128],
                    joint_number=(
                        str(p["jointNumber"])[:64] if p.get("jointNumber") is not None else None
                    ),
                    unique_line_id=(
                        str(p["uniqueLineId"])[:255] if p.get("uniqueLineId") is not None else None
                    ),
                    rd_code=str(p["rdCode"])[:255] if p.get("rdCode") is not None else None,
                    summary=str(p.get("summary") or "")[:500] or None,
                    old_data=p.get("oldData") if isinstance(p.get("oldData"), dict) else None,
                    new_data=p.get("newData") if isinstance(p.get("newData"), dict) else None,
                )
            )
            existing_audit_ids.add(audit_uuid)
            report.audit_inserted += 1


async def migrate_sqlite_to_postgres(
    sqlite_path: Path,
    session: AsyncSession,
    *,
    quarantine_report_path: Path | None = None,
    dry_run: bool = False,
    default_password: str | None = None,
) -> MigrationReport:
    """
    Idempotent, read-only SQLite -> PostgreSQL migrator.
    Never modifies the source SQLite file; quarantines duplicate joints with full payload preservation.
    """
    report = MigrationReport(sqlite_path=str(sqlite_path.resolve()), dry_run=dry_run)
    conn = _open_sqlite_readonly(sqlite_path)
    try:
        existing_users = {
            u.login.strip().lower(): u
            for u in (await session.execute(select(User))).scalars().all()
        }
        fac_by_name = {
            f.name: f
            for f in (await session.execute(select(Facility))).scalars().all()
        }
        lines_by_uid = {
            ln.unique_line_id: ln
            for ln in (await session.execute(select(ProjectLine))).scalars().all()
        }
        lrv_by_key = {
            (i.rd_code, i.lrv_code): i
            for i in (await session.execute(select(LrvItem))).scalars().all()
        }
        welders_by_stamp = {
            w.stamp: w
            for w in (await session.execute(select(Welder))).scalars().all()
        }
        tc_by_num = {
            tc.number: tc
            for tc in (await session.execute(select(TechCard))).scalars().all()
        }
        materials_by_legacy = {
            (m.legacy_id or str(m.id)): m
            for m in (await session.execute(select(WeldingMaterial))).scalars().all()
        }
        existing_joints = (await session.execute(select(WeldJoint))).scalars().all()
        existing_joint_keys = {
            (j.line_id, (j.joint_number or "").strip().lower())
            for j in existing_joints
        }
        existing_legacy_ids = {j.legacy_id for j in existing_joints if j.legacy_id}
        existing_tpl_ids = {
            t.id for t in (await session.execute(select(ColumnTemplate))).scalars().all()
        }
        existing_audit_ids = {
            a.id for a in (await session.execute(select(AuditLog))).scalars().all()
        }

        _migrate_users(conn, session, existing_users, report, default_password=default_password)
        _migrate_facilities(conn, session, fac_by_name, report)
        _migrate_lines(conn, session, fac_by_name, lines_by_uid, report)
        _migrate_lrv(conn, session, fac_by_name, lrv_by_key, report)
        _migrate_welding_tech(
            conn, session, welders_by_stamp, tc_by_num, materials_by_legacy, report
        )
        _migrate_joints_with_quarantine(
            conn,
            session,
            fac_by_name,
            lines_by_uid,
            lrv_by_key,
            tc_by_num,
            existing_joint_keys,
            existing_legacy_ids,
            report,
        )
        _migrate_templates_and_audit(
            conn, session, existing_tpl_ids, existing_audit_ids, report
        )

        if report.quarantined_duplicates:
            quarantine_audit_id = _deterministic_uuid(
                f"migration_quarantine:{len(report.quarantined_duplicates)}:{report.joints_inserted}"
            )
            if quarantine_audit_id not in existing_audit_ids:
                session.add(
                    AuditLog(
                        id=quarantine_audit_id,
                        timestamp=datetime.now(timezone.utc),
                        user_login="cli_migrator",
                        user_full_name="CLI SQLite -> PostgreSQL Migrator",
                        user_role="SYSTEM",
                        action="MIGRATION_QUARANTINE",
                        entity_type="weld_joint",
                        entity_id="batch",
                        summary=f"Карантин дубликатов стыков при миграции ({len(report.quarantined_duplicates)} записей)",
                        new_data={
                            "quarantined_count": len(report.quarantined_duplicates),
                            "items": [
                                {
                                    "unique_line_id": q["unique_line_id"],
                                    "joint_number": q["joint_number"],
                                    "original_joint_id": q["original_joint_id"],
                                    "kept_joint_id": q["kept_joint_id"],
                                }
                                for q in report.quarantined_duplicates
                            ],
                        },
                    )
                )

        if quarantine_report_path is not None:
            quarantine_report_path.parent.mkdir(parents=True, exist_ok=True)
            quarantine_report_path.write_text(
                json.dumps(report.to_dict(), ensure_ascii=False, indent=2, default=str),
                encoding="utf-8",
            )

        if dry_run:
            await session.rollback()
        else:
            await session.commit()

        return report
    finally:
        conn.close()
