import {
  JournalStandard,
  LRVItem,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import { formatDateDDMMYY } from './dates';
import {
  formatJournalElementName,
  GOST_16037_JOINT_TYPES,
  stripElementDimensionsFromName,
} from './pipeCalc';
import { isJointDefective } from './readiness';

export type Gost32569ColumnKey =
  | 'col1'
  | 'col2'
  | 'col3'
  | 'col4'
  | 'col5'
  | 'col6'
  | 'col7'
  | 'col8'
  | 'col9'
  | 'col10'
  | 'col11'
  | 'col12'
  | 'col13'
  | 'col14'
  | 'col15'
  | 'col16'
  | 'col17';

export interface Gost32569JournalColumnDef {
  key: Gost32569ColumnKey;
  colNumber: number;
  label: string;
  minWidth: number;
}

/**
 * 17 нормативных граф формы журнала сварки по ГОСТ 32569-2013
 */
export const GOST_32569_2013_JOURNAL_COLUMNS: Gost32569JournalColumnDef[] = [
  {
    key: 'col1',
    colNumber: 1,
    label: '№ п/п',
    minWidth: 64,
  },
  {
    key: 'col2',
    colNumber: 2,
    label:
      'Обозначение сварного соединения по исполнительному чертежу, тип сварного соединения ГОСТ 16037',
    minWidth: 195,
  },
  {
    key: 'col3',
    colNumber: 3,
    label: 'Ф.И.О. сварщика, личное клеймо',
    minWidth: 235,
  },
  {
    key: 'col4',
    colNumber: 4,
    label: 'Марка стали (композиция марок сталей), НД, номера сертификатов',
    minWidth: 340,
  },
  {
    key: 'col5',
    colNumber: 5,
    label: 'Наружный диаметр элемента трубопровода и толщина стенки DнхS, мм',
    minWidth: 135,
  },
  {
    key: 'col6',
    colNumber: 6,
    label: 'Дата сварки, температурные условия в рабочей зоне, °С',
    minWidth: 145,
  },
  {
    key: 'col7',
    colNumber: 7,
    label: 'Способ сварки',
    minWidth: 105,
  },
  {
    key: 'col8',
    colNumber: 8,
    label:
      'Сварочные материалы (марка электрода, сварочной проволоки, защитный газ, флюс), НД, №№ сертификатов',
    minWidth: 310,
  },
  {
    key: 'col9',
    colNumber: 9,
    label: 'Режим предварительного и сопутствующего подогрева',
    minWidth: 155,
  },
  {
    key: 'col10',
    colNumber: 10,
    label: 'Отметка о контроле корня шва',
    minWidth: 135,
  },
  {
    key: 'col11',
    colNumber: 11,
    label: 'Стилоскопирование металла шва, N заключения, дата',
    minWidth: 165,
  },
  {
    key: 'col12',
    colNumber: 12,
    label: 'Ф.И.О. оператора термиста, личное клеймо',
    minWidth: 150,
  },
  {
    key: 'col13',
    colNumber: 13,
    label: '№ диаграммы по журналу термообработки сварных соединений',
    minWidth: 150,
  },
  {
    key: 'col14',
    colNumber: 14,
    label: 'Твердость металла шва, N заключения, дата',
    minWidth: 160,
  },
  {
    key: 'col15',
    colNumber: 15,
    label:
      'Отметка о годности сварного соединения по внешнему осмотру и измерениям',
    minWidth: 175,
  },
  {
    key: 'col16',
    colNumber: 16,
    label:
      'Способ и результаты неразрушающего контроля сварного соединения, N заключения, дата',
    minWidth: 195,
  },
  {
    key: 'col17',
    colNumber: 17,
    label:
      'Результаты измерения ферритной фазы в металле шва, N заключения, дата',
    minWidth: 175,
  },
];

/**
 * Определяет НД на сварочный материал
 */
function inferWeldingConsumableNtd(brandPart: string): string {
  const s = brandPart.toLowerCase();
  if (s.includes('св-04х') || s.includes('св-08г2с') || s.startsWith('св-')) {
    return 'ГОСТ 2246-70';
  }
  if (
    s.includes('уони') ||
    s.includes('lb-52') ||
    s.includes('ок ') ||
    s.includes('ok ') ||
    s.includes('цл-') ||
    s.includes('озл-')
  ) {
    return 'ГОСТ 9466-75';
  }
  if (s.includes('co2') && s.includes('ar')) {
    return 'ТУ 2114-004-00204760-99';
  }
  if (s.includes('ar')) {
    return 'ГОСТ 10157-2016';
  }
  if (s.includes('co2')) {
    return 'ГОСТ 8050-85';
  }
  return 'ГОСТ 2246-70';
}

/**
 * Форматирует сварочные материалы для графы 8 журнала по ГОСТ 32569-2013
 */
export function formatGost32569ConsumablesCell(
  rawMaterials: string | undefined,
  materialsCatalog: WeldingMaterialCertificate[] = []
): string {
  const raw = (rawMaterials || '').trim();
  if (!raw) return 'н/п';

  const matchedMat = materialsCatalog.find(
    (m) =>
      m.brandAndDiameter === raw ||
      m.brandAndDiameter.toLowerCase() === raw.toLowerCase()
  );

  const parts: string[] = [];
  let working = raw;
  const parenMatches = working.match(/\(([^)]+)\)/g);
  const trailingParens: string[] = [];
  if (parenMatches) {
    for (const pm of parenMatches) {
      const inner = pm.slice(1, -1).trim();
      if (inner) trailingParens.push(inner);
      working = working.replace(pm, '').trim();
    }
  }

  const splitMain = working
    .split(/\s+\/\s+|;\s*|\n+/)
    .map((p) => p.replace(/[()]/g, '').trim())
    .filter(Boolean);

  parts.push(...splitMain, ...trailingParens);

  if (parts.length === 0) return 'н/п';

  const rawCertParts = matchedMat
    ? matchedMat.certificateNumber
        .replace(/серт\.?\s*№?\s*/gi, '')
        .split(/\s+\/\s+|,\s*/)
        .map((c) => c.replace(/[()]/g, '').trim())
        .filter(Boolean)
    : [];

  const rawBatchParts = matchedMat
    ? matchedMat.batchNumber
        .split(/\s+\/\s+|,\s*/)
        .map((b) =>
          b
            .replace(/пл\.?\s*/gi, '')
            .replace(/партия\s*/gi, '')
            .replace(/баллон\s*ar\s*№?\s*/gi, 'АР-')
            .replace(/смесь\s*/gi, '')
            .replace(/[()]/g, '')
            .trim()
        )
        .filter(Boolean)
    : [];

  return parts
    .map((part, idx) => {
      const ntd = inferWeldingConsumableNtd(part);
      const cert =
        rawCertParts[idx] ||
        rawBatchParts[idx] ||
        rawCertParts[0] ||
        '10492-26';
      return [part, ntd, cert].filter(Boolean).join(', ');
    })
    .join('\n');
}

