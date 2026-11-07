export type JointType = 'Монтажный' | 'Цеховой';

export type WeldingType = 'РАД' | 'РД' | 'РАД+РД' | 'МП' | 'АФ' | 'АПГ';

export type LrvElementCategory =
  | 'Все типы'
  | 'Труба'
  | 'Отвод'
  | 'Переход'
  | 'Тройник'
  | 'ЗРА'
  | 'Кран'
  | 'Фланец'
  | 'Заглушка'
  | 'Прочее';

export type ControlResult = 'Годен' | 'Ремонт' | 'Вырезать' | 'В работе' | 'Не проводился';

export type NdtMethod = 'РК' | 'УЗК' | 'ПВК' | 'МК' | 'РК+УЗК' | 'Не требуется';

export type AppSection =
  | 'registry'
  | 'project_linelist'
  | 'welding_tech'
  | 'journals'
  | 'readiness'
  | 'lrv_catalog'
  | 'audit_log'
  | 'user_guide';

export type JournalStandard = 'СТО Газпром 15-1.1-002-2023' | 'ГОСТ 32569-2013';

export type ReadinessGroupCondition = 'objectName' | 'rdCode' | 'uniqueLineId' | 'contour';

export interface ReadinessSummaryRow {
  groupKey: string;
  subLabel: string;
  totalJoints: number;
  supplementaryJoints: number;
  weldedCount: number;
  vikPassedCount: number;
  ndtPassedCount: number;
  dupNdtPassedCount: number;
  repairCount: number;
  fullyCompletedCount: number;
  weldingPct: number;
  readinessPct: number;
  totalEquivDiameterMm: number;
  totalNominalInches: number;
  totalEquivInches: number;
  weldedEquivInches: number;
  equivWeldingPct: number;
}

export interface FacilityObject {
  id: string;
  name: string;
  shortName: string;
  region: string;
  weatherStation?: string;
  latitude: number;
  longitude: number;
  weatherArchive?: Record<string, string>;
  rdCodes: {
    code: string;
    title: string;
    contours: string[];
  }[];
}

export interface FacilityLocationPreset {
  id: string;
  title: string;
  region: string;
  weatherStation: string;
  latitude: number;
  longitude: number;
}

export interface LRVItem {
  id: string;
  lrvCode: string; // Уникальный внутренний код закупок для конкретного Шифра РД
  rdCode: string; // Строгая привязка к Шифру РД
  objectName: string;
  shortName: string; // Краткое наименование элемента (Отвод 90°, Труба БШ, Переход К, Тройник переходной, Фланец)
  category?: LrvElementCategory; // Категория элемента (Труба, Отвод, Переход, Тройник, ЗРА, Фланец, Заглушка, Прочее)
  connectionType?: 'приварной' | 'фланцевый' | string; // Тип подсоединения (для ЗРА: приварной / фланцевый)
  material: string; // Сталь 09Г2С, 20, 12Х18Н10Т и т.д.
  ntd: string; // ГОСТ / ТУ / ОСТ
  manufacturer?: string; // Завод-изготовитель / завод-поставщик элемента трубопровода
  dn1?: number; // Условный проход DN 1 (напр. 50, 150, 300)
  diameterMm: number; // Основной диаметр Ø1, мм
  wallThickness: number; // Основная толщина стенки S1, мм
  dn2?: number; // Второй условный проход DN 2 (для переходов и переходных тройников; пусто для элементов с одним диаметром)
  diameterMm2?: number; // Второй диаметр Ø2, мм (для переходов и переходных тройников)
  wallThickness2?: number; // Вторая толщина стенки S2, мм (для переходов и переходных тройников)
  specQty: number; // Количество по спецификации, шт / м
  unit: 'шт' | 'м';
  status?: 'active' | 'superseded' | 'archived'; // Статус позиции: активная / аннулирована (заменена) / архивная
  replacementLetter?: string; // № и дата официального письма согласования замены от института/Заказчика
  replacementDate?: string; // Дата согласования замены (YYYY-MM-DD)
  version?: number;
}

