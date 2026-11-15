from __future__ import annotations

import re

# Curated dictionary of Russian weather stations and settlements frequently in NOAA ISD
KNOWN_STATION_NAMES_RU: dict[str, str] = {
    # Irkutsk Region / Lena / Baikal
    "ZIGALOVO": "Жигалово",
    "KAZACINSKOE": "Казачинское",
    "KAZACHINSKOYE": "Казачинское",
    "KAZACHINSKOE": "Казачинское",
    "KIRENSK": "Киренск",
    "UST-KUT": "Усть-Кут",
    "BRATSK": "Братск",
    "IRKUTSK": "Иркутск",
    "BODAYBO": "Бодайбо",
    "MAMA": "Мама",
    "ERBOGACHEN": "Ербогачён",
    "CHUNSKIY": "Чунский",
    "TULUN": "Тулун",
    "NIZHNEUDINSK": "Нижнеудинск",
    "TAYSHET": "Тайшет",
    "ZHELEZNOGORSK-ILIMSKIY": "Железногорск-Илимский",
    "UST-ILIMSK": "Усть-Илимск",
    # Yamal / Khanty-Mansiysk (Tyumen Oil & Gas)
    "SALEKHARD": "Салехард",
    "NOVY URENGOY": "Новый Уренгой",
    "NOVYJ URENGOJ": "Новый Уренгой",
    "NADYM": "Надым",
    "NOYABRSK": "Ноябрьск",
    "TARKO-SALE": "Тарко-Сале",
    "MUZHI": "Мужи",
    "YAR-SALE": "Яр-Сале",
    "TAZOVSKIY": "Тазовский",
    "SURGUT": "Сургут",
    "NIZHNEVARTOVSK": "Нижневартовск",
    "KHANTY-MANSIYSK": "Ханты-Мансийск",
    "HANTY-MANSIJSK": "Ханты-Мансийск",
    "NEFTEYUGANSK": "Нефтеюганск",
    "KOGALYM": "Когалым",
    "NYAGAN": "Нягань",
    "URAY": "Урай",
    "BELOYARSKIY": "Белоярский",
    "BEREZOVO": "Берёзово",
    "TYUMEN": "Тюмень",
    "TOBOLSK": "Тобольск",
    "ISHIM": "Ишим",
    "KURGAN": "Курган",
    "SHADRINSK": "Шадринск",
    # Yakutia (Sakha)
    "YAKUTSK": "Якутск",
    "JAKUTSK": "Якутск",
    "MIRNY": "Мирный",
    "MIRNYJ": "Мирный",
    "LENSK": "Ленск",
    "ALDAN": "Алдан",
    "NERYUNGRI": "Нерюнгри",
    "CHULMAN": "Чульман",
    "OLEKMINSK": "Олёкминск",
    "VILYUYSK": "Вилюйск",
    "SUNTAR": "Сунтар",
    "TIKSI": "Тикси",
    "BATAGAY": "Батагай",
    "VERKHOYANSK": "Верхоянск",
    "OYMYAKON": "Оймякон",
    # Siberia / Krasnoyarsk
    "TOMSK": "Томск",
    "KOLPASHEVO": "Колпашево",
    "STREZHEVOY": "Стрежевой",
    "OMSK": "Омск",
    "TARA": "Тара",
    "NOVOSIBIRSK": "Новосибирск",
    "BARABINSK": "Барабинск",
    "TATARSK": "Татарск",
    "KRASNOYARSK": "Красноярск",
    "ENISEYSK": "Енисейск",
    "YENISEYSK": "Енисейск",
    "BOGUCHANY": "Богучаны",
    "TURUKHANSK": "Туруханск",
    "TURA": "Тура",
    "BAYKIT": "Байкит",
    "VANAVARA": "Ванавара",
    "DUDINKA": "Дудинка",
    "NORILSK": "Норильск",
    "KHATANGA": "Хатанга",
    # Komi / North-West
    "VORKUTA": "Воркута",
    "UKHTA": "Ухта",
    "UHTA": "Ухта",
    "SYKTYVKAR": "Сыктывкар",
    "PECHORA": "Печора",
    "USINSK": "Усинск",
    "INTA": "Инта",
    "TROITSKO-PECHORSK": "Троицко-Печорск",
    "ARKHANGELSK": "Архангельск",
    "KOTLAS": "Котлас",
    "NARYAN-MAR": "Нарьян-Мар",
    "MURMANSK": "Мурманск",
    "KANDALAKSHA": "Кандалакша",
    "PETROZAVODSK": "Петрозаводск",
    "KEM": "Кемь",
    # Central / Urals
    "MOSKVA": "Москва",
    "MOSCOW": "Москва",
    "SANKT-PETERBURG": "Санкт-Петербург",
    "EKATERINBURG": "Екатеринбург",
    "SVERDLOVSK": "Екатеринбург",
    "CHELYABINSK": "Челябинск",
    "PERM": "Пермь",
    "UFA": "Уфа",
    "SAMARA": "Самара",
    "KAZAN": "Казань",
    "NIZHNIJ NOVGOROD": "Нижний Новгород",
    "NIZHNY NOVGOROD": "Нижний Новгород",
    "VOLGOGRAD": "Волгоград",
    "ROSTOV-NA-DONU": "Ростов-на-Дону",
    "KRASNODAR": "Краснодар",
    "SOCHI": "Сочи",
    "ASTRKHAN": "Астрахань",
    "ASTRAKHAN": "Астрахань",
    "ORENBURG": "Оренбург",
    "SARATOV": "Саратов",
    "VORONEZH": "Воронеж",
}