/**
 * Нормализует значение ячейки журнала ГОСТ
 */
function normalizeGostNotApplicable(val: string | undefined | null): string {
  const trimmed = (val || '').trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (
    lower === 'не требуется' ||
    lower === 'не проводился' ||
    lower === 'н/п' ||
    lower === 'нет'
  ) {
    return 'н/п';
  }
  return trimmed;
}

/**
 * Формирует все 17 граф строки журнала сварки по ГОСТ 32569-2013 для заданного стыка.
 */
/**
 * Проверяет, подвергался ли сварной стык ремонту (устранение дефекта, ремонтный шов, повторный контроль).
 */
export function isJointRepaired(
  joint: Pick<
    WeldJoint,
    | 'repairAction'
    | 'repairDate'
    | 'repairVikResult'
    | 'repairNdtResult'
    | 'repairDupNdtResult'
    | 'repairWelderStamp'
    | 'vikResult'
    | 'ndtResult'
    | 'dupNdtResult'
  >
): boolean {
  return Boolean(
    joint.repairAction ||
      joint.repairDate ||
      joint.repairWelderStamp ||
      (joint.repairVikResult && joint.repairVikResult !== 'Не проводился') ||
      (joint.repairNdtResult && joint.repairNdtResult !== 'Не проводился') ||
      (joint.repairDupNdtResult && joint.repairDupNdtResult !== 'Не проводился') ||
      joint.vikResult === 'Ремонт' ||
      joint.ndtResult === 'Ремонт' ||
      joint.dupNdtResult === 'Ремонт'
  );
}

