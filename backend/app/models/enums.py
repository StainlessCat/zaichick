from __future__ import annotations

import enum
from typing import Type

from sqlalchemy import Enum as SAEnum


def pg_enum(enum_cls: Type[enum.Enum], pg_type_name: str) -> SAEnum:
    """Create a PostgreSQL Enum column bound strictly to enum .value strings."""
    return SAEnum(
        enum_cls,
        name=pg_type_name,
        values_callable=lambda obj: [item.value for item in obj],
        validate_strings=True,
    )


class RoleEnum(str, enum.Enum):
    """Strict RBAC roles replacing substring matching and PTO default."""

    ADMIN = "ADMIN"
    PTO = "PTO"
    OGS = "OGS"
    PIL = "PIL"
    VIEWER = "VIEWER"


class JointTypeEnum(str, enum.Enum):
    MOUNTING = "Монтажный"
    SHOP = "Цеховой"


class JointKindEnum(str, enum.Enum):
    BUTT = "Стыковое"
    FILLET = "Угловое"


class WeldingTypeEnum(str, enum.Enum):
    RAD = "РАД"
    RD = "РД"
    RAD_RD = "РАД+РД"
    MP = "МП"
    AF = "АФ"
    APG = "АПГ"


class ElementCombinationEnum(str, enum.Enum):
    PIPE_PIPE = "Труба+Труба"
    PIPE_SDT = "Труба+СДТ"
    SDT_SDT = "СДТ+СДТ"
    PIPE_ZRA = "Труба+ЗРА"
    SDT_ZRA = "СДТ+ЗРА"


class ControlResultEnum(str, enum.Enum):
    FIT = "Годен"
    REPAIR = "Ремонт"
    CUT_OUT = "Вырезать"
    IN_WORK = "В работе"
    NOT_CONDUCTED = "Не проводился"


class NdtMethodEnum(str, enum.Enum):
    RK = "РК"
    UZK = "УЗК"
    PVK = "ПВК"
    MK = "МК"
    RK_UZK = "РК+УЗК"
    NOT_REQUIRED = "Не требуется"


class LrvElementCategoryEnum(str, enum.Enum):
    ALL = "Все типы"
    PIPE = "Труба"
    BEND = "Отвод"
    REDUCER = "Переход"
    TEE = "Тройник"
    ZRA = "ЗРА"
    VALVE = "Кран"
    FLANGE = "Фланец"
    CAP = "Заглушка"
    OTHER = "Прочее"


class LrvUnitEnum(str, enum.Enum):
    PCS = "шт"
    METER = "м"


class LrvStatusEnum(str, enum.Enum):
    ACTIVE = "active"
    SUPERSEDED = "superseded"
    ARCHIVED = "archived"


class WeldingMaterialTypeEnum(str, enum.Enum):
    WIRE = "Проволока сварочная"
    ELECTRODES = "Электроды покрытые"
    GAS = "Защитный газ"
    COMBO_RAD_RD = "Комбинированный комплект (РАД+РД)"


class WeldingMaterialStatusEnum(str, enum.Enum):
    ADMITTED = "Допущен в производство"
    TESTING = "На испытании"
