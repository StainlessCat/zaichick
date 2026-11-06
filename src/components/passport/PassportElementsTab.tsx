import React from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Copy,
  Lock,
  Search,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import {
  LrvElementCategory,
  LRVItem,
  WeldJoint,
} from '../../types/welding';
import {
  calculateEquivalentDiaInch,
  detectLrvElementType,
  LrvSizeOption,
  LRV_ELEMENT_TYPE_OPTIONS,
  mmToInchDiameter,
  normalizeDecimalInput,
  resolveLrvConnectionType,
  resolveLrvItemCategory,
} from '../../utils/weldingLogic';

export interface PassportElementsTabProps {
  form: WeldJoint;
  setForm: React.Dispatch<React.SetStateAction<WeldJoint>>;
  rbac: {
    canEditPrepAndWeldingFields: boolean;
  };
  filterLrvBySameDiameter: boolean;
  setFilterLrvBySameDiameter: (v: boolean) => void;
  allowCrossRdLrv: boolean;
  setAllowCrossRdLrv: (v: boolean) => void;
  availableLrvItems: LRVItem[];
  elem1Diam: number;
  elem2Diam: number;
  diameterValidation: { isMatch: boolean; message: string };
  elem1TypeFilter: LrvElementCategory;
  setElem1TypeFilter: (v: LrvElementCategory) => void;
  elem1SizeFilter: string;
  setElem1SizeFilter: (v: string) => void;
  elem1AvailableSizes: LrvSizeOption[];
  elem1SearchQuery: string;
  setElem1SearchQuery: (v: string) => void;
  elem2TypeFilter: LrvElementCategory;
  setElem2TypeFilter: (v: LrvElementCategory) => void;
  elem2SizeFilter: string;
  setElem2SizeFilter: (v: string) => void;
  elem2AvailableSizes: LrvSizeOption[];
  elem2SearchQuery: string;
  setElem2SearchQuery: (v: string) => void;
  filteredLrvOptionsElem1: LRVItem[];
  filteredLrvOptionsElem2: LRVItem[];
  selectedLrv1Item?: LRVItem;
  selectedLrv2Item?: LRVItem;
  handleSelectLrv1: (code: string) => void;
  handleSelectLrv2: (code: string) => void;
  handleCopyElem1ToElem2: () => void;
  handleSwapElements: () => void;
  formatLrvOptionLabel: (item: LRVItem) => string;
  onOpenLrvImport?: () => void;
}

