import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, PackagePlus, X } from 'lucide-react';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import { LRVItem, LrvElementCategory } from '../../types/welding';
import { detectLrvElementType, isDualDimensionElement } from '../../utils/pipeCalc';

export interface LrvItemFormModalProps {
  isOpen: boolean;
  editingItem: LRVItem | null;
  allRds: { objectName: string; code: string; title: string }[];
  defaultRdCode: string;
  catalog: LRVItem[];
  onSave: (item: LRVItem, isEdit: boolean) => void;
  onCancel: () => void;
}

const ELEMENT_CATEGORIES: LrvElementCategory[] = [
  'Труба',
  'Отвод',
  'Переход',
  'Тройник',
  'ЗРА',
  'Фланец',
  'Заглушка',
  'Штуцер',
  'Бобышка',
  'Прочее',
];

export const LrvItemFormModal: React.FC<LrvItemFormModalProps> = ({
  isOpen,
  editingItem,
  allRds,
  defaultRdCode,
  catalog,
  onSave,
  onCancel,
}) => {
  const [lrvCode, setLrvCode] = useState('');
  const [rdCode, setRdCode] = useState('');
  const [shortName, setShortName] = useState('');
  const [marking, setMarking] = useState('');
  const [pnMpa, setPnMpa] = useState('');
  const [fullName, setFullName] = useState('');
  const [category, setCategory] = useState<LrvElementCategory | ''>('');
  const [connectionType, setConnectionType] = useState<string>('');
  const [material, setMaterial] = useState('');
  const [ntd, setNtd] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [dn1, setDn1] = useState('');
  const [diameter, setDiameter] = useState('');
  const [wall, setWall] = useState('');
  const [dn2, setDn2] = useState('');
  const [diameter2, setDiameter2] = useState('');
  const [wall2, setWall2] = useState('');
  const [specQty, setSpecQty] = useState('');
  const [unit, setUnit] = useState<'шт' | 'м'>('шт');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFormError('');
    if (editingItem) {
      setLrvCode(editingItem.lrvCode);
      setRdCode(editingItem.rdCode);
      setShortName(editingItem.shortName);
      setMarking(editingItem.marking || '');
      setPnMpa(editingItem.pnMpa || '');
      setFullName(editingItem.fullName || '');
      setCategory(editingItem.category || detectLrvElementType(editingItem.shortName));
      setConnectionType(editingItem.connectionType || '');
      setMaterial(editingItem.material);
      setNtd(editingItem.ntd);
      setManufacturer(editingItem.manufacturer || '');
      setDn1(editingItem.dn1 !== undefined ? String(editingItem.dn1) : '');
      setDiameter(editingItem.diameterMm ? String(editingItem.diameterMm) : '');
      setWall(editingItem.wallThickness ? String(editingItem.wallThickness) : '');
      setDn2(editingItem.dn2 !== undefined ? String(editingItem.dn2) : '');
      setDiameter2(editingItem.diameterMm2 !== undefined ? String(editingItem.diameterMm2) : '');
      setWall2(editingItem.wallThickness2 !== undefined ? String(editingItem.wallThickness2) : '');
      setSpecQty(editingItem.specQty ? String(editingItem.specQty) : '');
      setUnit(editingItem.unit || 'шт');
    } else {
      const initialRd =
        defaultRdCode && defaultRdCode !== 'ALL' ? defaultRdCode : allRds[0]?.code || '';
      setLrvCode('');
      setRdCode(initialRd);
      setShortName('');
      setMarking('');
      setPnMpa('');
      setFullName('');
      setCategory('');
      setConnectionType('');
      setMaterial('');
      setNtd('');
      setManufacturer('');
      setDn1('');
      setDiameter('');
      setWall('');
      setDn2('');
      setDiameter2('');
      setWall2('');
      setSpecQty('');
      setUnit('шт');
    }
  }, [isOpen, editingItem, defaultRdCode, allRds]);

  const isDirty = Boolean(
    editingItem
      ? lrvCode !== editingItem.lrvCode ||
        shortName !== editingItem.shortName ||
        material !== editingItem.material ||
        ntd !== editingItem.ntd ||
        specQty !== String(editingItem.specQty || '')
      : lrvCode.trim() || shortName.trim() || material.trim() || ntd.trim()
  );

  const { handleRequestClose } = useModalDismiss({
    isOpen,
    isDirty,
    onClose: onCancel,
    confirmMessage: 'В карточке материала есть несохранённые изменения. Закрыть без сохранения?',
  });

  if (!isOpen) return null;

  const isDualDim =
    isDualDimensionElement(shortName, category) || Boolean(diameter2) || Boolean(wall2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const trimmedCode = lrvCode.trim();
    const trimmedName = shortName.trim();
    const effectiveRd = rdCode.trim() || allRds[0]?.code || '';

    if (!trimmedCode) {
      setFormError('Укажите код ЛРВ');
      return;
    }
    if (!effectiveRd) {
      setFormError('Выберите шифр РД');
      return;
    }
    if (!trimmedName) {
      setFormError('Укажите краткое наименование элемента');
      return;
    }

    const duplicate = catalog.find(
      (i) =>
        i.id !== editingItem?.id &&
        i.rdCode.trim().toLowerCase() === effectiveRd.toLowerCase() &&
        i.lrvCode.trim().toLowerCase() === trimmedCode.toLowerCase()
    );
    if (duplicate) {
      setFormError(`Позиция с кодом «${trimmedCode}» уже существует в выбранном шифре РД`);
      return;
    }

    const rdObj = allRds.find((r) => r.code === effectiveRd);
    const parsedD1 = Number(String(diameter).replace(',', '.')) || 0;
    const parsedS1 = Number(String(wall).replace(',', '.')) || 0;
    const parsedQty = Number(String(specQty).replace(',', '.')) || 0;

    const itemPayload: LRVItem = {
      ...(editingItem || {}),
      id: editingItem ? editingItem.id : `lrv-${Date.now()}`,
      lrvCode: trimmedCode,
      rdCode: effectiveRd,
      objectName: editingItem?.objectName || rdObj?.objectName || allRds[0]?.objectName || '',
      shortName: trimmedName,
      marking: marking.trim() || undefined,
      pnMpa: pnMpa.trim() || undefined,
      fullName: fullName.trim() || undefined,
      category: category || detectLrvElementType(trimmedName),
      connectionType: connectionType || undefined,
      material: material.trim(),
      ntd: ntd.trim(),
      manufacturer: manufacturer.trim() || undefined,
      dn1: dn1.trim() ? Number(dn1) : undefined,
      diameterMm: parsedD1,
      wallThickness: parsedS1,
      dn2: dn2.trim() ? Number(dn2) : undefined,
      diameterMm2: diameter2.trim() ? Number(String(diameter2).replace(',', '.')) : undefined,
      wallThickness2: wall2.trim() ? Number(String(wall2).replace(',', '.')) : undefined,
      specQty: parsedQty,
      totalSpecQty: parsedQty,
      unit,
    };

    onSave(itemPayload, Boolean(editingItem));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label={editingItem ? 'Редактирование позиции ЛРВ' : 'Добавление позиции в базу материалов'}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="bg-[#1e3799] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <PackagePlus className="w-5 h-5 text-blue-200 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-bold text-base">
                {editingItem
                  ? `Редактирование позиции ${editingItem.lrvCode}`
                  : 'Новая позиция базы материалов'}
              </h3>
              <p className="text-xs text-blue-100 truncate">
                Реквизиты спецификации и геометрические параметры элемента
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Закрыть окно"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-800">
          {formError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-300 text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Код ЛРВ
              </label>
              <input
                type="text"
                required
                value={lrvCode}
                onChange={(e) => setLrvCode(e.target.value)}
                placeholder="ЛРВ-001ТХ3-0601"
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono font-semibold text-[#1e3799] focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Шифр РД
              </label>
              <select
                value={rdCode}
                onChange={(e) => setRdCode(e.target.value)}
                required
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
              >
                {allRds.length === 0 && <option value="">Нет доступных шифров РД</option>}
                {allRds.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.code}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Краткое наименование
              </label>
              <input
                type="text"
                required
                value={shortName}
                onChange={(e) => {
                  const val = e.target.value;
                  setShortName(val);
                  if (!category && val.trim()) {
                    setCategory(detectLrvElementType(val));
                  }
                }}
                placeholder="Отвод 90° 159х8"
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Категория
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as LrvElementCategory | '')}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
              >
                <option value="">Автоопределение</option>
                {ELEMENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Марка стали
              </label>
              <input
                type="text"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="09Г2С"
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                НТД
              </label>
              <input
                type="text"
                value={ntd}
                onChange={(e) => setNtd(e.target.value)}
                placeholder="ГОСТ 17375-2001"
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Завод-изготовитель
              </label>
              <input
                type="text"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="ПАО «ЧТПЗ»"
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Маркировка
              </label>
              <input
                type="text"
                value={marking}
                onChange={(e) => setMarking(e.target.value)}
                placeholder="КШ-DN200-PN16"
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Давление PN, МПа
              </label>
              <input
                type="text"
                value={pnMpa}
                onChange={(e) => setPnMpa(e.target.value)}
                placeholder="16,0"
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Тип подсоединения
              </label>
              <select
                value={connectionType}
                onChange={(e) => setConnectionType(e.target.value)}
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
              >
                <option value="">Не задано</option>
                <option value="приварной">Приварной</option>
                <option value="фланцевый">Фланцевый</option>
                <option value="муфтовый">Муфтовый</option>
                <option value="резьбовой">Резьбовой</option>
              </select>
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                Полное наименование по спецификации
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Полное проектное наименование из заказной спецификации"
                className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-3">
            <div className="text-[11px] font-bold text-slate-700">
              Геометрические размеры и объём по спецификации
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">DN 1</label>
                <input
                  type="number"
                  min={0}
                  value={dn1}
                  onChange={(e) => setDn1(e.target.value)}
                  placeholder="150"
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono tabular-nums focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Ø1, мм</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={diameter}
                  onChange={(e) => setDiameter(e.target.value)}
                  placeholder="159"
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono tabular-nums focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">S1, мм</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={wall}
                  onChange={(e) => setWall(e.target.value)}
                  placeholder="8.0"
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono tabular-nums focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">DN 2</label>
                <input
                  type="number"
                  min={0}
                  value={dn2}
                  onChange={(e) => setDn2(e.target.value)}
                  placeholder={isDualDim ? '100' : '—'}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono tabular-nums focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">Ø2, мм</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={diameter2}
                  onChange={(e) => setDiameter2(e.target.value)}
                  placeholder={isDualDim ? '108' : '—'}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono tabular-nums focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-600 mb-1">S2, мм</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={wall2}
                  onChange={(e) => setWall2(e.target.value)}
                  placeholder={isDualDim ? '6.0' : '—'}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono tabular-nums focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Кол-во</label>
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={specQty}
                  onChange={(e) => setSpecQty(e.target.value)}
                  placeholder="10"
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono font-semibold tabular-nums focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Ед. изм.</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as 'шт' | 'м')}
                  className="w-full px-2.5 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-[#1e3799]/25 focus:border-[#1e3799] outline-none"
                >
                  <option value="шт">шт</option>
                  <option value="м">м</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={handleRequestClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-[#1e3799] hover:bg-[#15286e] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{editingItem ? 'Сохранить изменения' : 'Добавить позицию'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
