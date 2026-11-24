/**
 * Утилита для преобразования технических логов аудита и изменений в человекочитаемый формат на русском языке.
 * Заменяет сырые JSON-объекты, технические ключи и английские статусы на понятные описания.
 */

export const AUDIT_FIELD_TRANSLATIONS: Record<string, string> = {
  // Стыки
  joint_number: 'Номер стыка',
  is_supplementary: 'Дополнительный стык',
  joint_kind: 'Вид соединения',
  joint_type: 'Тип соединения',
  diameter_mm: 'Диаметр, мм',
  diameter_inch: 'Диаметр, дюйм',
  equiv_diameter_inch: 'Эквивалентный диаметр, дюйм',
  wall_thickness: 'Толщина стенки, мм',
  welding_type: 'Способ сварки',
  gost_joint_type: 'Тип шва по ГОСТ',
  welding_position: 'Пространственное положение',
  welding_date: 'Дата сварки',
  welder_stamp: 'Клеймо сварщика',
  welder_stamps_list: 'Список клейм сварщиков',
  brigade_stamp: 'Клеймо бригады',
  welding_materials: 'Сварочные материалы',
  ambient_temp_c: 'Температура воздуха, °C',
  preheat_temp: 'Температура подогрева, °C',
  responsible_person: 'Ответственное лицо (мастер)',
  welder_full_name: 'ФИО сварщика',
  welder_cert_number: '№ удостоверения НАКС',
  tech_card_number: 'Технологическая карта (WPS)',
  record_status: 'Блокировка записи',
  contour: 'Контур испытания',
  test_circuit_id: 'Контур испытания',
  line_number: 'Номер линии',
  unique_line_id: 'Уникальный ID линии',
  rd_code: 'Шифр РД',
  object_name: 'Объект строительства',

  // Контроль качества (ВИК, НК, Дублирующий)
  vik_result: 'Результат ВИК',
  vik_date: 'Дата ВИК',
  vik_report_number: '№ заключения ВИК',
  vik_inspector: 'Инспектор ВИК',
  ndt_type: 'Метод НК',
  ndt_result: 'Результат НК',
  ndt_report_number: '№ заключения НК',
  ndt_date: 'Дата НК',
  ndt_inspector: 'Дефектоскопист НК',
  dup_ndt_type: 'Дублирующий метод НК',
  dup_ndt_result: 'Результат дублирующего НК',
  dup_ndt_report_number: '№ заключения дублирующего НК',
  dup_ndt_date: 'Дата дублирующего НК',
  dup_ndt_inspector: 'Инспектор дублирующего НК',

  // Ремонт
  repair_action: 'Ремонтная операция',
  repair_vik_result: 'ВИК ремонта',
  repair_ndt_type: 'Метод НК ремонта',
  repair_ndt_result: 'Результат НК ремонта',
  repair_dup_ndt_type: 'Дублирующий метод ремонта',
  repair_dup_ndt_result: 'Дублирующий результат ремонта',

  // Материалы (ЛРВ)
  elem1_name: 'Элемент 1: Наименование',
  elem1_material: 'Элемент 1: Марка стали',
  elem1_ntd: 'Элемент 1: НТД',
  elem1_factory_number: 'Элемент 1: Заводской №',
  elem1_heat_number: 'Элемент 1: № плавки',
  elem1_cert_number: 'Элемент 1: № сертификата',
  elem2_name: 'Элемент 2: Наименование',
  elem2_material: 'Элемент 2: Марка стали',
  elem2_ntd: 'Элемент 2: НТД',
  elem2_factory_number: 'Элемент 2: Заводской №',
  elem2_heat_number: 'Элемент 2: № плавки',
  elem2_cert_number: 'Элемент 2: № сертификата',
  short_name: 'Краткое наименование',
  full_name: 'Полное наименование',
  material: 'Марка стали',
  ntd: 'НТД',
  marking: 'Маркировка',
  pn_mpa: 'Номинальное давление PN, МПа',
  dn_mm: 'DN, мм',
  category: 'Категория элемента',
  status: 'Статус',

  // Линии
  line_name: 'Наименование линии',
  pipeline_category: 'Категория трубопровода',
  working_pressure: 'Рабочее давление, МПа',
  working_temperature: 'Рабочая температура, °C',
  test_contour: 'Контур испытания',
  product: 'Транспортируемая среда',
  welding_ntd: 'НТД по сварке',
  control_ntd: 'НТД по контролю',

  // Пользователи
  login: 'Логин',
  role: 'Системная роль',
  department: 'Отдел',
  position_title: 'Должность',
  is_active: 'Активность учётной записи',
};

export const AUDIT_VALUE_TRANSLATIONS: Record<string, string> = {
  // Статусы контроля
  FIT: 'Годен',
  UNFIT: 'Брак (не годен)',
  IN_WORK: 'В работе',
  NOT_CONDUCTED: 'Не проводился',
  NOT_REQUIRED: 'Не требуется',
  REPAIRED: 'Отремонтирован',
  CUT_OUT: 'Вырезан',

  // Статусы блокировки записи
  DRAFT: 'Черновик',
  VERIFIED: 'Проверено (подтверждено)',
  LOCKED: 'Заблокировано (в архиве)',

  // Роли и отделы
  SUPERADMIN: 'Главный администратор',
  DEPT_ADMIN: 'Администратор отдела',
  OPERATOR: 'Инженер',
  VIEWER: 'Наблюдатель',
  PTO: 'ПТО',
  PIL: 'ПИЛ (лаборатория)',
  SK: 'СК (стройконтроль)',
  OGS: 'ОГС (гл. сварщик)',

  // Методы НК
  RK: 'РК (радиография)',
  UZK: 'УЗК (ультразвук)',
  PVK: 'ПВК (капиллярный)',
  MPK: 'МПК (магнитопорошковый)',
  VIK: 'ВИК',

  // Булевы значения
  true: 'Да',
  false: 'Нет',
};