export const PassportElementsTab: React.FC<PassportElementsTabProps> = ({
  form,
  setForm,
  rbac,
  filterLrvBySameDiameter,
  setFilterLrvBySameDiameter,
  allowCrossRdLrv,
  setAllowCrossRdLrv,
  availableLrvItems,
  elem1Diam,
  elem2Diam,
  diameterValidation,
  elem1TypeFilter,
  setElem1TypeFilter,
  elem1SizeFilter,
  setElem1SizeFilter,
  elem1AvailableSizes,
  elem1SearchQuery,
  setElem1SearchQuery,
  elem2TypeFilter,
  setElem2TypeFilter,
  elem2SizeFilter,
  setElem2SizeFilter,
  elem2AvailableSizes,
  elem2SearchQuery,
  setElem2SearchQuery,
  filteredLrvOptionsElem1,
  filteredLrvOptionsElem2,
  selectedLrv1Item,
  selectedLrv2Item,
  handleSelectLrv1,
  handleSelectLrv2,
  handleCopyElem1ToElem2,
  handleSwapElements,
  formatLrvOptionLabel,
}) => {
  return (
    <fieldset
      disabled={!rbac.canEditPrepAndWeldingFields}
      className={`space-y-4 border-0 p-0 m-0 min-w-0 ${
        !rbac.canEditPrepAndWeldingFields
          ? 'opacity-75 pointer-events-none select-none'
          : ''
      }`}
    >
      <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-3">
            <h3 className="text-xs font-bold text-slate-900">
              Свариваемые элементы («Элемент 1» и «Элемент 2»)
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={filterLrvBySameDiameter}
                onChange={(e) => setFilterLrvBySameDiameter(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-slate-300 text-[#1e3799]"
              />
              <span>Подбирать Элемент 2 по диаметру Элемента 1 (Ø{elem1Diam} мм)</span>
            </label>

            {!allowCrossRdLrv ? (
              <button
                type="button"
                onClick={() => setAllowCrossRdLrv(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#e8f1fc] text-[#1e3799] text-[11px] font-medium border border-sky-200"
              >
                <Lock className="w-3 h-3" />
                <span>ЛРВ по РД ({availableLrvItems.length}) · Снять блок</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAllowCrossRdLrv(false)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-300"
              >
                <Unlock className="w-3 h-3" />
                <span>ЛРВ из всех РД · Вернуть запрет</span>
              </button>
            )}
          </div>
        </div>

        {/* Индикатор проверки совпадения диаметров обоих элементов */}
        <div
          className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 ${
            diameterValidation.isMatch
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-red-50 border border-red-300 text-red-900 font-bold'
          }`}
        >
          <div className="flex items-center gap-2">
            {diameterValidation.isMatch ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{diameterValidation.message}</span>
          </div>
          <span className="font-mono text-xs font-bold">
            Эл.1: Ø{elem1Diam}×{form.elem1WallThickness ?? form.wallThickness} мм · Эл.2: Ø{elem2Diam}×{form.elem2WallThickness ?? form.wallThickness} мм · Экв. {calculateEquivalentDiaInch(elem1Diam || 0, form.elem1WallThickness ?? form.wallThickness ?? 0)}"
          </span>
        </div>

        {/* Карточки «Элемент 1» — [Иконки Копировать и Поменять местами] — «Элемент 2» */}
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 items-stretch">
          {/* ЭЛЕМЕНТ 1 (5 колонок) */}
          <div className="lg:col-span-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1e3799]">
                  Элемент 1
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 font-mono text-[11px] font-bold text-[#1e3799]">
                  <Lock className="w-3 h-3 text-slate-400" />
                  <span>Из базы ЛРВ · Ø{elem1Diam}×{form.elem1WallThickness ?? form.wallThickness} мм</span>
                </span>
              </div>

              {/* Каскадный подбор элемента 1: 1. Тип -> 2. Типоразмер (Ø×S) -> 3. Материал ЛРВ */}
              <div className="p-2.5 rounded-lg bg-white border border-slate-200/90 space-y-2">
                <div className="grid grid-cols-12 gap-1.5">
                  <div className="col-span-6">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      1. Тип элемента
                    </label>
                    <select
                      value={elem1TypeFilter}
                      onChange={(e) => {
                        setElem1TypeFilter(e.target.value as LrvElementCategory);
                        setElem1SizeFilter('all');
                      }}
                      aria-label="Тип элемента 1"
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-[11px] font-semibold text-[#1e3799]"
                    >
                      {LRV_ELEMENT_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t === 'Все типы' ? 'Все типы деталей' : t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-6">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      2. Типоразмер (Ø × S)
                    </label>
                    <select
                      value={elem1SizeFilter}
                      onChange={(e) => setElem1SizeFilter(e.target.value)}
                      aria-label="Типоразмер Элемента 1"
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-[11px] font-semibold text-slate-800"
                    >
                      <option value="all">Все размеры ({elem1AvailableSizes.length})</option>
                      {elem1AvailableSizes.map((sz) => (
                        <option key={sz.key} value={sz.key}>
                          {sz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={elem1SearchQuery}
                    onChange={(e) => setElem1SearchQuery(e.target.value)}
                    placeholder="Уточнить поиск: марка стали, завод, ГОСТ..."
                    aria-label="Поиск Элемента 1 по базе ЛРВ"
                    className="w-full pl-6 pr-2 py-1 bg-white border border-slate-300 rounded text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    3. Изделие / материал из базы ЛРВ (найдено: {filteredLrvOptionsElem1.length})
                  </label>
                  <select
                    value={form.lrv1Code}
                    onChange={(e) => handleSelectLrv1(e.target.value)}
                    aria-label="Изделие Элемент 1 из базы ЛРВ"
                    className="w-full px-2 py-1.5 bg-white border border-[#1e3799] rounded text-xs font-semibold text-[#1e3799]"
                  >
                    <option value="">— Выберите материал из базы ЛРВ —</option>
                    {filteredLrvOptionsElem1.map((item) => (
                      <option key={item.id} value={item.lrvCode}>
                        {formatLrvOptionLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Прямой ввод кода ЛРВ */}
                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500">Или прямой ввод кода ЛРВ:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={form.lrv1Code || ''}
                      onChange={(e) => handleSelectLrv1(e.target.value.trim())}
                      placeholder="Код ЛРВ..."
                      aria-label="Прямой ввод кода ЛРВ Элемент 1"
                      className="w-28 px-2 py-0.5 bg-slate-50 border border-slate-300 rounded text-[11px] font-mono font-bold text-center text-[#1e3799]"
                    />
                  </div>
                </div>
              </div>

              {selectedLrv1Item?.diameterMm2 && (
                <div className="flex items-center justify-between gap-1 px-2 py-1 rounded bg-[#e8f1fc] border border-sky-200 text-[11px]">
                  <span className="text-[#1e3799] font-medium">Торец детали (из ЛРВ):</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          elem1DiameterMm: selectedLrv1Item.diameterMm,
                          elem1WallThickness: selectedLrv1Item.wallThickness,
                          diameterMm: selectedLrv1Item.diameterMm,
                          diameterInch: mmToInchDiameter(selectedLrv1Item.diameterMm),
                          wallThickness: selectedLrv1Item.wallThickness,
                        }))
                      }
                      className={`px-2 py-0.5 rounded font-mono border ${
                        elem1Diam === selectedLrv1Item.diameterMm
                          ? 'bg-[#1e3799] text-white border-[#1e3799]'
                          : 'bg-white text-[#1e3799] border-sky-300'
                      }`}
                    >
                      Ø1: {selectedLrv1Item.diameterMm}×{selectedLrv1Item.wallThickness}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          elem1DiameterMm: selectedLrv1Item.diameterMm2!,
                          elem1WallThickness:
                            selectedLrv1Item.wallThickness2 ??
                            selectedLrv1Item.wallThickness,
                          diameterMm: selectedLrv1Item.diameterMm2!,
                          diameterInch: mmToInchDiameter(
                            selectedLrv1Item.diameterMm2!
                          ),
                          wallThickness:
                            selectedLrv1Item.wallThickness2 ??
                            selectedLrv1Item.wallThickness,
                        }))
                      }
                      className={`px-2 py-0.5 rounded font-mono border ${
                        elem1Diam === selectedLrv1Item.diameterMm2
                          ? 'bg-[#1e3799] text-white border-[#1e3799]'
                          : 'bg-white text-[#1e3799] border-sky-300'
                      }`}
                    >
                      Ø2: {selectedLrv1Item.diameterMm2}×
                      {selectedLrv1Item.wallThickness2 ?? selectedLrv1Item.wallThickness}
                    </button>
                  </div>
                </div>
              )}

              {/* Характеристики Элемента 1 строго из базы ЛРВ */}
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                    <span>Краткое наименование (из ЛРВ)</span>
                    <span className="font-mono text-[10px] text-[#1e3799] font-semibold">
                      {selectedLrv1Item
                        ? `${resolveLrvItemCategory(selectedLrv1Item)}${
                            resolveLrvItemCategory(selectedLrv1Item) === 'ЗРА'
                              ? ` (${resolveLrvConnectionType(selectedLrv1Item)})`
                              : ''
                          }`
                        : detectLrvElementType(form.elem1Name || '')}
                    </span>
                  </div>
                  <div
                    aria-label="Наименование Элемента 1 из базы ЛРВ"
                    className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-semibold text-slate-800 select-all"
                  >
                    {form.elem1Name || '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Диаметр Ø, мм
                  </label>
                  <div
                    aria-label="Диаметр Элемента 1"
                    className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono font-bold text-[#1e3799]"
                  >
                    {elem1Diam}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Толщина S, мм
                  </label>
                  <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono text-slate-800">
                    {form.elem1WallThickness ?? form.wallThickness}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Материал
                  </label>
                  <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono text-slate-800">
                    {form.elem1Material || '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    НТД
                  </label>
                  <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs text-slate-800 truncate">
                    {form.elem1Ntd || '—'}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Завод-поставщик (из ЛРВ)
                  </label>
                  <div
                    aria-label="Завод-поставщик Элемента 1"
                    className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs text-slate-800 truncate"
                    title={form.elem1Manufacturer || selectedLrv1Item?.manufacturer || ''}
                  >
                    {form.elem1Manufacturer || selectedLrv1Item?.manufacturer || '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 grid grid-cols-12 gap-2">
              <div className="col-span-7">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Заводской номер
                </label>
                <input
                  type="text"
                  value={form.elem1FactoryNumber || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      elem1FactoryNumber: e.target.value,
                    }))
                  }
                  placeholder="Зав. № детали 1"
                  aria-label="Заводской номер Элемента 1"
                  className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799]/50 rounded text-xs font-mono font-semibold text-slate-900"
                />
              </div>
              <div className="col-span-5">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Длина, м
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.elem1Length || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      elem1Length: normalizeDecimalInput(e.target.value),
                    }))
                  }
                  placeholder="Напр.: 11.8"
                  aria-label="Длина Элемента 1"
                  className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799]/50 rounded text-xs font-mono font-semibold text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* ЦЕНТРАЛЬНАЯ КОЛОНКА МЕЖДУ БЛОКАМИ: ИКОНКА КОПИРОВАНИЯ 1->2 И ИКОНКА ЗАМЕНЫ МЕСТАМИ 1<->2 */}
          <div className="lg:col-span-1 flex lg:flex-col items-center justify-center gap-2 py-1">
            <button
              type="button"
              onClick={handleCopyElem1ToElem2}
              aria-label="Скопировать данные из Элемента 1 в Элемент 2"
              title="Скопировать данные из Элемента 1 в Элемент 2"
              className="p-2.5 rounded-xl bg-[#e8f1fc] border border-[#1e3799]/30 text-[#1e3799] hover:bg-[#1e3799] hover:text-white transition-colors shadow-2xs"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleSwapElements}
              aria-label="Поменять местами Элемент 1 и Элемент 2"
              title="Поменять местами Элемент 1 и Элемент 2"
              className="p-2.5 rounded-xl bg-[#e8f1fc] border border-[#1e3799]/30 text-[#1e3799] hover:bg-[#1e3799] hover:text-white transition-colors shadow-2xs"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          {/* ЭЛЕМЕНТ 2 (5 колонок) */}
          <div className="lg:col-span-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1e3799]">
                  Элемент 2
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono text-[11px] font-bold ${
                    diameterValidation.isMatch
                      ? 'bg-white border-slate-200 text-[#1e3799]'
                      : 'bg-red-100 border-red-300 text-red-800'
                  }`}
                >
                  <Lock className="w-3 h-3 text-slate-400" />
                  <span>Из базы ЛРВ · Ø{elem2Diam}×{form.elem2WallThickness ?? form.wallThickness} мм</span>
                </span>
              </div>

              {/* Каскадный подбор элемента 2: 1. Тип -> 2. Типоразмер (Ø×S) -> 3. Материал ЛРВ */}
              <div className="p-2.5 rounded-lg bg-white border border-slate-200/90 space-y-2">
                <div className="grid grid-cols-12 gap-1.5">
                  <div className="col-span-6">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      1. Тип элемента
                    </label>
                    <select
                      value={elem2TypeFilter}
                      onChange={(e) => {
                        setElem2TypeFilter(e.target.value as LrvElementCategory);
                        setElem2SizeFilter('all');
                      }}
                      aria-label="Тип элемента 2"
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-[11px] font-semibold text-[#1e3799]"
                    >
                      {LRV_ELEMENT_TYPE_OPTIONS.map((t) => (
                        <option key={t} value={t}>
                          {t === 'Все типы' ? 'Все типы деталей' : t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-6">
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      2. Типоразмер (Ø × S)
                    </label>
                    <select
                      value={elem2SizeFilter}
                      onChange={(e) => setElem2SizeFilter(e.target.value)}
                      aria-label="Типоразмер Элемента 2"
                      className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-[11px] font-semibold text-slate-800"
                    >
                      <option value="all">Все размеры ({elem2AvailableSizes.length})</option>
                      {elem2AvailableSizes.map((sz) => (
                        <option key={sz.key} value={sz.key}>
                          {sz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="relative">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={elem2SearchQuery}
                    onChange={(e) => setElem2SearchQuery(e.target.value)}
                    placeholder="Уточнить поиск: марка стали, завод, ГОСТ..."
                    aria-label="Поиск Элемента 2 по базе ЛРВ"
                    className="w-full pl-6 pr-2 py-1 bg-white border border-slate-300 rounded text-[11px]"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                    3. Изделие / материал из базы ЛРВ (найдено: {filteredLrvOptionsElem2.length})
                  </label>
                  <select
                    value={form.lrv2Code}
                    onChange={(e) => handleSelectLrv2(e.target.value)}
                    aria-label="Изделие Элемент 2 из базы ЛРВ"
                    className="w-full px-2 py-1.5 bg-white border border-[#1e3799] rounded text-xs font-semibold text-[#1e3799]"
                  >
                    <option value="">— Выберите материал из базы ЛРВ —</option>
                    {filteredLrvOptionsElem2.map((item) => (
                      <option key={item.id} value={item.lrvCode}>
                        {formatLrvOptionLabel(item)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Прямой ввод кода ЛРВ */}
                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-500">Или прямой ввод кода ЛРВ:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={form.lrv2Code || ''}
                      onChange={(e) => handleSelectLrv2(e.target.value.trim())}
                      placeholder="Код ЛРВ..."
                      aria-label="Прямой ввод кода ЛРВ Элемент 2"
                      className="w-28 px-2 py-0.5 bg-slate-50 border border-slate-300 rounded text-[11px] font-mono font-bold text-center text-[#1e3799]"
                    />
                  </div>
                </div>
              </div>

              {selectedLrv2Item?.diameterMm2 && (
                <div className="flex items-center justify-between gap-1 px-2 py-1 rounded bg-[#e8f1fc] border border-sky-200 text-[11px]">
                  <span className="text-[#1e3799] font-medium">Торец детали (из ЛРВ):</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          elem2DiameterMm: selectedLrv2Item.diameterMm,
                          elem2WallThickness: selectedLrv2Item.wallThickness,
                        }))
                      }
                      className={`px-2 py-0.5 rounded font-mono border ${
                        elem2Diam === selectedLrv2Item.diameterMm
                          ? 'bg-[#1e3799] text-white border-[#1e3799]'
                          : 'bg-white text-[#1e3799] border-sky-300'
                      }`}
                    >
                      Ø1: {selectedLrv2Item.diameterMm}×{selectedLrv2Item.wallThickness}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          elem2DiameterMm: selectedLrv2Item.diameterMm2!,
                          elem2WallThickness:
                            selectedLrv2Item.wallThickness2 ??
                            selectedLrv2Item.wallThickness,
                        }))
                      }
                      className={`px-2 py-0.5 rounded font-mono border ${
                        elem2Diam === selectedLrv2Item.diameterMm2
                          ? 'bg-[#1e3799] text-white border-[#1e3799]'
                          : 'bg-white text-[#1e3799] border-sky-300'
                      }`}
                    >
                      Ø2: {selectedLrv2Item.diameterMm2}×
                      {selectedLrv2Item.wallThickness2 ?? selectedLrv2Item.wallThickness}
                    </button>
                  </div>
                </div>
              )}

              {/* Характеристики Элемента 2 строго из базы ЛРВ */}
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
                    <span>Краткое наименование (из ЛРВ)</span>
                    <span className="font-mono text-[10px] text-[#1e3799] font-semibold">
                      {selectedLrv2Item
                        ? `${resolveLrvItemCategory(selectedLrv2Item)}${
                            resolveLrvItemCategory(selectedLrv2Item) === 'ЗРА'
                              ? ` (${resolveLrvConnectionType(selectedLrv2Item)})`
                              : ''
                          }`
                        : detectLrvElementType(form.elem2Name || '')}
                    </span>
                  </div>
                  <div
                    aria-label="Наименование Элемента 2 из базы ЛРВ"
                    className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-semibold text-slate-800 select-all"
                  >
                    {form.elem2Name || '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Диаметр Ø, мм
                  </label>
                  <div
                    aria-label="Диаметр Элемента 2"
                    className={`w-full px-2.5 py-1.5 border rounded text-xs font-mono font-bold ${
                      diameterValidation.isMatch
                        ? 'bg-slate-100/90 border-slate-200 text-[#1e3799]'
                        : 'bg-red-50 border-red-400 text-red-700'
                    }`}
                  >
                    {elem2Diam}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Толщина S, мм
                  </label>
                  <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono text-slate-800">
                    {form.elem2WallThickness ?? form.wallThickness}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Материал
                  </label>
                  <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono text-slate-800">
                    {form.elem2Material || '—'}
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    НТД
                  </label>
                  <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs text-slate-800 truncate">
                    {form.elem2Ntd || '—'}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] text-slate-500 mb-0.5">
                    Завод-поставщик (из ЛРВ)
                  </label>
                  <div
                    aria-label="Завод-поставщик Элемента 2"
                    className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs text-slate-800 truncate"
                    title={form.elem2Manufacturer || selectedLrv2Item?.manufacturer || ''}
                  >
                    {form.elem2Manufacturer || selectedLrv2Item?.manufacturer || '—'}
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 grid grid-cols-12 gap-2">
              <div className="col-span-7">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Заводской номер
                </label>
                <input
                  type="text"
                  value={form.elem2FactoryNumber || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      elem2FactoryNumber: e.target.value,
                    }))
                  }
                  placeholder="Зав. № детали 2"
                  aria-label="Заводской номер Элемента 2"
                  className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799]/50 rounded text-xs font-mono font-semibold text-slate-900"
                />
              </div>
              <div className="col-span-5">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Длина, м
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={form.elem2Length || ''}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      elem2Length: normalizeDecimalInput(e.target.value),
                    }))
                  }
                  placeholder="Напр.: 0.35"
                  aria-label="Длина Элемента 2"
                  className="w-full px-2.5 py-1.5 bg-white border border-[#1e3799]/50 rounded text-xs font-mono font-semibold text-slate-900"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
};
