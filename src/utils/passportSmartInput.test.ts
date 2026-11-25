import { describe, expect, it } from 'vitest';
import { LRVItem, WeldJoint } from '../types/welding';
import { LrvSizeOption } from './pipeCalc';
import {
  applyTraceabilitySuggestionToElement,
  buildElementTraceabilitySuggestions,
  clearElementFields,
  computeElementTypeMismatchState,
  copyBothElementsFromJoint,
  createBlankJointForCreateMode,
  filterSizeOptionsLive,
  findUniqueAutoSelectableLrv,
  formatSizeFilterKeyLabel,
  getCopyableLineJoints,
  pickDefaultDonorJointId,
  searchLrvCodeSuggestions,
} from './passportSmartInput';

function makeJoint(overrides: Partial<WeldJoint>): WeldJoint {
  return {
    ...createBlankJointForCreateMode({
      objectName: 'УКПГ-2В',
      rdCode: '0092.049.001-ТХ3',
      lineNumber: 'ФП1.2/1',
      contour: 'КИ-1',
    }),
    ...overrides,
  };
}

function makeLrv(overrides: Partial<LRVItem>): LRVItem {
  return {
    id: 'lrv-1',
    lrvCode: 'ЛРВ-001',
    rdCode: '0092.049.001-ТХ3',
    objectName: 'УКПГ-2В',
    shortName: 'Труба БШ',
    material: '09Г2С',
    ntd: 'ГОСТ 8732-78',
    manufacturer: 'ЧТПЗ',
    diameterMm: 159,
    wallThickness: 8,
    specQty: 100,
    unit: 'м',
    status: 'active',
    ...overrides,
  };
}