# Multi-character phonetic replacements ordered by length descending
_MULTI_CHAR_REPLACEMENTS: list[tuple[str, str]] = [
    ("SHCH", "Щ"),
    ("SHH", "Щ"),
    ("SCH", "Щ"),
    ("SH", "Ш"),
    ("CH", "Ч"),
    ("ZH", "Ж"),
    ("KH", "Х"),
    ("TS", "Ц"),
    ("TC", "Ц"),
    ("TZ", "Ц"),
    ("YU", "Ю"),
    ("JU", "Ю"),
    ("YA", "Я"),
    ("JA", "Я"),
    ("YO", "Ё"),
    ("JO", "Ё"),
    ("YE", "Е"),
    ("JE", "Е"),
    ("IY", "ИЙ"),
    ("YJ", "ЫЙ"),
    ("IJ", "ИЙ"),
    ("YY", "ЫЙ"),
    ("CIN", "ЧИН"),
    ("SKOE", "СКОЕ"),
    ("SKOY", "СКОЙ"),
    ("SKAYA", "СКАЯ"),
    ("SKIY", "СКИЙ"),
    ("SKIJ", "СКИЙ"),
]

# Single character mapping
_SINGLE_CHAR_MAP: dict[str, str] = {
    "A": "А",
    "B": "Б",
    "V": "В",
    "G": "Г",
    "D": "Д",
    "E": "Е",
    "Z": "З",
    "I": "И",
    "J": "Й",
    "K": "К",
    "L": "Л",
    "M": "М",
    "N": "Н",
    "O": "О",
    "P": "П",
    "R": "Р",
    "S": "С",
    "T": "Т",
    "U": "У",
    "F": "Ф",
    "H": "Х",
    "C": "Ц",
    "Y": "Ы",
    "X": "КС",
    "Q": "К",
    "W": "В",
}


def _translit_word(word: str) -> str:
    upper = word.upper()
    if upper in KNOWN_STATION_NAMES_RU:
        return KNOWN_STATION_NAMES_RU[upper]

    # Special handling for standard station modifiers
    if upper in {"AMSG", "AMSU"}:
        return "(АМСГ)"
    if upper in {"AP", "AIRPORT"}:
        return "(а/п)"
    if re.match(r"^M-\d+$", upper):
        return f"({upper})"

    # Handle prefixes like UST-, VERKHNE-, NIZHNE-
    if upper.startswith("UST-"):
        rest = _translit_word(upper[4:])
        return f"Усть-{rest}"
    if upper.startswith("VERKH-"):
        rest = _translit_word(upper[6:])
        return f"Верх-{rest}"

    res = upper
    for lat, cyr in _MULTI_CHAR_REPLACEMENTS:
        res = res.replace(lat, cyr)

    # Convert remaining Latin characters
    chars: list[str] = []
    for ch in res:
        chars.append(_SINGLE_CHAR_MAP.get(ch, ch))
    cyr_word = "".join(chars)

    # Formatting: Capitalize first letter, lowercase the rest
    if len(cyr_word) > 1:
        return cyr_word[0].upper() + cyr_word[1:].lower()
    return cyr_word.upper()


def transliterate_station_name(latin_name: str) -> str:
    """Convert NOAA Latin station name to Russian Cyrillic.

    Examples:
        ZIGALOVO -> Жигалово
        KAZACINSKOE -> Казачинское
        UST-KUT -> Усть-Кут
        NOVY URENGOY -> Новый Уренгой
    """
    if not latin_name or not latin_name.strip():
        return ""

    clean = latin_name.strip()
    upper = clean.upper()

    # Direct dictionary hit
    if upper in KNOWN_STATION_NAMES_RU:
        return KNOWN_STATION_NAMES_RU[upper]

    # Split by spaces and hyphens while preserving delimiters
    tokens = re.split(r"([ \-])", clean)
    converted_tokens: list[str] = []

    for tok in tokens:
        if tok in {" ", "-"}:
            converted_tokens.append(tok)
        elif tok:
            converted_tokens.append(_translit_word(tok))

    result = "".join(converted_tokens)
    return result