export interface WelderNaksCert {
  weldingType: WeldingType; // Способ сварки (РАД, РД, РАД+РД, МП, АФ)
  certNumber: string; // Номер удостоверения НАКС
  issueDate?: string; // Дата выдачи
  expiryDate?: string; // Срок действия
  admissionSheetNumber?: string; // Номер допускного листа
  admissionSheetDate?: string; // Дата допускного листа
}

/**
 * Профиль сварщика или сварочной бригады в разделе «Технология сварочного производства»
 */
export interface WelderProfile {
  id?: string;
  stamp: string; // Личное клеймо сварщика (напр. А142) или бригадное клеймо (напр. БР-01)
  isBrigade?: boolean; // Признак бригадного клейма
  brigadeMembers?: string[]; // Клейма сварщиков, входящих в бригаду
  fullName: string; // ФИО сварщика (или состав бригады)
  certNumber: string; // № основного удостоверения НАКС (для совместимости)
  certIssueDate?: string; // Дата выдачи удостоверения (YYYY-MM-DD / ДД.ММ.ГГ)
  certExpiryDate?: string; // Срок действия удостоверения (YYYY-MM-DD / ДД.ММ.ГГ)
  attestationArea?: string; // Область аттестации (способ сварки, группа сталей, Ø и S, НТД)
  admissionSheetNumber?: string; // № допускного листа
  admissionSheetDate?: string; // Дата допускного листа (YYYY-MM-DD / ДД.ММ.ГГ)
  allowedMethods: WeldingType[];
  naksCerts?: WelderNaksCert[]; // Перечень удостоверений НАКС по отдельным способам сварки
  crewForeman: string; // Ответственное лицо (мастер, прораб)
  // Аттестационные параметры НАКС (для автоматической валидации параметров стыка)
  steelGroups?: string[]; // Группы свариваемых сталей (напр. ['М01', 'М03', 'М11'])
  minDiameterMm?: number; // Мин. аттестованный диаметр, мм
  maxDiameterMm?: number; // Макс. аттестованный диаметр, мм
  minWallThicknessMm?: number; // Мин. аттестованная толщина стенки, мм
  maxWallThicknessMm?: number; // Макс. аттестованная толщина стенки, мм
}

/**
 * Правило выбора минимальной температуры подогрева по ТК в зависимости от температуры воздуха
 */
export interface PreheatRegimeRule {
  ambientMinC: number; // Нижний предел T возд., °C
  ambientMaxC: number; // Верхний предел T возд., °C
  minPreheatTempC: number; // Мин. требуемая температура подогрева, °C (0 = не требуется)
  conditionLabel: string; // Текстовое описание диапазона
}

export type JointKind = 'Стыковое' | 'Угловое';
export type ElementCombination =
  | 'Труба+Труба'
  | 'Труба+СДТ'
  | 'СДТ+СДТ'
  | 'Труба+ЗРА'
  | 'СДТ+ЗРА';

/**
 * Технологическая карта (ТК) на сварку в разделе «Технология сварочного производства»
 */
export interface TechCardItem {
  id: string;
  number: string; // Шифр ТК (напр. ТК-045-РАД/РД-01)
  title: string; // Наименование ТК
  weldingType: WeldingType; // Способ сварки
  jointKind: JointKind; // Тип соединения (строго 'Стыковое' | 'Угловое')
  elementCombination: ElementCombination; // Типы свариваемых элементов ('Труба+Труба' | 'Труба+СДТ' | 'СДТ+СДТ' | 'Труба+ЗРА' | 'СДТ+ЗРА')
  ntd: string; // НТД на сварку
  steelGroup: string; // Группа и марки свариваемых сталей
  minDiameterMm: number; // Мин. диаметр свариваемых элементов, мм
  maxDiameterMm: number; // Макс. диаметр свариваемых элементов, мм
  minWallThicknessMm: number; // Мин. толщина стенки, мм
  maxWallThicknessMm: number; // Макс. толщина стенки, мм
  recommendedMaterials: string; // Применяемые сварочные материалы
  preheatRules: PreheatRegimeRule[]; // Режимы подогрева при разных T окр. среды
}