describe('passportSmartInput', () => {
  describe('createBlankJointForCreateMode', () => {
    it('сохраняет только объект, шифр РД и линию, полностью очищая остальные поля', () => {
      const blank = createBlankJointForCreateMode({
        objectName: 'УКПГ-2В Бованенковское НГКМ',
        rdCode: '0092.049.001-ТХ3',
        lineNumber: 'ФП1.2/1',
        contour: 'КИ-1',
        updatedBy: 'pto_user',
      });

      expect(blank.objectName).toBe('УКПГ-2В Бованенковское НГКМ');
      expect(blank.rdCode).toBe('0092.049.001-ТХ3');
      expect(blank.lineNumber).toBe('ФП1.2/1');
      expect(blank.contour).toBe('КИ-1');
      expect(blank.uniqueLineId).toBe('001-ТХ3-ФП1.2/1');

      // Все рабочие поля и оба элемента очищены, демонстрационных значений нет
      expect(blank.jointNumber).toBe('');
      expect(blank.diameterMm).toBe(0);
      expect(blank.wallThickness).toBe(0);
      expect(blank.weldingDate).toBe('');
      expect(blank.welderStamp).toBe('');
      expect(blank.welderStampsList).toEqual([]);
      expect(blank.welderFullName).toBe('');
      expect(blank.techCardNumber).toBe('');
      expect(blank.weldingMaterials).toBe('');
      expect(blank.responsiblePerson).toBe('');
      expect(blank.lrv1Code).toBe('');
      expect(blank.elem1Name).toBe('');
      expect(blank.elem1Material).toBe('');
      expect(blank.elem1FactoryNumber).toBe('');
      expect(blank.elem1Length).toBe('');
      expect(blank.lrv2Code).toBe('');
      expect(blank.elem2Name).toBe('');
      expect(blank.elem2Material).toBe('');
      expect(blank.elem2FactoryNumber).toBe('');
      expect(blank.elem2Length).toBe('');
    });
  });

  describe('копирование элементов из стыка-донора на линии', () => {
    const lineId = '001-ТХ3-ФП1.2/1';
    const j010 = makeJoint({ id: 'j-10', uniqueLineId: lineId, jointNumber: '010' });
    const j011 = makeJoint({
      id: 'j-11',
      uniqueLineId: lineId,
      jointNumber: '011',
      isSupplementary: true,
    });
    const j020 = makeJoint({
      id: 'j-20',
      uniqueLineId: lineId,
      jointNumber: '020',
      diameterMm: 219,
      wallThickness: 10,
      lrv1Code: 'ЛРВ-101',
      elem1Name: 'Труба БШ',
      elem1Material: '09Г2С',
      elem1Ntd: 'ГОСТ 8732-78',
      elem1Manufacturer: 'ВМЗ',
      elem1DiameterMm: 219,
      elem1WallThickness: 10,
      elem1FactoryNumber: 'ЗН-1001',
      elem1Length: '11.8',
      elem1CertNumber: 'СЕРТ-11',
      elem1HeatNumber: 'ПЛ-22',
      elem1BatchNumber: 'ПАРТ-33',
      lrv2Code: 'ЛРВ-202',
      elem2Name: 'Отвод 90°',
      elem2Material: '09Г2С',
      elem2Ntd: 'ГОСТ 17375-2001',
      elem2Manufacturer: 'ЧТПЗ',
      elem2DiameterMm: 219,
      elem2WallThickness: 10,
      elem2FactoryNumber: 'ЗН-2002',
      elem2Length: '0.45',
      elem2CertNumber: 'СЕРТ-44',
      elem2HeatNumber: 'ПЛ-55',
      elem2BatchNumber: 'ПАРТ-66',
    });
    const otherLine = makeJoint({
      id: 'j-other',
      uniqueLineId: '002-ТХ3-ФП2/1',
      jointNumber: '010',
    });

    it('фильтрует и сортирует стыки-доноры линии с сохранением 3-значной нумерации', () => {
      const list = getCopyableLineJoints([j020, otherLine, j011, j010], lineId, 'j-new');
      expect(list.map((j) => j.jointNumber)).toEqual(['010', '011', '020']);

      const excluding020 = getCopyableLineJoints([j020, j011, j010], lineId, 'j-20');
      expect(excluding020.map((j) => j.jointNumber)).toEqual(['010', '011']);
    });

    it('выбирает ближайший предыдущий стык по номеру или последний при пустом номере', () => {
      const sorted = [j010, j011, j020];
      expect(pickDefaultDonorJointId(sorted, '')).toBe('j-20');
      expect(pickDefaultDonorJointId(sorted, '020')).toBe('j-11');
      expect(pickDefaultDonorJointId(sorted, '015')).toBe('j-11');
      expect(pickDefaultDonorJointId(sorted, '010')).toBe('j-20');
    });

    it('копирует полную пару элементов вместе с зав. номерами, длиной и реквизитами', () => {
      const blank = makeJoint({ id: 'j-30', uniqueLineId: lineId, jointNumber: '030' });
      const copied = copyBothElementsFromJoint(blank, j020);

      expect(copied.jointNumber).toBe('030');
      expect(copied.diameterMm).toBe(219);
      expect(copied.wallThickness).toBe(10);
      expect(copied.diameterInch).toBe('8"');

      expect(copied.lrv1Code).toBe('ЛРВ-101');
      expect(copied.elem1FactoryNumber).toBe('ЗН-1001');
      expect(copied.elem1Length).toBe('11.8');
      expect(copied.elem1CertNumber).toBe('СЕРТ-11');
      expect(copied.elem1HeatNumber).toBe('ПЛ-22');
      expect(copied.elem1BatchNumber).toBe('ПАРТ-33');

      expect(copied.lrv2Code).toBe('ЛРВ-202');
      expect(copied.elem2Name).toBe('Отвод 90°');
      expect(copied.elem2FactoryNumber).toBe('ЗН-2002');
      expect(copied.elem2Length).toBe('0.45');
      expect(copied.elem2CertNumber).toBe('СЕРТ-44');
      expect(copied.elem2HeatNumber).toBe('ПЛ-55');
      expect(copied.elem2BatchNumber).toBe('ПАРТ-66');
    });

    it('полностью очищает поля выбранного элемента без затрагивания второго элемента', () => {
      const clearedElem2 = clearElementFields(j020, 2);
      expect(clearedElem2.lrv2Code).toBe('');
      expect(clearedElem2.elem2Name).toBe('');
      expect(clearedElem2.elem2DiameterMm).toBe(0);
      expect(clearedElem2.elem2FactoryNumber).toBe('');
      expect(clearedElem2.elem2Length).toBe('');
      expect(clearedElem2.elem2CertNumber).toBe('');
      expect(clearedElem2.elem2HeatNumber).toBe('');
      expect(clearedElem2.elem2BatchNumber).toBe('');
      // Элемент 1 и геометрия стыка сохранены
      expect(clearedElem2.lrv1Code).toBe('ЛРВ-101');
      expect(clearedElem2.diameterMm).toBe(219);

      const clearedElem1 = clearElementFields(j020, 1);
      expect(clearedElem1.lrv1Code).toBe('');
      expect(clearedElem1.elem1Name).toBe('');
      expect(clearedElem1.elem1DiameterMm).toBe(0);
      expect(clearedElem1.elem1FactoryNumber).toBe('');
      expect(clearedElem1.elem1Length).toBe('');
      expect(clearedElem1.elem1CertNumber).toBe('');
      expect(clearedElem1.diameterMm).toBe(0);
      expect(clearedElem1.wallThickness).toBe(0);
      // Элемент 2 сохранен
      expect(clearedElem1.lrv2Code).toBe('ЛРВ-202');
      expect(clearedElem1.elem2FactoryNumber).toBe('ЗН-2002');
    });
  });

  describe('живой поиск по типоразмеру, коду ЛРВ и автоподстановка единственного варианта', () => {
    const sizes: LrvSizeOption[] = [
      { key: '57x4', label: 'Ø57 × 4 мм', diameterMm: 57, wallThickness: 4 },
      { key: '159x6', label: 'Ø159 × 6 мм', diameterMm: 159, wallThickness: 6 },
      { key: '159x8', label: 'Ø159 × 8 мм', diameterMm: 159, wallThickness: 8 },
      { key: '219x10', label: 'Ø219 × 10 мм', diameterMm: 219, wallThickness: 10 },
    ];

    it('фильтрует типоразмеры с нормализацией разделителей и кириллицы', () => {
      expect(filterSizeOptionsLive(sizes, '159').map((s) => s.key)).toEqual([
        '159x6',
        '159x8',
      ]);
      expect(filterSizeOptionsLive(sizes, '159х8').map((s) => s.key)).toEqual([
        '159x8',
      ]);
      expect(filterSizeOptionsLive(sizes, 'Ø219 × 10').map((s) => s.key)).toEqual([
        '219x10',
      ]);
    });

    it('ранжирует подсказки кода ЛРВ: точное совпадение -> префикс -> вхождение -> атрибуты', () => {
      const catalog: LRVItem[] = [
        makeLrv({ id: '1', lrvCode: '12-001', shortName: 'Отвод 90°' }),
        makeLrv({ id: '2', lrvCode: '001', shortName: 'Труба БШ' }),
        makeLrv({ id: '3', lrvCode: '001-А', shortName: 'Фланец' }),
        makeLrv({ id: '4', lrvCode: '999', shortName: 'Труба 12Х18Н10Т', material: '12Х18Н10Т' }),
        makeLrv({ id: '5', lrvCode: '001-OLD', status: 'superseded' }),
      ];

      const res = searchLrvCodeSuggestions(catalog, '001');
      expect(res.slice(0, 3).map((i) => i.lrvCode)).toEqual([
        '001',
        '001-А',
        '001-OLD',
      ]);

      const onFocusEmpty = searchLrvCodeSuggestions(catalog, '');
      expect(onFocusEmpty.some((i) => i.status === 'superseded')).toBe(false);
    });

    it('возвращает единственный подходящий материал для автоподстановки в Поле 3', () => {
      const item = makeLrv({ lrvCode: 'ЛРВ-777' });
      expect(findUniqueAutoSelectableLrv([item], '')?.lrvCode).toBe('ЛРВ-777');
      expect(findUniqueAutoSelectableLrv([item], 'ЛРВ-777')).toBeNull();
      expect(findUniqueAutoSelectableLrv([item, makeLrv({ id: '2', lrvCode: 'ЛРВ-778' })], '')).toBeNull();
      expect(findUniqueAutoSelectableLrv([], '')).toBeNull();
    });

    it('выявляет несоответствие материала и типоразмера при смене типа элемента на заполненной карточке', () => {
      const elbowSizes: LrvSizeOption[] = [
        { key: '219x10', label: 'Ø219 × 10 мм', diameterMm: 219, wallThickness: 10 },
      ];

      // Сменили тип с Трубы (159x8) на Отвод (у которого есть только 219x10)
      const mismatchBoth = computeElementTypeMismatchState({
        typeFilter: 'Отвод',
        sizeFilter: '159x8',
        availableSizesForType: elbowSizes,
        selectedCategory: 'Труба',
        hasFilledMaterial: true,
        diam: 159,
        wall: 8,
      });
      expect(mismatchBoth.isMaterialMismatch).toBe(true);
      expect(mismatchBoth.isSizeMismatch).toBe(true);
      expect(formatSizeFilterKeyLabel('159x8', elbowSizes)).toBe('Ø159 × 8 мм');

      // Если размер 219x10 у Отвода есть, несоответствие только по материалу
      const mismatchMaterialOnly = computeElementTypeMismatchState({
        typeFilter: 'Отвод',
        sizeFilter: '219x10',
        availableSizesForType: elbowSizes,
        selectedCategory: 'Труба',
        hasFilledMaterial: true,
        diam: 219,
        wall: 10,
      });
      expect(mismatchMaterialOnly.isMaterialMismatch).toBe(true);
      expect(mismatchMaterialOnly.isSizeMismatch).toBe(false);

      // При возврате типа на «Труба» или «Все типы» подсветка снимается
      const cleared = computeElementTypeMismatchState({
        typeFilter: 'Все типы',
        sizeFilter: '159x8',
        availableSizesForType: elbowSizes,
        selectedCategory: 'Труба',
        hasFilledMaterial: true,
        diam: 159,
        wall: 8,
      });
      expect(cleared.isMaterialMismatch).toBe(false);
      expect(cleared.isSizeMismatch).toBe(false);
    });
  });

  describe('подсказки реквизитов из АВК и истории со связным заполнением', () => {
    const lrvWithAvk = makeLrv({
      id: 'lrv-avk',
      lrvCode: 'ЛРВ-500',
      shortName: 'Труба БШ',
      material: '09Г2С',
      diameterMm: 159,
      batches: [
        {
          id: 'b-ok',
          materialId: 'lrv-avk',
          actNumber: 'АВК-14',
          actDate: '2026-05-12',
          certificateNumber: 'СЕРТ-АВК-100',
          heatNumber: 'ПЛ-АВК-200',
          serialNumbers: ['SN-001', 'SN-002'],
          quantity: 10,
          unit: 'шт',
          verdict: 'accepted',
        },
        {
          id: 'b-rej',
          materialId: 'lrv-avk',
          actNumber: 'АВК-15-БРАК',
          actDate: '2026-05-13',
          certificateNumber: 'СЕРТ-БРАК',
          heatNumber: 'ПЛ-БРАК',
          serialNumbers: ['SN-BAD'],
          quantity: 2,
          unit: 'шт',
          verdict: 'rejected',
        },
      ],
    });

    const histSameLrv = makeJoint({
      id: 'j-hist-1',
      jointNumber: '010',
      lineNumber: 'ФП1.2/1',
      lrv1Code: 'ЛРВ-500',
      elem1Name: 'Труба БШ',
      elem1Material: '09Г2С',
      elem1DiameterMm: 159,
      elem1FactoryNumber: 'ЗН-ИСТ-1',
      elem1CertNumber: 'СЕРТ-ИСТ-1',
      elem1HeatNumber: 'ПЛ-ИСТ-1',
      elem1BatchNumber: 'ПАРТ-ИСТ-1',
    });

    const histAnalog = makeJoint({
      id: 'j-hist-2',
      jointNumber: '020',
      lineNumber: 'ФП2/1',
      lrv2Code: 'ЛРВ-999',
      elem2Name: 'Труба БШ',
      elem2Material: '09Г2С',
      elem2DiameterMm: 159,
      elem2CertNumber: 'СЕРТ-АНАЛОГ',
      elem2HeatNumber: 'ПЛ-АНАЛОГ',
      elem2BatchNumber: 'ПАРТ-АНАЛОГ',
    });

    it('приоритизирует допущенные АВК выше истории и исключает забракованные партии', () => {
      const suggestions = buildElementTraceabilitySuggestions({
        selectedLrvItem: lrvWithAvk,
        allJoints: [histSameLrv, histAnalog],
        currentJointId: 'j-current',
        elemName: 'Труба БШ',
        elemMaterial: '09Г2С',
        elemDiameterMm: 159,
      });

      expect(suggestions.certNumber.map((s) => s.value)).toEqual([
        'СЕРТ-АВК-100',
        'СЕРТ-ИСТ-1',
        'СЕРТ-АНАЛОГ',
      ]);
      expect(suggestions.certNumber[0].source).toBe('avk');
      expect(suggestions.certNumber[1].source).toBe('history_same_lrv');
      expect(suggestions.certNumber[2].source).toBe('history_analog');

      // Отклонённый АВК не попадает в подсказки
      expect(suggestions.certNumber.some((s) => s.value === 'СЕРТ-БРАК')).toBe(false);
      expect(suggestions.factoryNumber.some((s) => s.value === 'SN-BAD')).toBe(false);
      expect(suggestions.factoryNumber[0].value).toBe('SN-001');
      expect(suggestions.factoryNumber[0].bundle).toEqual({
        certNumber: 'СЕРТ-АВК-100',
        heatNumber: 'ПЛ-АВК-200',
        batchNumber: 'АВК-14',
      });
    });

    it('подтягивает всю связку сертификат/плавка/партия при выборе подсказки АВК и не затирает зав. №', () => {
      const suggestions = buildElementTraceabilitySuggestions({
        selectedLrvItem: lrvWithAvk,
        allJoints: [histSameLrv],
        currentJointId: 'j-current',
      });

      const baseForm = makeJoint({
        id: 'j-current',
        elem1FactoryNumber: 'МОЙ-ЗАВ-1',
      });

      // Выбор сертификата из АВК -> заполняются сертификат, плавка и партия, зав. № не трогается
      const afterCert = applyTraceabilitySuggestionToElement(
        baseForm,
        1,
        'certNumber',
        suggestions.certNumber[0]
      );
      expect(afterCert.elem1FactoryNumber).toBe('МОЙ-ЗАВ-1');
      expect(afterCert.elem1CertNumber).toBe('СЕРТ-АВК-100');
      expect(afterCert.elem1HeatNumber).toBe('ПЛ-АВК-200');
      expect(afterCert.elem1BatchNumber).toBe('АВК-14');

      // Выбор заводского номера из АВК для Элемента 2 -> заполняются зав. № + вся связка
      const afterFactory2 = applyTraceabilitySuggestionToElement(
        baseForm,
        2,
        'factoryNumber',
        suggestions.factoryNumber[0]
      );
      expect(afterFactory2.elem2FactoryNumber).toBe('SN-001');
      expect(afterFactory2.elem2CertNumber).toBe('СЕРТ-АВК-100');
      expect(afterFactory2.elem2HeatNumber).toBe('ПЛ-АВК-200');
      expect(afterFactory2.elem2BatchNumber).toBe('АВК-14');
    });
  });
});
