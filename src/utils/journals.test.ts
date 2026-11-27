import { describe, expect, it } from 'vitest';
import { WeldingMaterialCertificate, WeldJoint } from '../types/welding';
import {
  formatGost32569JournalRow,
  formatStoGazpromJournalRow,
  isJointRepaired,
  validateJournalCompleteness,
} from './journals';
import { pluralizeRu } from '../components/journals/types';

function makeJoint(overrides: Partial<WeldJoint> = {}): WeldJoint {
  return {
    id: 'j-1',
    objectName: 'УКПГ-1',
    rdCode: '1234-ТХ',
    lineNumber: '100-Г-1',
    uniqueLineId: '100-Г-1-1234',
    jointNumber: '010',
    gostJointType: 'С17',
    diameter: 219,
    wallThickness: 8,
    steelGrade: '09Г2С',
    elem1Name: 'Труба',
    elem1Material: '09Г2С',
    elem1CertNumber: 'С-101',
    elem1HeatNumber: 'ПЛ-1',
    elem1FactoryNumber: '1001',
    elem2Name: 'Отвод 90',
    elem2Material: '09Г2С',
    elem2CertNumber: 'С-202',
    elem2HeatNumber: 'ПЛ-2',
    elem2FactoryNumber: '1002',
    weldingDate: '2026-05-10',
    ambientTemp: 12,
    weldingType: 'РАД+РД',
    welderStamp: 'K123',
    welderFullName: 'Иванов И.И.',
    weldingMaterials: 'УОНИ 13/55 Ø3.0',
    techCardNumber: 'ТК-01',
    responsiblePerson: 'Петров П.П.',
    vikResult: 'Годен',
    vikReportNumber: 'ВИК-10',
    vikDate: '2026-05-11',
    ndtType: 'РК',
    ndtResult: 'Годен',
    ndtReportNumber: 'РК-10',
    ndtDate: '2026-05-12',
    repairCount: 0,
    ...overrides,
  } as WeldJoint;
}

describe('pluralizeRu', () => {
  it('склоняет существительные для всех падежных групп числительных', () => {
    expect(pluralizeRu(0, 'стык', 'стыка', 'стыков')).toBe('стыков');
    expect(pluralizeRu(1, 'стык', 'стыка', 'стыков')).toBe('стык');
    expect(pluralizeRu(2, 'стык', 'стыка', 'стыков')).toBe('стыка');
    expect(pluralizeRu(4, 'стык', 'стыка', 'стыков')).toBe('стыка');
    expect(pluralizeRu(5, 'стык', 'стыка', 'стыков')).toBe('стыков');
    expect(pluralizeRu(11, 'стык', 'стыка', 'стыков')).toBe('стыков');
    expect(pluralizeRu(14, 'стык', 'стыка', 'стыков')).toBe('стыков');
    expect(pluralizeRu(21, 'стык', 'стыка', 'стыков')).toBe('стык');
    expect(pluralizeRu(22, 'стык', 'стыка', 'стыков')).toBe('стыка');
    expect(pluralizeRu(25, 'стык', 'стыка', 'стыков')).toBe('стыков');
    expect(pluralizeRu(101, 'запись', 'записи', 'записей')).toBe('запись');
    expect(pluralizeRu(111, 'запись', 'записи', 'записей')).toBe('записей');
  });
});

describe('isJointRepaired', () => {
  it('определяет отремонтированные стыки по факту ремонта', () => {
    expect(isJointRepaired(makeJoint())).toBe(false);
    expect(isJointRepaired(makeJoint({ repairAction: 'Ремонт' }))).toBe(true);
    expect(isJointRepaired(makeJoint({ repairDate: '2026-05-15' }))).toBe(true);
    expect(isJointRepaired(makeJoint({ repairWelderStamp: 'K999' }))).toBe(true);
    expect(isJointRepaired(makeJoint({ ndtResult: 'Ремонт' }))).toBe(true);
  });
});

describe('formatGost32569JournalRow', () => {
  it('добавляет суффикс Р для ремонтных стыков и обогащает сварочные материалы из справочника', () => {
    const materials: WeldingMaterialCertificate[] = [
      {
        id: 'm-1',
        brandAndDiameter: 'УОНИ 13/55 Ø3.0',
        materialType: 'Электроды покрытые',
        weldingMethod: 'РД',
        certificateNumber: '778/26',
        batchNumber: 'П-44',
        incomingControlAct: 'АВК-12',
        incomingControlDate: '2026-01-10',
        status: 'Допущен в производство',
      },
    ];
    const joint = makeJoint({ repairAction: 'Ремонт', repairDate: '2026-05-15' });
    const row = formatGost32569JournalRow(joint, 0, materials, []);
    expect(row.cells).toHaveLength(17);
    expect(row.col2).toBe('010Р, С17');
    expect(row.col8).toContain('УОНИ 13/55');
    expect(row.col8).toContain('778/26');
  });
});

describe('formatStoGazpromJournalRow', () => {
  it('формирует ровно 49 граф, маркировку Я / Р для угловых и ремонтных швов и фамилию мастера', () => {
    const angularRepaired = makeJoint({
      gostJointType: 'У19',
      responsiblePerson: 'Сидоров С.С.',
      repairAction: 'Ремонт',
      repairForeman: 'Кузнецов К.К.',
      repairDate: '2026-05-15',
    });
    const row = formatStoGazpromJournalRow(angularRepaired, 0, []);
    expect(row.cells).toHaveLength(49);
    expect(row.col14).toBe('Я / Р');
    expect(row.col19).toBe('Сидоров');
    expect(row.col36).toBe('Кузнецов');

    const angularOnly = makeJoint({ gostJointType: 'У19' });
    expect(formatStoGazpromJournalRow(angularOnly, 0, []).col14).toBe('Я');

    const butt = makeJoint({ gostJointType: 'С17' });
    expect(formatStoGazpromJournalRow(butt, 0, []).col14).toBe('н/п');
  });
});

describe('validateJournalCompleteness', () => {
  it('синхронно выявляет полные и неполные стыки для баннера и таблицы', () => {
    const completeJoint = makeJoint({ id: 'ok-1', jointNumber: '010' });
    const missingJoint = makeJoint({
      id: 'bad-1',
      jointNumber: '020',
      welderStamp: '',
      techCardNumber: '',
      responsiblePerson: '',
    });

    const summary = validateJournalCompleteness(
      [completeJoint, missingJoint],
      'СТО Газпром 15-1.1-002-2023'
    );

    expect(summary.isFullyComplete).toBe(false);
    expect(summary.jointsWithMissingDataCount).toBe(1);
    expect(summary.missingItems).toHaveLength(1);
    expect(summary.missingItems[0].jointId).toBe('bad-1');
    expect(summary.missingSummary.missingWelders).toBe(1);
    expect(summary.missingSummary.missingTechCards).toBe(1);
    expect(summary.missingSummary.missingResponsiblePerson).toBe(1);
  });
});
