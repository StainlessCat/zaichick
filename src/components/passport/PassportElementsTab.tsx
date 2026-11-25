import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Copy,
  History,
  Lock,
  RotateCcw,
  Search,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import {
  LrvElementCategory,
  LRVItem,
  WeldJoint,
} from '../../types/welding';
import {
  calculateEquivalentDiaInch,
  checkWallThicknessTransition,
  detectLrvElementType,
  LrvSizeOption,
  LRV_ELEMENT_TYPE_OPTIONS,
  mmToInchDiameter,
  normalizeDecimalInput,
  resolveLrvConnectionType,
  resolveLrvItemCategory,
} from '../../utils/weldingLogic';
import {
  applyTraceabilitySuggestionToElement,
  buildElementTraceabilitySuggestions,
  filterSizeOptionsLive,
  searchLrvCodeSuggestions,
  TraceabilityField,
  TraceabilitySuggestion,
} from '../../utils/passportSmartInput';
import {
  SmartAutocompleteInput,
  SmartAutocompleteOption,
} from './SmartAutocompleteInput';

export interface PassportElementsTabProps {
  form: WeldJoint;
  setForm: React.Dispatch<React.SetStateAction<WeldJoint>>;
  allJoints: WeldJoint[];
  copyableLineJoints: WeldJoint[];
  defaultDonorJointId: string;
  rbac: {
    canEditPrepAndWeldingFields: boolean;
  };
  filterLrvBySameDiameter: boolean;
  setFilterLrvBySameDiameter: (v: boolean) => void;
  allowCrossRdLrv: boolean;
  setAllowCrossRdLrv: (v: boolean) => void;
  availableLrvItems: LRVItem[];
  baseLrvOptionsForElem2: LRVItem[];
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
  elem1AutoSelectedCode: string | null;
  elem2TypeFilter: LrvElementCategory;
  setElem2TypeFilter: (v: LrvElementCategory) => void;
  elem2SizeFilter: string;
  setElem2SizeFilter: (v: string) => void;
  elem2AvailableSizes: LrvSizeOption[];
  elem2SearchQuery: string;
  setElem2SearchQuery: (v: string) => void;
  elem2AutoSelectedCode: string | null;
  filteredLrvOptionsElem1: LRVItem[];
  filteredLrvOptionsElem2: LRVItem[];
  selectedLrv1Item?: LRVItem;
  selectedLrv2Item?: LRVItem;
  handleSelectLrv1: (code: string) => void;
  handleSelectLrv2: (code: string) => void;
  handleClearElem1: () => void;
  handleClearElem2: () => void;
  handleCopyElementsFromJoint: (donorJointId: string) => WeldJoint | null;
  handleCopyElem1ToElem2: () => void;
  handleSwapElements: () => void;
  formatLrvOptionLabel: (item: LRVItem) => string;
  onOpenLrvImport?: () => void;
}

function filterTraceabilityOptions(
  suggestions: TraceabilitySuggestion[],
  query: string
): SmartAutocompleteOption<TraceabilitySuggestion>[] {
  const cleanQuery = (query || '').trim().toLowerCase();
  const isExact =
    cleanQuery.length > 0 &&
    suggestions.some((s) => s.value.toLowerCase() === cleanQuery);

  const visible =
    !cleanQuery || isExact
      ? suggestions
      : suggestions.filter(
          (s) =>
            s.value.toLowerCase().includes(cleanQuery) ||
            s.meta.toLowerCase().includes(cleanQuery)
        );

  return visible.slice(0, 20).map((s) => ({
    key: `${s.source}:${s.value}`,
    value: s.value,
    label: s.value,
    accentLabel:
      s.source === 'avk'
        ? 'АВК'
        : s.source === 'history_same_lrv'
        ? 'ЛРВ'
        : 'История',
    meta: s.meta,
    data: s,
  }));
}

interface ElementCardProps {
  slot: 1 | 2;
  form: WeldJoint;
  setForm: React.Dispatch<React.SetStateAction<WeldJoint>>;
  allJoints: WeldJoint[];
  disabled: boolean;
  diam: number;
  wall: number;
  diameterIsMatch: boolean;
  typeFilter: LrvElementCategory;
  setTypeFilter: (v: LrvElementCategory) => void;
  sizeFilter: string;
  setSizeFilter: (v: string) => void;
  availableSizes: LrvSizeOption[];
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  autoSelectedCode: string | null;
  lrvPoolForCodeSearch: LRVItem[];
  filteredLrvOptions: LRVItem[];
  selectedLrvItem?: LRVItem;
  onSelectLrv: (code: string) => void;
  onClearElement: () => void;
  formatLrvOptionLabel: (item: LRVItem) => string;
}