/**
 * Перечень сварочных материалов с сертификатами и датами проведения входного контроля (ВК)
 */
export interface WeldingMaterialCertificate {
  id: string;
  brandAndDiameter: string; // Марка и диаметр (напр. Св-08Г2С Ø2.0 / УОНИ-13/55 Ø3.0)
  materialType: 'Проволока сварочная' | 'Электроды покрытые' | 'Защитный газ' | 'Комбинированный комплект (РАД+РД)';
  weldingMethod: WeldingType;
  batchNumber: string; // Партия / плавка
  certificateNumber: string; // № сертификата качества
  incomingControlAct: string; // № акта входного контроля
  incomingControlDate: string; // Дата проведения входного контроля (YYYY-MM-DD / ДД.ММ.ГГ)
  status: 'Допущен в производство' | 'На испытании';
}

export interface InspectorProfile {
  fullName: string;
  certLevel: string; // Уровень аттестации (II ур. ВИК/РК/УЗК)
  labName: string;
}

/**
 * Сварной стык (содержит >30 полей проектной и производственной информации)
 */
export interface WeldJoint {
  id: string;
  // Архитектурная привязка (из лайнлиста, нередактируемый справочный блок для созданного стыка)
  objectName: string;
  rdCode: string;
  contour: string;
  lineNumber: string;
  uniqueLineId: string; // Связка символов после последней точки в шифре + дефис + полный номер линии (напр. 001-ТХ3-ФП1.2/1)

  // 1. Вносимые на этапе подготовки производства
  jointNumber: string; // 010, 020... или доп. стыки 011, 012
  isSupplementary?: boolean; // Признак дополнительного стыка
  jointKind?: 'Стыковое' | 'Угловое'; // Тип соединения (стыковое / угловое)
  jointType: JointType; // Монтажный | Цеховой
  diameterMm: number; // Диаметр стыка в мм
  diameterInch: string; // Дюйм-диаметр
  equivDiameterInch?: number; // Эквивалентный дюйм-диаметр (Метод А: EDI = D_inch * K_толщ(S))
  wallThickness: number; // Толщина стенки, мм

  // Элемент 1
  lrv1Code: string; // Код ЛРВ 1
  elem1Name: string; // Краткое наименование элемента 1
  elem1Material: string; // Материал элемента 1
  elem1Ntd: string; // НТД элемента 1
  elem1DiameterMm?: number; // Стыкуемый диаметр элемента 1, мм
  elem1WallThickness?: number; // Стыкуемая толщина стенки элемента 1, мм
  elem1FactoryNumber?: string; // Заводской номер элемента 1 (вручную заполняет инженер ПТО)
  elem1Manufacturer?: string; // Завод-изготовитель элемента 1 (из базы ЛРВ)
  elem1Length?: string; // Длина элемента 1, м (вручную заполняется в паспорте и реестре стыков, попадает в журнал по СТО)
  elem1CertNumber?: string; // № сертификата качества элемента 1 (заводской сертификат на трубу/деталь)
  elem1HeatNumber?: string; // № плавки элемента 1
  elem1BatchNumber?: string; // № партии элемента 1

  // Элемент 2
  lrv2Code: string; // Код ЛРВ 2
  elem2Name: string; // Краткое наименование элемента 2
  elem2Material: string; // Материал элемента 2
  elem2Ntd: string; // НТД элемента 2
  elem2DiameterMm?: number; // Стыкуемый диаметр элемента 2, мм
  elem2WallThickness?: number; // Стыкуемая толщина стенки элемента 2, мм
  elem2FactoryNumber?: string; // Заводской номер элемента 2 (вручную заполняет инженер ПТО)
  elem2Manufacturer?: string; // Завод-изготовитель элемента 2 (из базы ЛРВ)
  elem2Length?: string; // Длина элемента 2, м (вручную заполняется в паспорте и реестре стыков, попадает в журнал по СТО)
  elem2CertNumber?: string; // № сертификата качества элемента 2 (заводской сертификат на трубу/деталь)
  elem2HeatNumber?: string; // № плавки элемента 2
  elem2BatchNumber?: string; // № партии элемента 2

