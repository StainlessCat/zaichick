import React, { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { LRVItem, LrvElementCategory } from '../../types/welding';
import {
  detectLrvConnectionType,
  detectLrvElementType,
  generateLrvFullName,
  getLrvItemDn1,
  getLrvItemDn2,
  LRV_ELEMENT_TYPE_OPTIONS,
  mmToNominalBoreDn,
  resolveLrvConnectionType,
  resolveLrvItemCategory,
} from '../../utils/weldingLogic';

interface RdOption {
  code: string;
  objectName: string;
}

interface LrvItemFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingItem: LRVItem | null;
  allRds: RdOption[];
  existingItems: LRVItem[];
  onSave: (item: LRVItem) => void;
}

export const LrvItemFormModal: React.FC<LrvItemFormModalProps> = ({
  isOpen,
  onClose,
  editingItem,
  allRds,
  existingItems,
  onSave,
}) => {
  const [newRd, setNewRd] = useState(allRds[0]?.code || '');
  const [newLrvCode, setNewLrvCode] = useState('ЛРВ-001ТХ3-0501');
  const [newShortName, setNewShortName] = useState('Переход К 219х10-159х8');
  const [newCategory, setNewCategory] = useState<LrvElementCategory>('Переход');
  const [newConnectionType, setNewConnectionType] = useState<'приварной' | 'фланцевый'>('приварной');
  const [isCategoryManuallySet, setIsCategoryManuallySet] = useState(false);
  const [newMarking, setNewMarking] = useState('');
  const [newPnMpa, setNewPnMpa] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [isFullNameManual, setIsFullNameManual] = useState(false);
  const [newMaterial, setNewMaterial] = useState('09Г2С');
  const [newNtd, setNewNtd] = useState('ГОСТ 17378-2001');
  const [newManufacturer, setNewManufacturer] = useState('ПАО «ЧТПЗ»');
  const [newDn1, setNewDn1] = useState<number>(200);
  const [newDiameter1, setNewDiameter1] = useState(219);
  const [newThickness1, setNewThickness1] = useState(10);
  const [hasSecondDimension, setHasSecondDimension] = useState(true);
  const [newDn2, setNewDn2] = useState<number>(150);
  const [newDiameter2, setNewDiameter2] = useState<number>(159);
  const [newThickness2, setNewThickness2] = useState<number>(8);
  const [newQty, setNewQty] = useState(16);
  const [newUnit, setNewUnit] = useState<'шт' | 'м'>('шт');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (editingItem) {
      setFormError('');
      setNewRd(editingItem.rdCode);
      setNewLrvCode(editingItem.lrvCode);
      setNewShortName(editingItem.shortName);
      setNewCategory(resolveLrvItemCategory(editingItem));
      setNewConnectionType(resolveLrvConnectionType(editingItem));
      setIsCategoryManuallySet(true);
      setNewMarking(editingItem.marking || '');
      setNewPnMpa(editingItem.pnMpa || '');
      setNewFullName(editingItem.fullName || '');
      setIsFullNameManual(Boolean(editingItem.fullName));
      setNewMaterial(editingItem.material);
      setNewNtd(editingItem.ntd);
      setNewManufacturer(editingItem.manufacturer || '');
      setNewDn1(getLrvItemDn1(editingItem) || 150);
      setNewDiameter1(editingItem.diameterMm);
      setNewThickness1(editingItem.wallThickness);
      const has2 = Boolean(editingItem.diameterMm2 || editingItem.wallThickness2);
      setHasSecondDimension(has2);
      setNewDn2(getLrvItemDn2(editingItem) || 100);
      setNewDiameter2(editingItem.diameterMm2 || 108);
      setNewThickness2(editingItem.wallThickness2 || 6);
      setNewQty(editingItem.specQty);
      setNewUnit(editingItem.unit);
    } else {
      setFormError('');
      if (allRds.length > 0) {
        setNewRd(allRds[0].code);
      }
      setIsCategoryManuallySet(false);
      setNewMarking('');
      setNewPnMpa('');
      setNewFullName('');
      setIsFullNameManual(false);
    }
  }, [editingItem, allRds]);

  // Автогенерация полного наименования при изменении базовых атрибутов (если не правилось вручную)
  useEffect(() => {
    if (!isFullNameManual) {
      const auto = generateLrvFullName({
        category: newCategory,
        shortName: newShortName,
        dn1: newDn1,
        pnMpa: newPnMpa,
        marking: newMarking,
        material: newMaterial,
        ntd: newNtd,
      });
      setNewFullName(auto);
    }
  }, [newCategory, newShortName, newDn1, newPnMpa, newMarking, newMaterial, newNtd, isFullNameManual]);

  if (!isOpen) return null;

  const handleShortNameChange = (val: string) => {
    setNewShortName(val);
    if (!isCategoryManuallySet) {
      const autoCat = detectLrvElementType(val);
      setNewCategory(autoCat);
      setNewConnectionType(detectLrvConnectionType(val));
    }
  };

  const handleResetFullNameToAuto = () => {
    setIsFullNameManual(false);
    const auto = generateLrvFullName({
      category: newCategory,
      shortName: newShortName,
      dn1: newDn1,
      pnMpa: newPnMpa,
      marking: newMarking,
      material: newMaterial,
      ntd: newNtd,
    });
    setNewFullName(auto);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanCode = newLrvCode.trim();
    if (!cleanCode) {
      setFormError('Укажите код ЛРВ.');
      return;
    }

    if (
      existingItems.some(
        (existing) =>
          existing.id !== editingItem?.id &&
          existing.lrvCode.toLowerCase() === cleanCode.toLowerCase()
      )
    ) {
      setFormError(
        `Код ЛРВ «${cleanCode}» уже существует в каталоге. Дублирование кодов ЛРВ запрещено.`
      );
      return;
    }

    const rdEntry = allRds.find((r) => r.code === newRd) || allRds[0];
    const d1 = Number(String(newDiameter1).replace(',', '.'));
    const s1 = Number(String(newThickness1).replace(',', '.'));
    const d2 =
      hasSecondDimension && newDiameter2
        ? Number(String(newDiameter2).replace(',', '.'))
        : undefined;
    const s2 =
      hasSecondDimension && newThickness2
        ? Number(String(newThickness2).replace(',', '.'))
        : undefined;

    if (Number.isNaN(d1) || d1 < 10 || d1 > 2520) {
      setFormError('Диаметр Ø1 должен быть в пределах от 10 до 2520 мм.');
      return;
    }
    if (Number.isNaN(s1) || s1 < 1 || s1 >= d1 / 2) {
      setFormError(
        `Толщина стенки S1 (${s1} мм) должна быть от 1 мм и меньше половины диаметра (${
          d1 / 2
        } мм).`
      );
      return;
    }
    if (hasSecondDimension && d2 !== undefined) {
      if (Number.isNaN(d2) || d2 < 10 || d2 > 2520) {
        setFormError('Диаметр Ø2 должен быть в пределах от 10 до 2520 мм.');
        return;
      }
      if (s2 !== undefined && (Number.isNaN(s2) || s2 < 1 || s2 >= d2 / 2)) {
        setFormError(
          `Толщина стенки S2 (${s2} мм) должна быть от 1 мм и меньше половины диаметра Ø2 (${
            d2 / 2
          } мм).`
        );
        return;
      }
    }

    const computedDn1 = Number(newDn1) || mmToNominalBoreDn(d1);
    const computedDn2 =
      hasSecondDimension && d2 !== undefined
        ? Number(newDn2) || mmToNominalBoreDn(d2)
        : undefined;

    const item: LRVItem = {
      id: editingItem?.id || `lrv-${Date.now()}`,
      lrvCode: cleanCode,
      rdCode: rdEntry?.code || newRd.trim() || 'НОВЫЙ-ШИФР-РД',
      objectName: rdEntry?.objectName || 'Новый объект',
      shortName: newShortName.trim(),
      category: newCategory,
      connectionType: newCategory === 'ЗРА' ? newConnectionType : undefined,
      marking: newMarking.trim() || undefined,
      pnMpa: newPnMpa.trim() || undefined,
      fullName: newFullName.trim() || undefined,
      material: newMaterial.trim(),
      ntd: newNtd.trim(),
      manufacturer: newManufacturer.trim() || undefined,
      dn1: computedDn1,
      diameterMm: d1,
      wallThickness: s1,
      dn2: computedDn2,
      diameterMm2: d2,
      wallThickness2: s2,
      specQty: Math.max(1, Number(newQty) || 1),
      unit: newUnit,
      status: editingItem?.status || 'active',
      replacementLetter: editingItem?.replacementLetter,
      replacementDate: editingItem?.replacementDate,
      batches: editingItem?.batches || [],
    };

    onSave(item);
    onClose();
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-sm"
    >
      {formError && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-semibold">
          {formError}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-bold text-[#1e3799]">
          {editingItem
            ? `Редактирование позиции базы материалов: ${newLrvCode}`
            : 'Новая позиция базы материалов'}
        </h3>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={hasSecondDimension}
            onChange={(e) => setHasSecondDimension(e.target.checked)}
            className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
          />
          <span>Переход / переходной тройник (DN 2, Ø2, S2)</span>
        </label>
      </div>

      {/* Строка 1: Основные идентификаторы */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-3">
          <label className="block text-xs text-slate-600 mb-1">Шифр РД *</label>
          {allRds.length > 0 ? (
            <select
              value={newRd}
              onChange={(e) => setNewRd(e.target.value)}
              className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
            >
              {allRds.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              required
              value={newRd}
              onChange={(e) => setNewRd(e.target.value)}
              placeholder="Введите шифр РД..."
              className="w-full px-3 py-1.5 bg-white border border-[#1e3799] rounded text-xs font-mono"
            />
          )}
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-600 mb-1">Код ЛРВ *</label>
          <input
            type="text"
            required
            value={newLrvCode}
            onChange={(e) => setNewLrvCode(e.target.value)}
            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
          />
        </div>
        <div className={newCategory === 'ЗРА' ? 'sm:col-span-4' : 'sm:col-span-5'}>
          <label className="block text-xs text-slate-600 mb-1">Краткое наименование *</label>
          <input
            type="text"
            required
            value={newShortName}
            onChange={(e) => handleShortNameChange(e.target.value)}
            placeholder="Кран шаровой, Отвод 90°, Труба..."
            className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-600 mb-1">Категория *</label>
          <select
            value={newCategory}
            onChange={(e) => {
              setNewCategory(e.target.value as LrvElementCategory);
              setIsCategoryManuallySet(true);
            }}
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-semibold text-[#1e3799]"
          >
            {LRV_ELEMENT_TYPE_OPTIONS.filter((t) => t !== 'Все типы').map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        {newCategory === 'ЗРА' && (
          <div className="sm:col-span-1">
            <label className="block text-xs text-amber-800 font-semibold mb-1">Подсоед.</label>
            <select
              value={newConnectionType}
              onChange={(e) =>
                setNewConnectionType(e.target.value as 'приварной' | 'фланцевый')
              }
              className="w-full px-1.5 py-1.5 bg-amber-50 border border-amber-300 rounded text-xs font-semibold text-amber-900"
            >
              <option value="приварной">Приварн.</option>
              <option value="фланцевый">Фланц.</option>
            </select>
          </div>
        )}
      </div>

      {/* Строка 2: Маркировка, PN, Сталь, НТД, Завод */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
        <div className="sm:col-span-3">
          <label className="block text-xs text-slate-600 mb-1">Маркировка</label>
          <input
            type="text"
            value={newMarking}
            onChange={(e) => setNewMarking(e.target.value)}
            placeholder="напр. КШР-50-16-Ф.ХЛ1"
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-600 mb-1">PN, МПа</label>
          <input
            type="text"
            value={newPnMpa}
            onChange={(e) => setNewPnMpa(e.target.value)}
            placeholder="16 или 1,6"
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-600 mb-1">Марка стали</label>
          <input
            type="text"
            value={newMaterial}
            onChange={(e) => setNewMaterial(e.target.value)}
            placeholder="09Г2С, 20..."
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
          />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs text-slate-600 mb-1">НТД (ГОСТ / ТУ)</label>
          <input
            type="text"
            value={newNtd}
            onChange={(e) => setNewNtd(e.target.value)}
            placeholder="ТУ 1483-18..."
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
          />
        </div>
        <div className="sm:col-span-3">
          <label className="block text-xs text-slate-600 mb-1">Завод-изготовитель</label>
          <input
            type="text"
            value={newManufacturer}
            onChange={(e) => setNewManufacturer(e.target.value)}
            placeholder="ПАО «ЧТПЗ»"
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
          />
        </div>
      </div>

      {/* Строка 3: Полное наименование с индикатором авто/ручной правки */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs text-slate-700 font-semibold flex items-center gap-2">
            <span>Полное наименование</span>
            {isFullNameManual ? (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-normal">
                ручная правка
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-100 text-[#005EB8] font-normal">
                автогенерация
              </span>
            )}
          </label>
          {isFullNameManual && (
            <button
              type="button"
              onClick={handleResetFullNameToAuto}
              title="Сбросить ручные правки и сформировать полное наименование по шаблону"
              className="text-[11px] text-[#005EB8] hover:text-[#00478a] hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Вернуть автогенерацию</span>
            </button>
          )}
        </div>
        <input
          type="text"
          value={newFullName}
          onChange={(e) => {
            setNewFullName(e.target.value);
            setIsFullNameManual(true);
          }}
          placeholder="Кран шаровой DN 50, PN 16 МПа, КШР-50-16-Ф.ХЛ1, 09Г2С, ТУ 1483-18-16788656-2013"
          className="w-full px-3 py-1.5 bg-slate-50/60 focus:bg-white border border-slate-300 focus:border-[#005EB8] rounded text-xs text-slate-900 font-medium transition-colors"
        />
      </div>

      {/* Строка 4: Геометрические параметры и количество */}
      <div className="grid grid-cols-2 sm:grid-cols-9 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">DN 1</label>
          <input
            type="number"
            value={newDn1}
            onChange={(e) => setNewDn1(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Диаметр Ø1, мм</label>
          <input
            type="number"
            value={newDiameter1}
            onChange={(e) => {
              const d = Number(e.target.value);
              setNewDiameter1(d);
              const autoDn = mmToNominalBoreDn(d);
              if (autoDn !== undefined) setNewDn1(autoDn);
            }}
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Толщина S1, мм</label>
          <input
            type="number"
            step="0.5"
            value={newThickness1}
            onChange={(e) => setNewThickness1(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
          />
        </div>
        {hasSecondDimension && (
          <>
            <div>
              <label className="block text-xs text-[#1e3799] font-semibold mb-1">DN 2</label>
              <input
                type="number"
                value={newDn2}
                onChange={(e) => setNewDn2(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-[#f4f8fe] border border-[#1e3799]/40 rounded text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-[#1e3799] font-semibold mb-1">Диаметр Ø2, мм</label>
              <input
                type="number"
                value={newDiameter2}
                onChange={(e) => {
                  const d = Number(e.target.value);
                  setNewDiameter2(d);
                  const autoDn = mmToNominalBoreDn(d);
                  if (autoDn !== undefined) setNewDn2(autoDn);
                }}
                className="w-full px-2.5 py-1.5 bg-[#f4f8fe] border border-[#1e3799]/40 rounded text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-[#1e3799] font-semibold mb-1">Толщина S2, мм</label>
              <input
                type="number"
                step="0.5"
                value={newThickness2}
                onChange={(e) => setNewThickness2(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 bg-[#f4f8fe] border border-[#1e3799]/40 rounded text-xs font-mono"
              />
            </div>
          </>
        )}
        <div className={hasSecondDimension ? 'sm:col-span-3' : 'sm:col-span-6'}>
          <label className="block text-xs text-slate-600 mb-1">Кол-во по спец.</label>
          <div className="flex gap-1">
            <input
              type="number"
              value={newQty}
              onChange={(e) => setNewQty(Number(e.target.value))}
              className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
            />
            <select
              value={newUnit}
              onChange={(e) => setNewUnit(e.target.value as 'шт' | 'м')}
              className="px-2 py-1.5 bg-white border border-slate-300 rounded text-xs"
            >
              <option value="шт">шт</option>
              <option value="м">м</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded border border-slate-300 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          Отмена
        </button>
        <button
          type="submit"
          className="px-4 py-1.5 rounded bg-[#005EB8] text-white text-xs font-semibold hover:bg-[#00478a] cursor-pointer shadow-xs transition-colors"
        >
          Сохранить позицию
        </button>
      </div>
    </form>
  );
};