export function formatGost32569JournalRow(
  joint: WeldJoint,
  rowIndex: number,
  materials: WeldingMaterialCertificate[] = [],
  lrvCatalog: LRVItem[] = []
): Record<Gost32569ColumnKey, string> & { cells: string[] } {
  const col1 = String(rowIndex + 1);

  const gostType = joint.gostJointType?.trim() || 'С17';
  const repairSuffix = isJointRepaired(joint) ? 'Р' : '';
  const col2 = `${joint.jointNumber}${repairSuffix}, ${gostType}`;

  const namesList = (joint.welderFullName || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const stampsList =
    joint.welderStampsList && joint.welderStampsList.length > 0
      ? joint.welderStampsList
      : (joint.welderStamp || '')
          .replace(/^[^(]+\(([^)]+)\)$/, '$1')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  let col3: string;
  if (namesList.length > 1 && namesList.length === stampsList.length) {
    col3 = namesList
      .map((name, idx) => `${name}, ${stampsList[idx]}`)
      .join('\n');
  } else if (namesList.length > 0 && stampsList.length > 0) {
    col3 = `${namesList.join(', ')}, ${joint.welderStamp || stampsList.join(', ')}`;
  } else {
    col3 = 'н/п';
  }

  // ГОСТ 32569-2013 графа 4: «Марка стали (композиция марок сталей), НД, номера сертификатов».
  // Номера сертификатов включаются вместо заводских номеров элементов (в отличие от формы СТО, где в графе 9 заводской номер)
  const certParts1 = joint.elem1CertNumber
    ? [
        `серт. № ${joint.elem1CertNumber}`,
        joint.elem1HeatNumber ? `пл. ${joint.elem1HeatNumber}` : '',
        joint.elem1BatchNumber ? `парт. ${joint.elem1BatchNumber}` : '',
      ].filter(Boolean)
    : [String(joint.elem1FactoryNumber ?? '').trim()].filter(Boolean);
  const cert1 = certParts1.join(', ').replace(/[()]/g, '').trim();

  const certParts2 = joint.elem2CertNumber
    ? [
        `серт. № ${joint.elem2CertNumber}`,
        joint.elem2HeatNumber ? `пл. ${joint.elem2HeatNumber}` : '',
        joint.elem2BatchNumber ? `парт. ${joint.elem2BatchNumber}` : '',
      ].filter(Boolean)
    : [String(joint.elem2FactoryNumber ?? '').trim()].filter(Boolean);
  const cert2 = certParts2.join(', ').replace(/[()]/g, '').trim();
  const shortName1 = formatJournalElementName(
    joint.elem1Name,
    joint.lrv1Code,
    joint.rdCode,
    lrvCatalog
  );
  const shortName2 = formatJournalElementName(
    joint.elem2Name,
    joint.lrv2Code,
    joint.rdCode,
    lrvCatalog
  );
  const cleanElem1Title = `${joint.elem1Material || ''} ${shortName1}`
    .replace(/[()]/g, '')
    .trim();
  const cleanElem2Title = `${joint.elem2Material || ''} ${shortName2}`
    .replace(/[()]/g, '')
    .trim();
  const cleanNtd1 = (joint.elem1Ntd || '').replace(/[()]/g, '').trim();
  const cleanNtd2 = (joint.elem2Ntd || '').replace(/[()]/g, '').trim();

  const elem1Line = [cleanElem1Title, cleanNtd1, cert1]
    .filter(Boolean)
    .join(', ');
  const elem2Line = [cleanElem2Title, cleanNtd2, cert2]
    .filter(Boolean)
    .join(', ');
  const col4 = `${elem1Line}\n${elem2Line}`;

  const col5 = `${joint.diameterMm}х${joint.wallThickness}`;

  const formattedWeldDate = formatDateDDMMYY(joint.weldingDate) || 'н/п';
  let formattedTemp = '';
  if (joint.ambientTemp && String(joint.ambientTemp).trim() !== '') {
    const rawT = String(joint.ambientTemp).trim();
    const numT = Number(rawT);
    const signT =
      !rawT.startsWith('+') && !rawT.startsWith('-') && !Number.isNaN(numT) && numT > 0
        ? `+${rawT}`
        : rawT;
    formattedTemp = `${signT} °С`;
  }
  const col6 = formattedTemp
    ? `${formattedWeldDate}, ${formattedTemp}`
    : formattedWeldDate;

  const col7 = joint.weldingType || 'н/п';
  const col8 = formatGost32569ConsumablesCell(joint.weldingMaterials, materials);

  let col9 = 'н/п';
  const rawPreheat = (joint.preheatTemp || '').trim();
  if (rawPreheat && Number(rawPreheat) > 0) {
    const cleanPreheat = rawPreheat.startsWith('+') ? rawPreheat : `+${rawPreheat}`;
    col9 = `${cleanPreheat} °С`;
  } else if (
    joint.ambientTemp &&
    !Number.isNaN(Number(joint.ambientTemp)) &&
    Number(joint.ambientTemp) <= 0
  ) {
    col9 = '+120…+150 °С';
  }

  const customCol10 = normalizeGostNotApplicable(joint.rootWeldControl);
  const col10 = customCol10 || 'н/п';

  const isAlloySteel = Boolean(
    joint.elem1Material?.includes('Х') || joint.elem2Material?.includes('Х')
  );
  const customCol11 = normalizeGostNotApplicable(joint.steeloscopyInfo);
  const col11 = customCol11 || 'н/п';

  const col12 = normalizeGostNotApplicable(joint.heatTreatOperator) || 'н/п';
  const col13 = normalizeGostNotApplicable(joint.heatTreatDiagramNumber) || 'н/п';

  const customCol14 = normalizeGostNotApplicable(joint.hardnessTestInfo);
  const col14 = customCol14 || 'н/п';

  const col15 =
    joint.vikResult && joint.vikResult !== 'Не проводился'
      ? `${joint.vikResult}${
          joint.vikReportNumber?.trim() ? `, № ${joint.vikReportNumber.trim()}` : ''
        }${joint.vikDate ? `, ${formatDateDDMMYY(joint.vikDate)}` : ''}`
      : 'н/п';

  let col16: string;
  if (
    joint.ndtType &&
    joint.ndtType !== 'Не требуется' &&
    joint.ndtResult &&
    joint.ndtResult !== 'Не проводился'
  ) {
    const repNo = joint.ndtReportNumber?.trim();
    const repPart = repNo ? `, № ${repNo}` : '';
    const datePart = joint.ndtDate ? `, ${formatDateDDMMYY(joint.ndtDate)}` : '';
    col16 = `${joint.ndtType}, ${joint.ndtResult}${repPart}${datePart}`;
  } else {
    col16 = 'н/п';
  }

  const isAustenitic =
    joint.elem1Material.includes('12Х18Н10Т') ||
    joint.elem2Material.includes('12Х18Н10Т');
  const customCol17 = normalizeGostNotApplicable(joint.ferritePhaseInfo);
  const col17 = customCol17 || 'н/п';

  const record: Record<Gost32569ColumnKey, string> = {
    col1,
    col2,
    col3,
    col4,
    col5,
    col6,
    col7,
    col8,
    col9,
    col10,
    col11,
    col12,
    col13,
    col14,
    col15,
    col16,
    col17,
  };

  return {
    ...record,
    cells: [
      col1,
      col2,
      col3,
      col4,
      col5,
      col6,
      col7,
      col8,
      col9,
      col10,
      col11,
      col12,
      col13,
      col14,
      col15,
      col16,
      col17,
    ],
  };
}

export type StoGazpromColumnKey =
  | 'col1'
  | 'col2'
  | 'col3'
  | 'col4'
  | 'col5'
  | 'col6'
  | 'col7'
  | 'col8'
  | 'col9'
  | 'col10'
  | 'col11'
  | 'col12'
  | 'col13'
  | 'col14'
  | 'col15'
  | 'col16'
  | 'col17'
  | 'col18'
  | 'col19'
  | 'col20'
  | 'col21'
  | 'col22'
  | 'col23'
  | 'col24'
  | 'col25'
  | 'col26'
  | 'col27'
  | 'col28'
  | 'col29'
  | 'col30'
  | 'col31'
  | 'col32'
  | 'col33'
  | 'col34'
  | 'col35'
  | 'col36'
  | 'col37'
  | 'col38'
  | 'col39'
  | 'col40'
  | 'col41'
  | 'col42'
  | 'col43'
  | 'col44'
  | 'col45'
  | 'col46'
  | 'col47'
  | 'col48'
  | 'col49';

export interface StoGazpromJournalColumnDef {
  key: StoGazpromColumnKey;
  colNumber: number;
  label: string;
  fullLabel: string;
  topGroup?: string;
  subGroup?: string;
  minWidth: number;
}

/**
 * 49 нормативных граф формы Журнала сварочных работ по СТО Газпром 15-1.1-002-2023 (Приложение Г, Форма Г.1)
 */
export const STO_GAZPROM_15_1_1_002_2023_COLUMNS: StoGazpromJournalColumnDef[] = [
  {
    key: 'col1',
    colNumber: 1,
    label: 'Сквозной порядковый номер',
    fullLabel: '1. Сквозной порядковый номер',
    minWidth: 74,
  },
  {
    key: 'col2',
    colNumber: 2,
    label: 'Дата сварки',
    fullLabel: '2. Дата сварки',
    minWidth: 92,
  },
  {
    key: 'col3',
    colNumber: 3,
    label: 'Температура воздуха, °С',
    fullLabel: '3. Температура воздуха, °С',
    minWidth: 88,
  },
  {
    key: 'col4',
    colNumber: 4,
    label: 'Диаметр свариваемого элемента, мм',
    fullLabel: '4. Диаметр свариваемого элемента, мм',
    minWidth: 102,
  },
  {
    key: 'col5',
    colNumber: 5,
    label: 'Толщина стенки свариваемого элемента¹, мм',
    fullLabel: '5. Толщина стенки свариваемого элемента¹, мм',
    minWidth: 108,
  },
  {
    key: 'col6',
    colNumber: 6,
    label: 'ГОСТ или ТУ марки стали (класс или категория прочности), завод-поставщик элемента трубопровода',
    fullLabel:
      '6. ГОСТ или ТУ марки стали (класс или категория прочности), завод-поставщик элемента трубопровода',
    minWidth: 215,
  },
  {
    key: 'col7',
    colNumber: 7,
    label: 'Температура подогрева (просушки) свариваемых элементов, °С',
    fullLabel: '7. Температура подогрева (просушки) свариваемых элементов, °С',
    minWidth: 118,
  },
  {
    key: 'col8',
    colNumber: 8,
    label: 'Наименование свариваемого элемента трубопровода',
    fullLabel: '8. Наименование свариваемого элемента трубопровода',
    minWidth: 165,
  },
  {
    key: 'col9',
    colNumber: 9,
    label: 'Заводской номер элемента',
    fullLabel: '9. Заводской номер элемента',
    minWidth: 130,
  },
  {
    key: 'col10',
    colNumber: 10,
    label: 'Длина элемента, м',
    fullLabel: '10. Длина элемента, м',
    minWidth: 96,
  },
  {
    key: 'col11',
    colNumber: 11,
    topGroup: 'Маркировка сварного соединения',
    label: 'километр (подобъект)',
    fullLabel: '11. Маркировка сварного соединения — километр (подобъект)',
    minWidth: 105,
  },
  {
    key: 'col12',
    colNumber: 12,
    topGroup: 'Маркировка сварного соединения',
    label: 'обозначение технологии сварки',
    fullLabel: '12. Маркировка сварного соединения — обозначение технологии сварки',
    minWidth: 110,
  },
  {
    key: 'col13',
    colNumber: 13,
    topGroup: 'Маркировка сварного соединения',
    label: 'номер сварного соединения в километре (на схеме, чертеже, в подобъекте²)',
    fullLabel:
      '13. Маркировка сварного соединения — номер сварного соединения в километре (на схеме, чертеже, в подобъекте²)',
    minWidth: 135,
  },
  {
    key: 'col14',
    colNumber: 14,
    topGroup: 'Маркировка сварного соединения',
    label: 'дополнительная маркировка сварного соединения',
    fullLabel:
      '14. Маркировка сварного соединения — дополнительная маркировка сварного соединения',
    minWidth: 115,
  },
  {
    key: 'col15',
    colNumber: 15,
    label: 'Привязка сварного соединения (пикет)',
    fullLabel: '15. Привязка сварного соединения (пикет)',
    minWidth: 96,
  },
  {
    key: 'col16',
    colNumber: 16,
    label: 'Номер ОТК, положение при сварке, номер схемы расположения сварщиков',
    fullLabel: '16. Номер ОТК, положение при сварке, номер схемы расположения сварщиков',
    minWidth: 175,
  },
  {
    key: 'col17',
    colNumber: 17,
    label: 'Марка сварочных материалов',
    fullLabel: '17. Марка сварочных материалов',
    minWidth: 185,
  },
  {
    key: 'col18',
    colNumber: 18,
    label: 'Номер шифра (клеймо) бригады или сварщиков',
    fullLabel: '18. Номер шифра (клеймо) бригады или сварщиков',
    minWidth: 135,
  },
  {
    key: 'col19',
    colNumber: 19,
    topGroup: 'Соблюдение технологии',
    label: 'фамилия мастера (прораба)',
    fullLabel: '19. Соблюдение технологии — фамилия мастера (прораба)',
    minWidth: 145,
  },
  {
    key: 'col20',
    colNumber: 20,
    topGroup: 'Соблюдение технологии',
    label: 'подпись мастера (прораба)',
    fullLabel: '20. Соблюдение технологии — подпись мастера (прораба)',
    minWidth: 98,
  },
  {
    key: 'col21',
    colNumber: 21,
    topGroup: 'Приемка сварного соединения',
    subGroup: 'по результатам контроля ВИК',
    label: '№',
    fullLabel: '21. Приемка сварного соединения — ВИК — №',
    minWidth: 90,
  },
  {
    key: 'col22',
    colNumber: 22,
    topGroup: 'Приемка сварного соединения',
    subGroup: 'по результатам контроля ВИК',
    label: 'дата',
    fullLabel: '22. Приемка сварного соединения — ВИК — дата',
    minWidth: 86,
  },
  {
    key: 'col23',
    colNumber: 23,
    topGroup: 'Приемка сварного соединения',
    subGroup: 'по результатам контроля ВИК',
    label: 'рез-т',
    fullLabel: '23. Приемка сварного соединения — ВИК — рез-т',
    minWidth: 86,
  },
  {
    key: 'col24',
    colNumber: 24,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'вид',
    fullLabel: '24. Приемка сварного соединения — НК (основной) — вид',
    minWidth: 78,
  },
  {
    key: 'col25',
    colNumber: 25,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: '№',
    fullLabel: '25. Приемка сварного соединения — НК (основной) — №',
    minWidth: 94,
  },
  {
    key: 'col26',
    colNumber: 26,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'дата',
    fullLabel: '26. Приемка сварного соединения — НК (основной) — дата',
    minWidth: 86,
  },
  {
    key: 'col27',
    colNumber: 27,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'рез-т',
    fullLabel: '27. Приемка сварного соединения — НК (основной) — рез-т',
    minWidth: 86,
  },
  {
    key: 'col28',
    colNumber: 28,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'вид',
    fullLabel: '28. Приемка сварного соединения — НК (дублирующий) — вид',
    minWidth: 78,
  },
  {
    key: 'col29',
    colNumber: 29,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: '№',
    fullLabel: '29. Приемка сварного соединения — НК (дублирующий) — №',
    minWidth: 96,
  },
  {
    key: 'col30',
    colNumber: 30,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'дата',
    fullLabel: '30. Приемка сварного соединения — НК (дублирующий) — дата',
    minWidth: 86,
  },
  {
    key: 'col31',
    colNumber: 31,
    topGroup: 'Приемка сварного соединения',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'рез-т',
    fullLabel: '31. Приемка сварного соединения — НК (дублирующий) — рез-т',
    minWidth: 86,
  },
  {
    key: 'col32',
    colNumber: 32,
    topGroup: 'Сведения о проведении ремонта',
    label: 'отремонтировано, вырезано',
    fullLabel: '32. Сведения о проведении ремонта — отремонтировано, вырезано',
    minWidth: 112,
  },
  {
    key: 'col33',
    colNumber: 33,
    topGroup: 'Сведения о проведении ремонта',
    label: 'дата',
    fullLabel: '33. Сведения о проведении ремонта — дата',
    minWidth: 86,
  },
  {
    key: 'col34',
    colNumber: 34,
    topGroup: 'Сведения о проведении ремонта',
    label: 'номер отк ремонта',
    fullLabel: '34. Сведения о проведении ремонта — номер отк ремонта',
    minWidth: 110,
  },
  {
    key: 'col35',
    colNumber: 35,
    topGroup: 'Сведения о проведении ремонта',
    label: 'номер шифра (клеймо) бригады или сварщиков',
    fullLabel:
      '35. Сведения о проведении ремонта — номер шифра (клеймо) бригады или сварщиков',
    minWidth: 120,
  },
  {
    key: 'col36',
    colNumber: 36,
    topGroup: 'Сведения о проведении ремонта',
    label: 'фамилия мастера (прораба)',
    fullLabel: '36. Сведения о проведении ремонта — фамилия мастера (прораба)',
    minWidth: 130,
  },
  {
    key: 'col37',
    colNumber: 37,
    topGroup: 'Сведения о проведении ремонта',
    label: 'подпись мастера (прораба)',
    fullLabel: '37. Сведения о проведении ремонта — подпись мастера (прораба)',
    minWidth: 98,
  },
  {
    key: 'col38',
    colNumber: 38,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup: 'по результатам контроля ВИК',
    label: '№',
    fullLabel: '38. Приемка после ремонта — ВИК — №',
    minWidth: 86,
  },
  {
    key: 'col39',
    colNumber: 39,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup: 'по результатам контроля ВИК',
    label: 'дата',
    fullLabel: '39. Приемка после ремонта — ВИК — дата',
    minWidth: 86,
  },
  {
    key: 'col40',
    colNumber: 40,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup: 'по результатам контроля ВИК',
    label: 'рез-т',
    fullLabel: '40. Приемка после ремонта — ВИК — рез-т',
    minWidth: 86,
  },
  {
    key: 'col41',
    colNumber: 41,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'вид',
    fullLabel: '41. Приемка после ремонта — НК (основной) — вид',
    minWidth: 78,
  },
  {
    key: 'col42',
    colNumber: 42,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: '№',
    fullLabel: '42. Приемка после ремонта — НК (основной) — №',
    minWidth: 86,
  },
  {
    key: 'col43',
    colNumber: 43,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'дата',
    fullLabel: '43. Приемка после ремонта — НК (основной) — дата',
    minWidth: 86,
  },
  {
    key: 'col44',
    colNumber: 44,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами или механическим испытаниям (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'рез-т',
    fullLabel: '44. Приемка после ремонта — НК (основной) — рез-т',
    minWidth: 86,
  },
  {
    key: 'col45',
    colNumber: 45,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'вид',
    fullLabel: '45. Приемка после ремонта — НК (дублирующий) — вид',
    minWidth: 78,
  },
  {
    key: 'col46',
    colNumber: 46,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: '№',
    fullLabel: '46. Приемка после ремонта — НК (дублирующий) — №',
    minWidth: 86,
  },
  {
    key: 'col47',
    colNumber: 47,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'дата',
    fullLabel: '47. Приемка после ремонта — НК (дублирующий) — дата',
    minWidth: 86,
  },
  {
    key: 'col48',
    colNumber: 48,
    topGroup: 'Приемка сварного соединения после ремонта',
    subGroup:
      'по результатам контроля физическими методами (заключение о годности сварного соединения, номер, дата заключения)',
    label: 'рез-т',
    fullLabel: '48. Приемка после ремонта — НК (дублирующий) — рез-т',
    minWidth: 86,
  },
  {
    key: 'col49',
    colNumber: 49,
    label: 'Примечание',
    fullLabel: '49. Примечание',
    minWidth: 110,
  },
];

/**
 * Проверяет, является ли сварное соединение угловым швом по ГОСТ 16037-80
 */
export function isAngularWeldJoint(gostJointType?: string | null): boolean {
  if (!gostJointType) return false;
  const trimmed = gostJointType.trim().toUpperCase();
  if (!trimmed) return false;
  const matchedOption = GOST_16037_JOINT_TYPES.find(
    (opt) => opt.code.toUpperCase() === trimmed
  );
  if (matchedOption) {
    return matchedOption.category === 'Угловое';
  }
  return trimmed.startsWith('У') || trimmed.startsWith('Y') || trimmed.startsWith('U');
}

/**
 * Извлекает только фамилию ответственного лица (мастера, прораба)
 */
export function extractSurnameOnly(raw?: string | null): string {
  if (!raw || !raw.trim()) return 'н/п';
  let s = raw.trim();
  s = s.replace(/^(мастер|прораб|инженер|начальник|бригадир)\s+(смр\s+)?/i, '');
  s = s.replace(/^смр\s+/i, '');
  s = s.replace(/\b[А-ЯЁA-Z]\.\s*[А-ЯЁA-Z]\.?\b/g, '').trim();
  s = s.replace(/\b[А-ЯЁA-Z]\.\b/g, '').trim();
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 0) {
    return words[0].replace(/[.,]/g, '');
  }
  return raw.trim();
}

/**
 * Формирует все 49 граф строки Журнала сварочных работ по форме СТО Газпром 15-1.1-002-2023 (Приложение Г, Форма Г.1)
 */
export function formatStoGazpromJournalRow(
  joint: WeldJoint,
  rowIndex: number,
  lrvCatalog: LRVItem[] = []
): Record<StoGazpromColumnKey, string> & { cells: string[] } {
  const col1 = String(rowIndex + 1);
  const col2 = formatDateDDMMYY(joint.weldingDate) || 'н/п';

  let col3 = 'н/п';
  if (joint.ambientTemp && String(joint.ambientTemp).trim() !== '') {
    const rawT = String(joint.ambientTemp).trim();
    const numT = Number(rawT);
    col3 =
      !rawT.startsWith('+') && !rawT.startsWith('-') && !Number.isNaN(numT) && numT > 0
        ? `+${rawT}`
        : rawT;
  }

  const d1 = joint.elem1DiameterMm ?? joint.diameterMm;
  const d2 = joint.elem2DiameterMm ?? joint.diameterMm;
  const col4 = `${d1}\n${d2}`;

  const s1 = joint.elem1WallThickness ?? joint.wallThickness;
  const s2 = joint.elem2WallThickness ?? joint.wallThickness;
  const col5 = `${s1}\n${s2}`;

  const lrv1 =
    lrvCatalog.find(
      (i) => i.lrvCode === joint.lrv1Code && i.rdCode === joint.rdCode
    ) || lrvCatalog.find((i) => i.lrvCode === joint.lrv1Code);
  const lrv2 =
    lrvCatalog.find(
      (i) => i.lrvCode === joint.lrv2Code && i.rdCode === joint.rdCode
    ) || lrvCatalog.find((i) => i.lrvCode === joint.lrv2Code);
  const mfg1 = (joint.elem1Manufacturer || lrv1?.manufacturer || '').trim();
  const mfg2 = (joint.elem2Manufacturer || lrv2?.manufacturer || '').trim();
  const ntdMat1 = [joint.elem1Ntd, joint.elem1Material, mfg1].filter(Boolean).join(', ') || 'н/п';
  const ntdMat2 = [joint.elem2Ntd, joint.elem2Material, mfg2].filter(Boolean).join(', ') || 'н/п';
  const col6 = `${ntdMat1}\n${ntdMat2}`;

  let col7 = 'н/п';
  const rawPreheat = (joint.preheatTemp || '').trim();
  if (rawPreheat && Number(rawPreheat) > 0) {
    col7 = rawPreheat.startsWith('+') ? rawPreheat : `+${rawPreheat}`;
  }

  const name1 =
    formatJournalElementName(
      joint.elem1Name,
      joint.lrv1Code,
      joint.rdCode,
      lrvCatalog
    ) ||
    joint.elem1Name ||
    'н/п';
  const name2 =
    formatJournalElementName(
      joint.elem2Name,
      joint.lrv2Code,
      joint.rdCode,
      lrvCatalog
    ) ||
    joint.elem2Name ||
    'н/п';
  const col8 = `${name1}\n${name2}`;

  // СТО Газпром графа 9: «Заводской номер элемента» (строго заводские номера деталей)
  const fac1 = String(joint.elem1FactoryNumber ?? '').trim() || 'н/п';
  const fac2 = String(joint.elem2FactoryNumber ?? '').trim() || 'н/п';
  const col9 = `${fac1}\n${fac2}`;

  const len1 = String(joint.elem1Length ?? '').trim() || 'н/п';
  const len2 = String(joint.elem2Length ?? '').trim() || 'н/п';
  const col10 = `${len1}\n${len2}`;

  const col11 = joint.lineNumber || 'н/п';
  const col12 = joint.weldingType || 'н/п';
  const col13 = joint.jointNumber || 'н/п';
  const isAngular = joint.jointKind === 'Угловое' || isAngularWeldJoint(joint.gostJointType);
  const isRepair = isJointRepaired(joint);
  let col14 = 'н/п';
  if (isAngular && isRepair) {
    col14 = 'Я / Р';
  } else if (isAngular) {
    col14 = 'Я';
  } else if (isRepair) {
    col14 = 'Р';
  }

  const col15 = 'н/п';
  const col16 = (joint.techCardNumber || '').trim() || 'н/п';

  const rawMats = (joint.weldingMaterials || '').trim();
  const col17 = rawMats
    ? rawMats
        .split(/\s+\/\s+|;\s*|\n+/)
        .map((m) => m.trim())
        .filter(Boolean)
        .join('\n')
    : 'н/п';

  const col18 = (joint.welderStamp || '').trim() || 'н/п';
  const col19 = extractSurnameOnly(joint.responsiblePerson);
  const col20 = '';

  const hasVik =
    Boolean(joint.vikResult) && joint.vikResult !== 'Не проводился';
  const col21 = hasVik ? (joint.vikReportNumber?.trim() || '') : 'н/п';
  const col22 = hasVik ? formatDateDDMMYY(joint.vikDate) || 'н/п' : 'н/п';
  const col23 = hasVik ? joint.vikResult : 'н/п';

  const isPrimaryRepair =
    joint.vikResult === 'Ремонт' ||
    joint.vikResult === 'Вырезать' ||
    joint.ndtResult === 'Ремонт' ||
    joint.ndtResult === 'Вырезать';

  const hasNdt =
    Boolean(joint.ndtType) &&
    joint.ndtType !== 'Не требуется' &&
    Boolean(joint.ndtResult) &&
    joint.ndtResult !== 'Не проводился';
  const col24 =
    joint.ndtType && joint.ndtType !== 'Не требуется' ? joint.ndtType : 'н/п';
  const col25 = hasNdt ? (joint.ndtReportNumber?.trim() || '') : 'н/п';
  const col26 = hasNdt ? formatDateDDMMYY(joint.ndtDate) || 'н/п' : 'н/п';
  const col27 = hasNdt ? joint.ndtResult : 'н/п';

  let col28 = 'н/п';
  let col29 = 'н/п';
  let col30 = 'н/п';
  let col31 = 'н/п';

  if (!isPrimaryRepair && joint.dupNdtType && joint.dupNdtType !== 'Не требуется') {
    col28 = joint.dupNdtType;
    if (
      joint.dupNdtResult === 'Годен' ||
      joint.dupNdtResult === 'Ремонт' ||
      joint.dupNdtResult === 'Вырезать'
    ) {
      col29 = joint.dupNdtReportNumber?.trim() || '';
      col30 = formatDateDDMMYY(joint.dupNdtDate) || 'н/п';
      col31 = joint.dupNdtResult === 'Вырезать' ? 'Ремонт' : joint.dupNdtResult;
    } else {
      col31 = 'н/п';
    }
  }

  const isDefect = isJointDefective(joint);

  let col32 = 'н/п';
  let col33 = 'н/п';
  let col34 = 'н/п';
  let col35 = 'н/п';
  let col36 = 'н/п';
  const col37 = '';

  if (isDefect || joint.repairAction || joint.repairDate) {
    col32 =
      joint.repairAction ||
      (joint.ndtResult === 'Вырезать' ||
      joint.vikResult === 'Вырезать' ||
      joint.dupNdtResult === 'Вырезать'
        ? 'Вырезано'
        : 'Ремонт');
    col33 =
      formatDateDDMMYY(joint.repairDate || joint.ndtDate || joint.vikDate) || 'н/п';
    col34 = (joint.repairTechCard || '').trim() || 'н/п';
    col35 = (joint.repairWelderStamp || col18 || '').trim() || 'н/п';
    col36 = extractSurnameOnly(joint.repairForeman || joint.responsiblePerson);
  }

  let col38 = 'н/п';
  let col39 = 'н/п';
  let col40 = 'н/п';
  let col41 = 'н/п';
  let col42 = 'н/п';
  let col43 = 'н/п';
  let col44 = 'н/п';
  let col45 = 'н/п';
  let col46 = 'н/п';
  let col47 = 'н/п';
  let col48 = 'н/п';

  if (isDefect || joint.repairAction) {
    const hasRepairVik =
      Boolean(joint.repairVikResult) && joint.repairVikResult !== 'Не проводился';
    if (hasRepairVik) {
      col38 = joint.repairVikNumber?.trim() || '';
      col39 = formatDateDDMMYY(joint.repairVikDate) || 'н/п';
      col40 =
        joint.repairVikResult === 'Годен' || joint.repairVikResult === 'Ремонт'
          ? joint.repairVikResult
          : 'н/п';
    }

    const hasSpecializedNdt =
      Boolean(joint.repairNdtType) &&
      joint.repairNdtType !== 'Не требуется' &&
      Boolean(joint.repairNdtResult) &&
      joint.repairNdtResult !== 'Не проводился';

    if (hasSpecializedNdt) {
      col41 = joint.repairNdtType!;
      col42 = joint.repairNdtNumber?.trim() || '';
      col43 = formatDateDDMMYY(joint.repairNdtDate) || 'н/п';
      col44 =
        joint.repairNdtResult === 'Годен' || joint.repairNdtResult === 'Ремонт'
          ? joint.repairNdtResult
          : 'н/п';
    }

    const hasSpecializedDupNdt =
      Boolean(joint.repairDupNdtType) &&
      joint.repairDupNdtType !== 'Не требуется' &&
      Boolean(joint.repairDupNdtResult) &&
      joint.repairDupNdtResult !== 'Не проводился';

    if (hasSpecializedDupNdt) {
      col45 = joint.repairDupNdtType!;
      col46 = joint.repairDupNdtNumber?.trim() || '';
      col47 = formatDateDDMMYY(joint.repairDupNdtDate) || 'н/п';
      col48 =
        joint.repairDupNdtResult === 'Годен' || joint.repairDupNdtResult === 'Ремонт'
          ? joint.repairDupNdtResult
          : 'н/п';
    }
  }

  const col49 = 'н/п';

  const cells: string[] = [
    col1,
    col2,
    col3,
    col4,
    col5,
    col6,
    col7,
    col8,
    col9,
    col10,
    col11,
    col12,
    col13,
    col14,
    col15,
    col16,
    col17,
    col18,
    col19,
    col20,
    col21,
    col22,
    col23,
    col24,
    col25,
    col26,
    col27,
    col28,
    col29,
    col30,
    col31,
    col32,
    col33,
    col34,
    col35,
    col36,
    col37,
    col38,
    col39,
    col40,
    col41,
    col42,
    col43,
    col44,
    col45,
    col46,
    col47,
    col48,
    col49,
  ];

  return {
    col1,
    col2,
    col3,
    col4,
    col5,
    col6,
    col7,
    col8,
    col9,
    col10,
    col11,
    col12,
    col13,
    col14,
    col15,
    col16,
    col17,
    col18,
    col19,
    col20,
    col21,
    col22,
    col23,
    col24,
    col25,
    col26,
    col27,
    col28,
    col29,
    col30,
    col31,
    col32,
    col33,
    col34,
    col35,
    col36,
    col37,
    col38,
    col39,
    col40,
    col41,
    col42,
    col43,
    col44,
    col45,
    col46,
    col47,
    col48,
    col49,
    cells,
  };
}


// =========================================================================
// КОНТРОЛЬ ПОЛНОТЫ ЖУРНАЛОВ СВАРОЧНЫХ РАБОТ ПЕРЕД ВЫПУСКОМ (XLSX / PDF / ПЕЧАТЬ)
// =========================================================================

export interface JournalMissingField {
  field: string;
  label: string;
}

export interface JournalJointMissingItem {
  jointId: string;
  jointNumber: string;
  lineNumber: string;
  missingFields: JournalMissingField[];
}

export interface JournalCompletenessSummary {
  isFullyComplete: boolean;
  totalJoints: number;
  jointsWithMissingDataCount: number;
  missingSummary: {
    missingDates: number;
    missingWelders: number;
    missingTechCards: number;
    missingVikReports: number;
    missingNdtReports: number;
    missingRepairDetails: number;
    missingResponsiblePerson: number;
  };
  missingItems: JournalJointMissingItem[];
}

/**
 * Проверяет нормативную полноту сведений журнала сварочных работ (СТО Газпром / ГОСТ)
 * перед официальной выгрузкой или печатью.
 */
export function validateJournalCompleteness(
  joints: WeldJoint[],
  standard: JournalStandard = 'СТО Газпром 15-1.1-002-2023'
): JournalCompletenessSummary {
  const missingItems: JournalJointMissingItem[] = [];
  const missingSummary = {
    missingDates: 0,
    missingWelders: 0,
    missingTechCards: 0,
    missingVikReports: 0,
    missingNdtReports: 0,
    missingRepairDetails: 0,
    missingResponsiblePerson: 0,
  };

  for (const j of joints) {
    const missingFields: JournalMissingField[] = [];

    // 1. Дата сварки
    if (!j.weldingDate || String(j.weldingDate).trim() === '') {
      missingFields.push({ field: 'weldingDate', label: 'Дата сварки' });
      missingSummary.missingDates++;
    }

    // 2. Клеймо сварщика
    const hasWelder =
      (j.welderStampsList && j.welderStampsList.length > 0) ||
      (j.welderStamp && String(j.welderStamp).trim() !== '');
    if (!hasWelder) {
      missingFields.push({ field: 'welderStamp', label: 'Клеймо сварщика' });
      missingSummary.missingWelders++;
    }

    // 3. Номер техкарты (ТК)
    if (!j.techCardNumber || String(j.techCardNumber).trim() === '') {
      missingFields.push({ field: 'techCardNumber', label: 'Техкарта (ТК)' });
      missingSummary.missingTechCards++;
    }

    // 4. Заключение ВИК
    const vikConducted =
      j.vikResult === 'Годен' ||
      j.vikResult === 'Ремонт' ||
      (j.vikDate && String(j.vikDate).trim() !== '');
    if (vikConducted && (!j.vikReportNumber || String(j.vikReportNumber).trim() === '')) {
      missingFields.push({ field: 'vikReportNumber', label: 'Номер заключения/акта ВИК' });
      missingSummary.missingVikReports++;
    }

    // 5. Заключение физического НК (РК, УЗК и др.)
    const ndtConducted =
      j.ndtType &&
      j.ndtType !== 'Не требуется' &&
      (j.ndtResult === 'Годен' ||
        j.ndtResult === 'Ремонт' ||
        (j.ndtDate && String(j.ndtDate).trim() !== ''));
    if (ndtConducted && (!j.ndtReportNumber || String(j.ndtReportNumber).trim() === '')) {
      missingFields.push({ field: 'ndtReportNumber', label: `Номер заключения ${j.ndtType || 'НК'}` });
      missingSummary.missingNdtReports++;
    }

    // 6. Реквизиты ремонта
    const isRep =
      j.vikResult === 'Ремонт' ||
      j.ndtResult === 'Ремонт' ||
      Boolean(j.repairAction);
    if (isRep) {
      const missingRep: string[] = [];
      if (!j.repairDate) missingRep.push('дата ремонта');
      if (!j.repairWelderStamp) missingRep.push('клеймо сварщика ремонта');
      if (!j.repairVikNumber && !j.repairNdtNumber) missingRep.push('заключение контроля после ремонта');
      if (missingRep.length > 0) {
        missingFields.push({
          field: 'repairDetails',
          label: `Реквизиты ремонта (${missingRep.join(', ')})`,
        });
        missingSummary.missingRepairDetails++;
      }
    }

    // 7. Ответственное лицо (мастер / прораб)
    if (!j.responsiblePerson || String(j.responsiblePerson).trim() === '') {
      missingFields.push({ field: 'responsiblePerson', label: 'Ответственное лицо (мастер)' });
      missingSummary.missingResponsiblePerson++;
    }

    if (missingFields.length > 0) {
      missingItems.push({
        jointId: j.id,
        jointNumber: j.jointNumber,
        lineNumber: j.lineNumber,
        missingFields,
      });
    }
  }

  return {
    isFullyComplete: missingItems.length === 0,
    totalJoints: joints.length,
    jointsWithMissingDataCount: missingItems.length,
    missingSummary,
    missingItems,
  };
}