  // 2. Вносимые на этапе производства работ (сварка)
  weldingType: string; // Вид сварки (РАД, РД, РАД+РД, МП, АФ, АПГ)
  gostJointType?: string; // Тип сварного соединения по ГОСТ 16037-80 (напр. С17, С21, С8, У19, Т8)
  weldingPosition?: string; // Положение при сварке по системе НАКС (напр. В1, В2, Г, Н1, Н2, Н45, П1, П2, С)
  weldingDate: string; // Дата сварки (YYYY-MM-DD)
  welderStamp: string; // Клеймо сварщика (или список клейм / бригадное клеймо)
  welderStampsList?: string[]; // Массив личных клейм сварщиков (при сварке несколькими сварщиками)
  brigadeStamp?: string; // Бригадное клеймо (если применимо)
  weldingMaterials: string; // Сварочные материалы
  ambientTemp: string; // Температура окружающей среды, °C (заполняется автоматически по координатам объекта и дате)
  preheatTemp?: string; // Температура подогрева, °C (заполняется вручную инженером, проверяется по ТК и T возд.)
  responsiblePerson: string; // Ответственное лицо (мастер, прораб)
  welderFullName: string; // ФИО сварщика(ов) — подтягивается автоматически по клейму
  welderCertNumber: string; // № удостоверения сварщика(ов) — подтягивается автоматически по клейму
  techCardNumber: string; // № технологической карты (из выпадающего списка ТК)

  // 3. Контроль ВИК (3 поля)
  vikResult: ControlResult; // Результат контроля ВИК
  vikDate: string; // Дата контроля ВИК
  vikInspector: string; // ФИО дефектоскописта ВИК

  // 4. Неразрушающий контроль НК (4 поля)
  ndtType: NdtMethod; // Тип неразрушающего контроля
  ndtDate: string; // Дата контроля НК
  ndtResult: ControlResult; // Результат НК
  ndtInspector: string; // ФИО дефектоскописта НК

  // 5. Дублирующий контроль (4 поля)
  dupNdtType: NdtMethod; // Тип дублирующего контроля
  dupNdtDate: string; // Дата дублирующего контроля
  dupNdtResult: ControlResult; // Результат дублирующего контроля
  dupNdtInspector: string; // ФИО дефектоскописта дубл. контроля

  // 6. Дополнительные графы журнала сварки по ГОСТ 32569-2013
  rootWeldControl?: string; // Графа 10: Отметка о контроле корня шва
  steeloscopyInfo?: string; // Графа 11: Стилоскопирование металла шва, N заключения, дата
  heatTreatOperator?: string; // Графа 12: Ф.И.О. оператора термиста, личное клеймо
  heatTreatDiagramNumber?: string; // Графа 13: № диаграммы по журналу термообработки сварных соединений
  hardnessTestInfo?: string; // Графа 14: Твердость металла шва, N заключения, дата
  ndtReportNumber?: string; // Графа 16: № заключения неразрушающего контроля
  ferritePhaseInfo?: string; // Графа 17: Результаты измерения ферритной фазы в металле шва, N заключения, дата