/**
 * Форматирует значение отдельного поля в читаемый вид на русском языке
 */
export function formatAuditSingleValue(key: string, val: unknown): string {
  if (val === null || val === undefined || val === '') {
    return '—';
  }

  if (typeof val === 'boolean') {
    return val ? 'Да' : 'Нет';
  }

  const str = String(val).trim();

  // Проверка по словарю значений
  if (AUDIT_VALUE_TRANSLATIONS[str]) {
    return AUDIT_VALUE_TRANSLATIONS[str];
  }

  // Проверка дат в формате ISO (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-');
    return `${d}.${m}.${y}`;
  }

  // Если это массив строк (например, список клейм)
  if (Array.isArray(val)) {
    return val.length > 0 ? val.join(', ') : '—';
  }

  return str;
}

/**
 * Преобразует объект изменений (словарь полей) в структурированное читаемое текстовое представление
 */
export function formatAuditObjectChanges(data: Record<string, unknown> | null): string {
  if (!data || typeof data !== 'object') return '—';

  const keys = Object.keys(data).filter(
    (k) =>
      k !== 'id' &&
      k !== 'version' &&
      k !== 'updated_at' &&
      k !== 'created_at' &&
      k !== 'updated_by'
  );

  if (keys.length === 0) return '—';

  const parts = keys.map((key) => {
    const label = AUDIT_FIELD_TRANSLATIONS[key] || key;
    const formattedVal = formatAuditSingleValue(key, data[key]);
    return `${label}: ${formattedVal}`;
  });

  return parts.join('; ');
}

/**
 * Формирует человекочитаемые заголовок, старое и новое значения для записи журнала аудита
 */
export function humanizeAuditEntry(dto: Record<string, unknown>): {
  fieldKey: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
} {
  const action = String(dto.action || 'UPDATE').toUpperCase();
  const entityType = String(dto.entity_type || 'joint');
  const oldObj =
    dto.old_data && typeof dto.old_data === 'object'
      ? (dto.old_data as Record<string, unknown>)
      : null;
  const newObj =
    dto.new_data && typeof dto.new_data === 'object'
      ? (dto.new_data as Record<string, unknown>)
      : null;

  // Изменившиеся поля
  const changedKeys = newObj
    ? Object.keys(newObj).filter((k) => k !== 'version' && k !== 'updated_at')
    : oldObj
    ? Object.keys(oldObj).filter((k) => k !== 'version' && k !== 'updated_at')
    : [];

  let fieldKey = changedKeys[0] || action.toLowerCase();
  let fieldLabel = '';

  if (action === 'CREATE') {
    fieldLabel =
      entityType === 'joint'
        ? 'Регистрация стыка'
        : entityType === 'line'
        ? 'Создание линии'
        : entityType === 'lrv'
        ? 'Добавление материала'
        : entityType === 'user'
        ? 'Создание пользователя'
        : `Создание (${entityType})`;
  } else if (action === 'DELETE') {
    fieldLabel =
      entityType === 'joint'
        ? 'Удаление стыка'
        : entityType === 'line'
        ? 'Удаление линии'
        : entityType === 'user'
        ? 'Удаление пользователя'
        : `Удаление (${entityType})`;
  } else if (action === 'BULK_UPDATE') {
    fieldLabel = `Массовое редактирование (${changedKeys
      .map((k) => AUDIT_FIELD_TRANSLATIONS[k] || k)
      .join(', ')})`;
  } else if (action === 'RECORD_STATUS_CHANGED' || changedKeys.includes('record_status')) {
    fieldLabel = 'Изменение статуса блокировки записи';
  } else if (changedKeys.length === 1) {
    const singleKey = changedKeys[0];
    fieldLabel = AUDIT_FIELD_TRANSLATIONS[singleKey] || singleKey;
  } else if (changedKeys.length > 1) {
    const labels = changedKeys.slice(0, 3).map((k) => AUDIT_FIELD_TRANSLATIONS[k] || k);
    const suffix = changedKeys.length > 3 ? ` и ещё ${changedKeys.length - 3}` : '';
    fieldLabel = `Изменение параметров: ${labels.join(', ')}${suffix}`;
  } else {
    fieldLabel = String(dto.summary || `${action} (${entityType})`);
  }

  // Если одиночное поле изменилось
  let oldValue = '—';
  let newValue = '—';

  if (changedKeys.length === 1) {
    const k = changedKeys[0];
    oldValue = oldObj ? formatAuditSingleValue(k, oldObj[k]) : '—';
    newValue = newObj ? formatAuditSingleValue(k, newObj[k]) : '—';
  } else {
    oldValue = oldObj ? formatAuditObjectChanges(oldObj) : '—';
    newValue = newObj ? formatAuditObjectChanges(newObj) : '—';
  }

  // Если с сервера пришёл явный понятный summary и нет сложных полей
  if (dto.summary && !fieldLabel) {
    fieldLabel = String(dto.summary);
  }

  return {
    fieldKey,
    fieldLabel,
    oldValue,
    newValue,
  };
}