const ElementCard: React.FC<ElementCardProps> = ({
  slot,
  form,
  setForm,
  allJoints,
  disabled,
  diam,
  wall,
  diameterIsMatch,
  typeFilter,
  setTypeFilter,
  sizeFilter,
  setSizeFilter,
  availableSizes,
  searchQuery,
  setSearchQuery,
  autoSelectedCode,
  lrvPoolForCodeSearch,
  filteredLrvOptions,
  selectedLrvItem,
  onSelectLrv,
  onClearElement,
  formatLrvOptionLabel,
}) => {
  const isFirst = slot === 1;
  const lrvCode = isFirst ? form.lrv1Code : form.lrv2Code;
  const elemName = isFirst ? form.elem1Name : form.elem2Name;
  const elemMaterial = isFirst ? form.elem1Material : form.elem2Material;
  const elemNtd = isFirst ? form.elem1Ntd : form.elem2Ntd;
  const elemManufacturer = isFirst ? form.elem1Manufacturer : form.elem2Manufacturer;
  const factoryNumber = isFirst ? form.elem1FactoryNumber || '' : form.elem2FactoryNumber || '';
  const lengthVal = isFirst ? form.elem1Length || '' : form.elem2Length || '';
  const certNumber = isFirst ? form.elem1CertNumber || '' : form.elem2CertNumber || '';
  const heatNumber = isFirst ? form.elem1HeatNumber || '' : form.elem2HeatNumber || '';
  const batchNumber = isFirst ? form.elem1BatchNumber || '' : form.elem2BatchNumber || '';

  // Локальный текст живого поиска типоразмера
  const activeSizeLabel = useMemo(() => {
    if (!sizeFilter || sizeFilter === 'all') return '';
    return availableSizes.find((s) => s.key === sizeFilter)?.label || sizeFilter;
  }, [sizeFilter, availableSizes]);

  const [sizeInputText, setSizeInputText] = useState(activeSizeLabel);
  const [bundleFilledHint, setBundleFilledHint] = useState<string | null>(null);

  useEffect(() => {
    setSizeInputText(activeSizeLabel);
  }, [activeSizeLabel]);

  useEffect(() => {
    setBundleFilledHint(null);
  }, [form.id, lrvCode]);

  const sizeOptions = useMemo<SmartAutocompleteOption<LrvSizeOption | null>[]>(() => {
    const query =
      sizeInputText.trim() === activeSizeLabel.trim() ? '' : sizeInputText;
    const filtered = filterSizeOptionsLive(availableSizes, query);
    const items: SmartAutocompleteOption<LrvSizeOption | null>[] = [];
    if (!query.trim()) {
      items.push({
        key: 'all',
        value: 'all',
        label: 'Все размеры',
        accentLabel: String(availableSizes.length),
        data: null,
      });
    }
    for (const sz of filtered) {
      items.push({
        key: sz.key,
        value: sz.key,
        label: sz.label,
        data: sz,
      });
    }
    return items;
  }, [availableSizes, sizeInputText, activeSizeLabel]);

  const lrvCodeOptions = useMemo<SmartAutocompleteOption<LRVItem>[]>(() => {
    const matched = searchLrvCodeSuggestions(lrvPoolForCodeSearch, lrvCode || '', 25);
    return matched.map((item) => {
      const dims = item.diameterMm2
        ? `Ø${item.diameterMm}×${item.wallThickness} / Ø${item.diameterMm2}×${item.wallThickness2 ?? item.wallThickness}`
        : `Ø${item.diameterMm}×${item.wallThickness}`;
      const metaParts = [item.shortName];
      if (item.material) metaParts.push(`ст. ${item.material}`);
      if (item.manufacturer) metaParts.push(item.manufacturer);
      return {
        key: item.id,
        value: item.lrvCode,
        label: item.lrvCode,
        accentLabel: dims,
        meta: metaParts.join(' · '),
        data: item,
      };
    });
  }, [lrvPoolForCodeSearch, lrvCode]);

  const traceability = useMemo(
    () =>
      buildElementTraceabilitySuggestions({
        selectedLrvItem,
        allJoints,
        currentJointId: form.id,
        elemName,
        elemMaterial,
        elemDiameterMm: diam,
      }),
    [selectedLrvItem, allJoints, form.id, elemName, elemMaterial, diam]
  );

  const factoryOptions = useMemo(
    () => filterTraceabilityOptions(traceability.factoryNumber, factoryNumber),
    [traceability.factoryNumber, factoryNumber]
  );
  const certOptions = useMemo(
    () => filterTraceabilityOptions(traceability.certNumber, certNumber),
    [traceability.certNumber, certNumber]
  );
  const heatOptions = useMemo(
    () => filterTraceabilityOptions(traceability.heatNumber, heatNumber),
    [traceability.heatNumber, heatNumber]
  );
  const batchOptions = useMemo(
    () => filterTraceabilityOptions(traceability.batchNumber, batchNumber),
    [traceability.batchNumber, batchNumber]
  );

  const handleSelectTraceability = (
    field: TraceabilityField,
    opt: SmartAutocompleteOption<TraceabilitySuggestion>
  ) => {
    if (!opt.data) return;
    const suggestion = opt.data;
    setForm((prev) =>
      applyTraceabilitySuggestionToElement(prev, slot, field, suggestion)
    );
    const hasLinkedBundle = Boolean(
      suggestion.bundle &&
        [
          suggestion.bundle.certNumber,
          suggestion.bundle.heatNumber,
          suggestion.bundle.batchNumber,
        ].filter(Boolean).length >= 2
    );
    if (hasLinkedBundle) {
      setBundleFilledHint(
        suggestion.source === 'avk'
          ? 'Подтянута связка сертификат · плавка · партия из АВК'
          : 'Подтянута связка сертификат · плавка · партия из истории'
      );
    } else {
      setBundleFilledHint(null);
    }
  };

  const showAutoSelectedNotice = Boolean(
    autoSelectedCode && autoSelectedCode === lrvCode && selectedLrvItem
  );

  const hasAnyElementData = Boolean(
    lrvCode ||
      elemName ||
      elemMaterial ||
      elemNtd ||
      elemManufacturer ||
      diam > 0 ||
      wall > 0 ||
      factoryNumber ||
      lengthVal ||
      certNumber ||
      heatNumber ||
      batchNumber ||
      searchQuery ||
      typeFilter !== 'Все типы' ||
      sizeFilter !== 'all'
  );

  return (
    <div className="lg:col-span-5 p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 flex flex-col justify-between">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-[#1e3799]">
              Элемент {slot}
            </span>
            {!disabled && hasAnyElementData && (
              <button
                type="button"
                onClick={() => {
                  setSizeInputText('');
                  setBundleFilledHint(null);
                  onClearElement();
                }}
                aria-label={`Очистить все поля Элемента ${slot}`}
                title={`Очистить все поля Элемента ${slot}`}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-200 bg-white text-[10px] font-medium text-slate-500 hover:text-rose-700 hover:border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Очистить</span>
              </button>
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border font-mono tabular-nums text-[11px] font-bold shrink-0 ${
              isFirst || diameterIsMatch
                ? 'bg-white border-slate-200 text-[#1e3799]'
                : 'bg-red-100 border-red-300 text-red-800'
            }`}
          >
            <Lock className="w-3 h-3 text-slate-400" />
            <span>
              {diam > 0
                ? `Из базы ЛРВ · Ø${diam}×${wall} мм`
                : 'Не выбран'}
            </span>
          </span>
        </div>

        {/* Каскадный подбор: 1. Тип -> 2. Типоразмер -> 3. Материал ЛРВ */}
        <div className="p-2.5 rounded-lg bg-white border border-slate-200/90 space-y-2">
          <div className="grid grid-cols-12 gap-1.5">
            <div className="col-span-6">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <label className="block text-[10px] font-bold text-slate-600">
                  1. Тип элемента
                </label>
                {!disabled && typeFilter !== 'Все типы' && (
                  <button
                    type="button"
                    onClick={() => setTypeFilter('Все типы')}
                    aria-label={`Сбросить тип элемента ${slot}`}
                    title="Сбросить фильтр типа"
                    className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as LrvElementCategory);
                }}
                aria-label={`Тип элемента ${slot}`}
                className="w-full px-2 py-1 bg-slate-50 border border-slate-300 rounded text-[11px] font-semibold text-[#1e3799] focus:outline-none focus:ring-1 focus:ring-[#1e3799]"
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
                2. Типоразмер
              </label>
              <SmartAutocompleteInput<LrvSizeOption | null>
                value={sizeInputText}
                onChangeText={(nextText) => {
                  setSizeInputText(nextText);
                  if (!nextText.trim() && sizeFilter !== 'all') {
                    setSizeFilter('all');
                  }
                }}
                onSelectOption={(opt) => {
                  if (!opt.data || opt.value === 'all') {
                    setSizeFilter('all');
                    setSizeInputText('');
                  } else {
                    setSizeFilter(opt.data.key);
                    setSizeInputText(opt.data.label);
                  }
                }}
                onClear={() => {
                  setSizeFilter('all');
                  setSizeInputText('');
                }}
                onBlurWithoutSelect={() => {
                  setSizeInputText(activeSizeLabel);
                }}
                options={sizeOptions}
                selectedKey={sizeFilter}
                placeholder={`Все размеры · ${availableSizes.length}`}
                ariaLabel={`Типоразмер Элемента ${slot}`}
                emptyText="Типоразмер не найден"
                showChevron
                clearable
                disabled={disabled}
                inputClassName="px-2 py-1 bg-slate-50 border border-slate-300 rounded text-[11px] font-mono tabular-nums font-semibold text-slate-800"
              />
            </div>
          </div>

          <div className="relative">
            <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Уточнить поиск: марка стали, завод, ГОСТ..."
              aria-label={`Поиск Элемента ${slot} по базе ЛРВ`}
              className="w-full pl-6 pr-6 py-1 bg-white border border-slate-300 rounded text-[11px] focus:outline-none focus:ring-1 focus:ring-[#1e3799] focus:border-[#1e3799]"
            />
            {!disabled && searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={`Очистить поиск Элемента ${slot}`}
                title="Очистить поиск"
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <label className="text-[10px] font-bold text-slate-600">
                3. Изделие из базы ЛРВ
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono tabular-nums text-slate-500">
                  найдено: {filteredLrvOptions.length}
                </span>
                {!disabled && (lrvCode || elemName) && (
                  <button
                    type="button"
                    onClick={() => onSelectLrv('')}
                    aria-label={`Очистить выбранное изделие Элемента ${slot}`}
                    title="Сбросить выбранный материал"
                    className="p-0.5 rounded text-slate-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
            <select
              value={lrvCode}
              onChange={(e) => onSelectLrv(e.target.value)}
              aria-label={`Изделие Элемент ${slot} из базы ЛРВ`}
              className="w-full px-2 py-1.5 bg-white border border-[#1e3799] rounded text-xs font-semibold text-[#1e3799] focus:outline-none focus:ring-1 focus:ring-[#1e3799]"
            >
              <option value="">— Выберите материал из базы ЛРВ —</option>
              {filteredLrvOptions.map((item) => (
                <option key={item.id} value={item.lrvCode}>
                  {formatLrvOptionLabel(item)}
                </option>
              ))}
            </select>
            {showAutoSelectedNotice && (
              <div className="mt-1 flex items-center gap-1 text-[10px] text-[#1e3799] font-medium">
                <CheckCircle2 className="w-3 h-3 shrink-0" />
                <span>
                  Автоподстановка: единственный подходящий вариант · {autoSelectedCode}
                </span>
              </div>
            )}
          </div>

          {/* Прямой ввод кода ЛРВ с автодополнением ближайших совпадений */}
          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-[10px] text-slate-500 shrink-0">
              Код ЛРВ:
            </span>
            <div className="w-40">
              <SmartAutocompleteInput<LRVItem>
                value={lrvCode || ''}
                onChangeText={(nextText) => onSelectLrv(nextText.trim())}
                onSelectOption={(opt) => {
                  if (opt.data) {
                    onSelectLrv(opt.data.lrvCode);
                  } else {
                    onSelectLrv(opt.value);
                  }
                }}
                onClear={() => onSelectLrv('')}
                options={lrvCodeOptions}
                selectedKey={selectedLrvItem?.id}
                placeholder="Введите код ЛРВ..."
                ariaLabel={`Прямой ввод кода ЛРВ Элемент ${slot}`}
                emptyText="Код ЛРВ не найден в каталоге"
                dropdownAlign="right"
                dropdownClassName="w-72"
                clearable
                disabled={disabled}
                inputClassName="px-2 py-0.5 bg-slate-50 border border-slate-300 rounded text-[11px] font-mono tabular-nums font-bold text-[#1e3799]"
              />
            </div>
          </div>
        </div>

        {selectedLrvItem?.diameterMm2 && (
          <div className="flex items-center justify-between gap-1 px-2 py-1 rounded bg-[#e8f1fc] border border-sky-200 text-[11px]">
            <span className="text-[#1e3799] font-medium">Торец детали:</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() =>
                  setForm((prev) =>
                    isFirst
                      ? {
                          ...prev,
                          elem1DiameterMm: selectedLrvItem.diameterMm,
                          elem1WallThickness: selectedLrvItem.wallThickness,
                          diameterMm: selectedLrvItem.diameterMm,
                          diameterInch: mmToInchDiameter(selectedLrvItem.diameterMm),
                          wallThickness: selectedLrvItem.wallThickness,
                        }
                      : {
                          ...prev,
                          elem2DiameterMm: selectedLrvItem.diameterMm,
                          elem2WallThickness: selectedLrvItem.wallThickness,
                        }
                  )
                }
                className={`px-2 py-0.5 rounded font-mono tabular-nums border cursor-pointer ${
                  diam === selectedLrvItem.diameterMm
                    ? 'bg-[#1e3799] text-white border-[#1e3799]'
                    : 'bg-white text-[#1e3799] border-sky-300'
                }`}
              >
                Ø1: {selectedLrvItem.diameterMm}×{selectedLrvItem.wallThickness}
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm((prev) =>
                    isFirst
                      ? {
                          ...prev,
                          elem1DiameterMm: selectedLrvItem.diameterMm2!,
                          elem1WallThickness:
                            selectedLrvItem.wallThickness2 ??
                            selectedLrvItem.wallThickness,
                          diameterMm: selectedLrvItem.diameterMm2!,
                          diameterInch: mmToInchDiameter(selectedLrvItem.diameterMm2!),
                          wallThickness:
                            selectedLrvItem.wallThickness2 ??
                            selectedLrvItem.wallThickness,
                        }
                      : {
                          ...prev,
                          elem2DiameterMm: selectedLrvItem.diameterMm2!,
                          elem2WallThickness:
                            selectedLrvItem.wallThickness2 ??
                            selectedLrvItem.wallThickness,
                        }
                  )
                }
                className={`px-2 py-0.5 rounded font-mono tabular-nums border cursor-pointer ${
                  diam === selectedLrvItem.diameterMm2
                    ? 'bg-[#1e3799] text-white border-[#1e3799]'
                    : 'bg-white text-[#1e3799] border-sky-300'
                }`}
              >
                Ø2: {selectedLrvItem.diameterMm2}×
                {selectedLrvItem.wallThickness2 ?? selectedLrvItem.wallThickness}
              </button>
            </div>
          </div>
        )}

        {/* Справочные характеристики элемента из базы ЛРВ */}
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <div className="flex items-center justify-between text-[11px] text-slate-500 mb-0.5">
              <span>Краткое наименование</span>
              <span className="font-mono text-[10px] text-[#1e3799] font-semibold">
                {selectedLrvItem
                  ? `${resolveLrvItemCategory(selectedLrvItem)}${
                      resolveLrvItemCategory(selectedLrvItem) === 'ЗРА'
                        ? ` · ${resolveLrvConnectionType(selectedLrvItem)}`
                        : ''
                    }`
                  : elemName
                  ? detectLrvElementType(elemName)
                  : '—'}
              </span>
            </div>
            <div
              aria-label={`Наименование Элемента ${slot} из базы ЛРВ`}
              className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-semibold text-slate-800 select-all"
            >
              {elemName || '—'}
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">
              Диаметр Ø, мм
            </label>
            <div
              aria-label={`Диаметр Элемента ${slot}`}
              className={`w-full px-2.5 py-1.5 border rounded text-xs font-mono tabular-nums font-bold ${
                isFirst || diameterIsMatch
                  ? 'bg-slate-100/90 border-slate-200 text-[#1e3799]'
                  : 'bg-red-50 border-red-400 text-red-700'
              }`}
            >
              {diam > 0 ? diam : '—'}
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">
              Толщина S, мм
            </label>
            <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono tabular-nums text-slate-800">
              {wall > 0 ? wall : '—'}
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">
              Материал
            </label>
            <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs font-mono text-slate-800">
              {elemMaterial || '—'}
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-slate-500 mb-0.5">
              НТД
            </label>
            <div className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs text-slate-800 truncate">
              {elemNtd || '—'}
            </div>
          </div>
          <div className="col-span-2">
            <label className="block text-[11px] text-slate-500 mb-0.5">
              Завод-поставщик
            </label>
            <div
              aria-label={`Завод-поставщик Элемента ${slot}`}
              className="w-full px-2.5 py-1.5 bg-slate-100/90 border border-slate-200 rounded text-xs text-slate-800 truncate"
              title={elemManufacturer || selectedLrvItem?.manufacturer || ''}
            >
              {elemManufacturer || selectedLrvItem?.manufacturer || '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Индивидуальные реквизиты и прослеживаемость с автодополнением из АВК и истории */}
      <div className="pt-2 border-t border-slate-200 space-y-2">
        <div className="grid grid-cols-12 gap-2">
          <div className="col-span-7">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Заводской номер
            </label>
            <SmartAutocompleteInput<TraceabilitySuggestion>
              value={factoryNumber}
              onChangeText={(nextText) =>
                setForm((prev) =>
                  isFirst
                    ? { ...prev, elem1FactoryNumber: nextText }
                    : { ...prev, elem2FactoryNumber: nextText }
                )
              }
              onSelectOption={(opt) =>
                handleSelectTraceability('factoryNumber', opt)
              }
              options={factoryOptions}
              placeholder={`Зав. № детали ${slot}`}
              ariaLabel={`Заводской номер Элемента ${slot}`}
              emptyText="Нет сохранённых заводских номеров"
              dropdownClassName="w-72"
              clearable
              disabled={disabled}
              inputClassName="px-2.5 py-1.5 bg-white border border-[#1e3799]/50 rounded text-xs font-mono tabular-nums font-semibold text-slate-900"
            />
          </div>
          <div className="col-span-5">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Длина, м
            </label>
            <div className="relative flex items-center">
              <input
                type="text"
                inputMode="decimal"
                value={lengthVal}
                onChange={(e) =>
                  setForm((prev) =>
                    isFirst
                      ? { ...prev, elem1Length: normalizeDecimalInput(e.target.value) }
                      : { ...prev, elem2Length: normalizeDecimalInput(e.target.value) }
                  )
                }
                placeholder={isFirst ? 'Напр.: 11.8' : 'Напр.: 0.35'}
                aria-label={`Длина Элемента ${slot}`}
                className="w-full pl-2.5 pr-6 py-1.5 bg-white border border-[#1e3799]/50 rounded text-xs font-mono tabular-nums font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#1e3799]"
              />
              {!disabled && lengthVal && (
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) =>
                      isFirst
                        ? { ...prev, elem1Length: '' }
                        : { ...prev, elem2Length: '' }
                    )
                  }
                  aria-label={`Очистить длину Элемента ${slot}`}
                  title="Очистить"
                  className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 absolute right-1 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Прослеживаемость материалов: Сертификат, плавка, партия */}
        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-dashed border-slate-200">
          <div>
            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
              № сертификата
            </label>
            <SmartAutocompleteInput<TraceabilitySuggestion>
              value={certNumber}
              onChangeText={(nextText) =>
                setForm((prev) =>
                  isFirst
                    ? { ...prev, elem1CertNumber: nextText }
                    : { ...prev, elem2CertNumber: nextText }
                )
              }
              onSelectOption={(opt) =>
                handleSelectTraceability('certNumber', opt)
              }
              options={certOptions}
              placeholder="№ серт."
              ariaLabel={`Номер сертификата качества Элемента ${slot}`}
              emptyText="Нет сертификатов в АВК и истории"
              dropdownAlign="left"
              dropdownClassName="w-64 sm:w-72"
              clearable
              disabled={disabled}
              inputClassName="px-2 py-1 bg-white border border-slate-300 rounded text-[11px] font-mono tabular-nums text-slate-900"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
              № плавки
            </label>
            <SmartAutocompleteInput<TraceabilitySuggestion>
              value={heatNumber}
              onChangeText={(nextText) =>
                setForm((prev) =>
                  isFirst
                    ? { ...prev, elem1HeatNumber: nextText }
                    : { ...prev, elem2HeatNumber: nextText }
                )
              }
              onSelectOption={(opt) =>
                handleSelectTraceability('heatNumber', opt)
              }
              options={heatOptions}
              placeholder="№ плавки"
              ariaLabel={`Номер плавки Элемента ${slot}`}
              emptyText="Нет плавок в АВК и истории"
              dropdownAlign="left"
              dropdownClassName="w-64 sm:w-72"
              clearable
              disabled={disabled}
              inputClassName="px-2 py-1 bg-white border border-slate-300 rounded text-[11px] font-mono tabular-nums text-slate-900"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
              № партии
            </label>
            <SmartAutocompleteInput<TraceabilitySuggestion>
              value={batchNumber}
              onChangeText={(nextText) =>
                setForm((prev) =>
                  isFirst
                    ? { ...prev, elem1BatchNumber: nextText }
                    : { ...prev, elem2BatchNumber: nextText }
                )
              }
              onSelectOption={(opt) =>
                handleSelectTraceability('batchNumber', opt)
              }
              options={batchOptions}
              placeholder="№ партии"
              ariaLabel={`Номер партии Элемента ${slot}`}
              emptyText="Нет партий в АВК и истории"
              dropdownAlign="right"
              dropdownClassName="w-64 sm:w-72"
              clearable
              disabled={disabled}
              inputClassName="px-2 py-1 bg-white border border-slate-300 rounded text-[11px] font-mono tabular-nums text-slate-900"
            />
          </div>
        </div>

        {bundleFilledHint && (
          <div className="flex items-center gap-1 text-[10px] text-emerald-700 font-medium">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            <span>{bundleFilledHint}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export const PassportElementsTab: React.FC<PassportElementsTabProps> = ({
  form,
  setForm,
  allJoints,
  copyableLineJoints,
  defaultDonorJointId,
  rbac,
  filterLrvBySameDiameter,
  setFilterLrvBySameDiameter,
  allowCrossRdLrv,
  setAllowCrossRdLrv,
  availableLrvItems,
  baseLrvOptionsForElem2,
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
  elem1AutoSelectedCode,
  elem2TypeFilter,
  setElem2TypeFilter,
  elem2SizeFilter,
  setElem2SizeFilter,
  elem2AvailableSizes,
  elem2SearchQuery,
  setElem2SearchQuery,
  elem2AutoSelectedCode,
  filteredLrvOptionsElem1,
  filteredLrvOptionsElem2,
  selectedLrv1Item,
  selectedLrv2Item,
  handleSelectLrv1,
  handleSelectLrv2,
  handleClearElem1,
  handleClearElem2,
  handleCopyElementsFromJoint,
  handleCopyElem1ToElem2,
  handleSwapElements,
  formatLrvOptionLabel,
}) => {
  const [selectedDonorId, setSelectedDonorId] = useState<string>(defaultDonorJointId);
  const [copiedDonorNotice, setCopiedDonorNotice] = useState<string | null>(null);

  useEffect(() => {
    if (
      !selectedDonorId ||
      !copyableLineJoints.some((j) => j.id === selectedDonorId)
    ) {
      setSelectedDonorId(defaultDonorJointId);
    }
  }, [copyableLineJoints, defaultDonorJointId, selectedDonorId]);

  useEffect(() => {
    setCopiedDonorNotice(null);
  }, [form.id, form.uniqueLineId]);

  const elem1Wall = form.elem1WallThickness ?? form.wallThickness ?? 0;
  const elem2Wall = form.elem2WallThickness ?? form.wallThickness ?? 0;

  const formatDonorOption = (j: WeldJoint) => {
    const e1 = j.elem1Name || j.lrv1Code || '—';
    const e2 = j.elem2Name || j.lrv2Code || '—';
    const dims = j.diameterMm > 0 ? ` · Ø${j.diameterMm}×${j.wallThickness} мм` : '';
    return `Стык № ${j.jointNumber} · ${e1} + ${e2}${dims}`;
  };

  const handleApplyDonorCopy = () => {
    if (!selectedDonorId) return;
    const copied = handleCopyElementsFromJoint(selectedDonorId);
    if (copied) {
      setCopiedDonorNotice(`Скопированы оба элемента из стыка № ${copied.jointNumber}`);
    }
  };

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
              Свариваемые элементы
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
              <span>
                Подбирать Элемент 2 по диаметру Элемента 1
                {elem1Diam > 0 ? ` · Ø${elem1Diam} мм` : ''}
              </span>
            </label>

            {!allowCrossRdLrv ? (
              <button
                type="button"
                onClick={() => setAllowCrossRdLrv(true)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#e8f1fc] text-[#1e3799] text-[11px] font-medium border border-sky-200 cursor-pointer hover:bg-sky-100 transition-colors"
              >
                <Lock className="w-3 h-3" />
                <span>ЛРВ по РД · {availableLrvItems.length} · Снять ограничение</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setAllowCrossRdLrv(false)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded bg-amber-50 text-amber-800 text-[11px] font-semibold border border-amber-300 cursor-pointer hover:bg-amber-100 transition-colors"
              >
                <Unlock className="w-3 h-3" />
                <span>ЛРВ из всех РД · Вернуть ограничение</span>
              </button>
            )}
          </div>
        </div>

        {/* Панель копирования элементов из выбранного стыка текущей линии */}
        {copyableLineJoints.length > 0 && rbac.canEditPrepAndWeldingFields && (
          <div className="px-3 py-2 rounded-lg bg-[#f4f8fe] border border-sky-200/90 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <History className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
              <span className="text-[11px] font-semibold text-slate-700 shrink-0">
                Источник на линии:
              </span>
              <select
                value={selectedDonorId}
                onChange={(e) => {
                  setSelectedDonorId(e.target.value);
                  setCopiedDonorNotice(null);
                }}
                aria-label="Выбор стыка-источника для копирования элементов"
                className="min-w-0 flex-1 max-w-md px-2 py-1 bg-white border border-slate-300 rounded text-[11px] font-mono tabular-nums font-medium text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1e3799]"
              >
                {copyableLineJoints.map((j) => (
                  <option key={j.id} value={j.id}>
                    {formatDonorOption(j)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {copiedDonorNotice && (
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{copiedDonorNotice}</span>
                </span>
              )}
              <button
                type="button"
                onClick={handleApplyDonorCopy}
                disabled={!selectedDonorId}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1e3799] text-white text-[11px] font-semibold hover:bg-[#15276e] disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>Заполнить из стыка</span>
              </button>
            </div>
          </div>
        )}

        {/* Индикатор проверки совпадения диаметров обоих элементов */}
        <div
          className={`px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 ${
            elem1Diam === 0 && elem2Diam === 0
              ? 'bg-slate-50 border border-slate-200 text-slate-600'
              : diameterValidation.isMatch
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-900'
              : 'bg-red-50 border border-red-300 text-red-900 font-bold'
          }`}
        >
          <div className="flex items-center gap-2">
            {elem1Diam === 0 && elem2Diam === 0 ? (
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
            ) : diameterValidation.isMatch ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>
              {elem1Diam === 0 && elem2Diam === 0
                ? 'Выберите свариваемые элементы из базы ЛРВ или скопируйте их из другого стыка линии'
                : diameterValidation.message}
            </span>
          </div>
          <span className="font-mono tabular-nums text-xs font-bold shrink-0">
            Эл.1: {elem1Diam > 0 ? `Ø${elem1Diam}×${elem1Wall} мм` : '—'} · Эл.2:{' '}
            {elem2Diam > 0 ? `Ø${elem2Diam}×${elem2Wall} мм` : '—'}
            {elem1Diam > 0
              ? ` · Экв. ${calculateEquivalentDiaInch(elem1Diam, elem1Wall)}"`
              : ''}
          </span>
        </div>

        {/* Проверка разнотолщинности по п. 14.3 СТО Газпром 15-1.1-002-2023 */}
        {(() => {
          if (elem1Wall <= 0 || elem2Wall <= 0) return null;
          const thicknessCheck = checkWallThicknessTransition(elem1Wall, elem2Wall);
          if (!thicknessCheck.isDifferentThickness) return null;

          if (thicknessCheck.isDirectWeldingForbidden) {
            return (
              <div className="px-3 py-2.5 rounded-lg text-xs bg-red-100 border-2 border-red-400 text-red-950 flex items-start gap-2.5 shadow-xs">
                <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold text-red-900">
                    Прямая сварка разнотолщинных элементов запрещена · СТО Газпром 15-1.1-002-2023 п. 14.3
                  </div>
                  <div className="text-[11px] text-red-800 leading-relaxed">
                    {thicknessCheck.error}
                  </div>
                </div>
              </div>
            );
          }

          if (thicknessCheck.requiresBevel) {
            return (
              <div className="px-3 py-2 rounded-lg text-xs bg-amber-50 border border-amber-300 text-amber-950 flex items-start gap-2.5 shadow-2xs">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <div className="font-bold text-amber-900">
                    Разнотолщинное соединение: требуется разделка кромок · п. 14.3 СТО 15-1.1-002-2023
                  </div>
                  <div className="text-[11px] text-amber-800 leading-relaxed">
                    {thicknessCheck.warning}
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })()}

        {/* Карточки «Элемент 1» — [Иконки Копировать и Поменять местами] — «Элемент 2» */}
        <div className="grid grid-cols-1 lg:grid-cols-11 gap-3 items-stretch">
          <ElementCard
            slot={1}
            form={form}
            setForm={setForm}
            allJoints={allJoints}
            disabled={!rbac.canEditPrepAndWeldingFields}
            diam={elem1Diam}
            wall={elem1Wall}
            diameterIsMatch={true}
            typeFilter={elem1TypeFilter}
            setTypeFilter={setElem1TypeFilter}
            sizeFilter={elem1SizeFilter}
            setSizeFilter={setElem1SizeFilter}
            availableSizes={elem1AvailableSizes}
            searchQuery={elem1SearchQuery}
            setSearchQuery={setElem1SearchQuery}
            autoSelectedCode={elem1AutoSelectedCode}
            lrvPoolForCodeSearch={availableLrvItems}
            filteredLrvOptions={filteredLrvOptionsElem1}
            selectedLrvItem={selectedLrv1Item}
            onSelectLrv={handleSelectLrv1}
            onClearElement={handleClearElem1}
            formatLrvOptionLabel={formatLrvOptionLabel}
          />

          {/* ЦЕНТРАЛЬНАЯ КОЛОНКА: Копировать 1->2 и Поменять местами 1<->2 */}
          <div className="lg:col-span-1 flex lg:flex-col items-center justify-center gap-2 py-1">
            <button
              type="button"
              onClick={handleCopyElem1ToElem2}
              aria-label="Скопировать данные из Элемента 1 в Элемент 2"
              title="Скопировать данные из Элемента 1 в Элемент 2"
              className="p-2.5 rounded-xl bg-[#e8f1fc] border border-[#1e3799]/30 text-[#1e3799] hover:bg-[#1e3799] hover:text-white transition-colors shadow-2xs cursor-pointer"
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleSwapElements}
              aria-label="Поменять местами Элемент 1 и Элемент 2"
              title="Поменять местами Элемент 1 и Элемент 2"
              className="p-2.5 rounded-xl bg-[#e8f1fc] border border-[#1e3799]/30 text-[#1e3799] hover:bg-[#1e3799] hover:text-white transition-colors shadow-2xs cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
            </button>
          </div>

          <ElementCard
            slot={2}
            form={form}
            setForm={setForm}
            allJoints={allJoints}
            disabled={!rbac.canEditPrepAndWeldingFields}
            diam={elem2Diam}
            wall={elem2Wall}
            diameterIsMatch={elem2Diam === 0 || diameterValidation.isMatch}
            typeFilter={elem2TypeFilter}
            setTypeFilter={setElem2TypeFilter}
            sizeFilter={elem2SizeFilter}
            setSizeFilter={setElem2SizeFilter}
            availableSizes={elem2AvailableSizes}
            searchQuery={elem2SearchQuery}
            setSearchQuery={setElem2SearchQuery}
            autoSelectedCode={elem2AutoSelectedCode}
            lrvPoolForCodeSearch={baseLrvOptionsForElem2}
            filteredLrvOptions={filteredLrvOptionsElem2}
            selectedLrvItem={selectedLrv2Item}
            onSelectLrv={handleSelectLrv2}
            onClearElement={handleClearElem2}
            formatLrvOptionLabel={formatLrvOptionLabel}
          />
        </div>
      </div>
    </fieldset>
  );
};