  // 7. Сведения о проведении ремонта (СТО Газпром графы 32–37, ГОСТ 32569 графа 15)
  repairAction?: 'Ремонт' | 'Вырезано' | string; // Графа 32: Отремонтировано, вырезано
  repairDate?: string; // Графа 33: Дата устранения дефекта (YYYY-MM-DD)
  repairTechCard?: string; // Графа 34: Номер ОТК ремонта (техкарта на ремонт)
  repairWelderStamp?: string; // Графа 35: Номер шифра (клеймо) ремонтного сварщика
  repairForeman?: string; // Графа 36: Фамилия мастера (прораба) ремонта
  repairLengthMm?: number; // Суммарная длина участка(ов) выборки дефекта при ремонте, мм (по п. 19.4 СТО 15-1.1-002 <= Pi*D/6)
  repairDefectType?: string; // Характер исправляемого дефекта (поры, шлаковые включения, подрез, непровар)
  repairCount?: number; // Количество выполненных ремонтов стыка (разрешен строго 1 ремонт, повторный ремонт запрещен)

  // 8. Приемка сварного соединения после ремонта (СТО Газпром графы 38–48)
  // Контроль ВИК после ремонта (графы 38–40)
  repairVikNumber?: string; // Графа 38: № заключения ВИК после ремонта
  repairVikDate?: string; // Графа 39: Дата ВИК после ремонта (YYYY-MM-DD)
  repairVikResult?: ControlResult; // Графа 40: Результат ВИК после ремонта
  repairVikInspector?: string; // Дефектоскопист ВИК после ремонта

  // Контроль физическими методами (основной) после ремонта (графы 41–44)
  repairNdtType?: NdtMethod; // Графа 41: Вид НК после ремонта (РК, УЗК, ПВК и т.д.)
  repairNdtNumber?: string; // Графа 42: № заключения НК после ремонта
  repairNdtDate?: string; // Графа 43: Дата НК после ремонта (YYYY-MM-DD)
  repairNdtResult?: ControlResult; // Графа 44: Результат НК после ремонта
  repairNdtInspector?: string; // Дефектоскопист НК после ремонта

  // Контроль физическими методами (дублирующий) после ремонта (графы 45–48)
  repairDupNdtType?: NdtMethod; // Графа 45: Вид дублирующего НК после ремонта
  repairDupNdtNumber?: string; // Графа 46: № заключения дубл. НК после ремонта
  repairDupNdtDate?: string; // Графа 47: Дата дубл. НК после ремонта (YYYY-MM-DD)
  repairDupNdtResult?: ControlResult; // Графа 48: Результат дубл. НК после ремонта
  repairDupNdtInspector?: string; // Дефектоскопист дубл. НК после ремонта

  // Метаданные и оптимистическая блокировка (OCC)
  version?: number;
  updatedAt: string;
  updatedBy: string;
}

export type WeldJointFieldKey = keyof Omit<
  WeldJoint,
  | 'id'
  | 'version'
  | 'isSupplementary'
  | 'elem1DiameterMm'
  | 'elem1WallThickness'
  | 'elem2DiameterMm'
  | 'elem2WallThickness'
  | 'welderStampsList'
  | 'brigadeStamp'
  | 'rootWeldControl'
  | 'steeloscopyInfo'
  | 'heatTreatOperator'
  | 'heatTreatDiagramNumber'
  | 'hardnessTestInfo'
  | 'ndtReportNumber'
  | 'ferritePhaseInfo'
  | 'updatedAt'
  | 'updatedBy'
>;

export interface OptimisticFieldDiff {
  fieldKey: string;
  fieldLabel: string;
  baseValue: string;
  clientValue: string;
  serverValue: string;
  isDirectCollision: boolean;
}

export interface OptimisticLockConflictPayload {
  entityType: 'joint' | 'line' | 'lrv' | 'welder' | 'tech_card' | 'material';
  entityId: string;
  entityTitle: string;
  expectedVersion: number;
  actualServerVersion: number;
  serverUpdatedBy: string;
  serverUpdatedAt: string;
  baseRecord?: WeldJoint | null;
  clientRecord: WeldJoint;
  serverRecord: WeldJoint;
  autoMergedRecord: WeldJoint;
  fieldDiffs: OptimisticFieldDiff[];
}

export interface ServerDbMetadata {
  engine: string;
  journalMode: string;
  dbFilePath: string;
  globalRevision: number;
  lastUpdatedAt: string;
  lastUpdatedBy: string;
  lastAction: string;
  counts: {
    joints: number;
    projectLineList: number;
    lrvCatalog: number;
    welders: number;
    techCards: number;
    weldingMaterials: number;
    userAccounts: number;
    auditLogs: number;
  };
  activeSessions: {
    sessionId: string;
    login: string;
    fullName: string;
    role: string;
    lastSeenAt: string;
  }[];
}

export interface ColumnDefinition {
  key: WeldJointFieldKey;
  label: string;
  shortLabel?: string;
  group: 'project_id' | 'prep' | 'welding' | 'vik' | 'ndt' | 'dup_ndt' | 'repair' | 'repair_ndt';
  groupLabel: string;
  minWidth: number;
  isNumeric?: boolean;
  isSticky?: boolean;
}

export interface ColumnTemplate {
  id: string;
  name: string;
  description: string;
  isSystem?: boolean;
  columnOrder: WeldJointFieldKey[];
  visibleColumns: WeldJointFieldKey[];
  customWidths?: Partial<Record<WeldJointFieldKey, number>>;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userLogin: string;
  userFullName: string;
  userRole: string;
  jointId: string;
  jointNumber: string;
  uniqueLineId: string;
  rdCode: string;
  fieldKey: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
  operationType:
    | 'single_edit'
    | 'bulk_edit'
    | 'create_joint'
    | 'delete_joint'
    | 'cross_rd_lrv'
    | 'batch_upload'
    | 'lrv_superseded'
    | 'linelist_change'
    | 'user_created'
    | 'user_modified'
    | 'user_deleted';
}

export interface UserAccount {
  login: string;
  password: string;
  fullName: string;
  role: string;
  department: string;
  sessionNumber: number;
  isAdmin?: boolean;
  passwordHash?: string;
  passwordSalt?: string;
}

/**
 * Строка раздела «Проект (лайнлист)» (17 полей по ТЗ, включая «Уровень качества»).
 * Поля «Уровень качества» (qualityLevel) и «Категория трубопровода» (pipelineCategory) могут быть пустыми.
 */
export interface ProjectLineItem {
  id: string;
  objectName: string; // 1. Название объекта
  rdCode: string; // 2. Шифр РД
  lineNumber: string; // 3. Номер линии
  uniqueLineId: string; // Авто-связка (напр. 001-TX3-ФП1.2/1)
  lineName: string; // 4. Наименование линии
  product: string; // 5. Продукт
  testContour: string; // 6. Контур испытания
  weldingNtd: string; // 7. НТД на сварку
  controlNtd: string; // 8. НТД на контроль
  qualityLevel: string; // 9. Уровень качества (может быть пустым "")
  pipelineCategory: string; // 10. Категория трубопровода (может быть пустой "")
  workingPressure: string; // 11. Рабочее давление
  workingTemperature: string; // 12. Температура
  rkPercent: number; // 13. Процент контроля РК
  uzkPercent: number; // 14. Процент контроля УЗК
  pvkPercent: number; // 15. Процент контроля ПВК
  manualStatus?: string; // 16. Статус из Excel (если по линии ещё нет стыков в базе)
  testDate: string; // 17. Дата испытания (хранится YYYY-MM-DD или ДД.ММ.ГГ, отображается ДД.ММ.ГГ)
  version?: number;
}

export type LineListColumnKey =
  | 'objectName'
  | 'rdCode'
  | 'lineNumber'
  | 'lineName'
  | 'product'
  | 'testContour'
  | 'weldingNtd'
  | 'controlNtd'
  | 'qualityLevel'
  | 'pipelineCategory'
  | 'workingPressure'
  | 'workingTemperature'
  | 'rkPercent'
  | 'uzkPercent'
  | 'pvkPercent'
  | 'computedStatus'
  | 'testDate';
