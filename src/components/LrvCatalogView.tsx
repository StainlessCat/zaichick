import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Database,
  Download,
  Edit3,
  FileSpreadsheet,
  Filter,
  Lock,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react';
import { FacilityObject, LRVItem } from '../types/welding';
import {
  exportLrvCatalogToExcel,
  readLrvCatalogFromExcelFile,
} from '../utils/excelUtils';
import {
  getLrvItemDn1,
  getLrvItemDn2,
  mmToNominalBoreDn,
} from '../utils/weldingLogic';
import {
  applyTableColumnFiltersAndSort,
  TableColumnFilterHeader,
} from './TableColumnFilterPopover';
import {
  useResizableColumns,
  ColumnResizeHandle,
} from '../utils/useResizableColumns';

interface LrvCatalogViewProps {
  catalog: LRVItem[];
  facilities: FacilityObject[];
  selectedRdCode: string;
  onAddLrvItems: (items: LRVItem[]) => void;
  onUpdateLrvItem?: (item: LRVItem) => void;
  onDeleteLrvItems?: (ids: string[]) => void;
  canEdit?: boolean;
  currentUserRoleLabel?: string;
}

export const LrvCatalogView: React.FC<LrvCatalogViewProps> = ({
  catalog,
  facilities,
  selectedRdCode,
  onAddLrvItems,
  onUpdateLrvItem,
  onDeleteLrvItems,
  canEdit = true,
  currentUserRoleLabel = 'Инженер ПТО',
}) => {
  const allRds = useMemo(
    () =>
      facilities.flatMap((f) =>
        f.rdCodes.map((r) => ({
          objectName: f.name,
          code: r.code,
          title: r.title,
        }))
      ),
    [facilities]
  );

  const [rdFilter, setRdFilter] = useState<string>(selectedRdCode);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingLrvId, setEditingLrvId] = useState<string | null>(null);
  const [selectedLrvIds, setSelectedLrvIds] = useState<string[]>([]);
  const [confirmDeleteLrvId, setConfirmDeleteLrvId] = useState<string | null>(
    null
  );
  const [confirmBulkDeleteLrv, setConfirmBulkDeleteLrv] = useState(false);
  const [excelUploadMessage, setExcelUploadMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Excel-фильтры по каждому столбцу таблицы ЛРВ и сортировка
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  // Настраиваемая курсором ширина столбцов справочника ЛРВ с сохранением в localStorage
  const {
    columnWidths,
    getColumnWidth,
    handleResizeStart,
    handleAutoFit,
    handleResetWidths,
    hasCustomWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_lrv',
    defaultWidths: {
      lrvCode: 140,
      rdCode: 180,
      shortName: 220,
      material: 130,
      ntd: 140,
      manufacturer: 160,
      dn1: 95,
      diameterMm: 110,
      wallThickness: 110,
      dn2: 95,
      diameterMm2: 110,
      wallThickness2: 110,
      specQty: 110,
      action: 95,
    },
  });

  // Форма новой или редактируемой позиции ЛРВ (с поддержкой DN1/DN2, двух диаметров Ø1/Ø2 и двух толщин S1/S2)
  const [newRd, setNewRd] = useState(allRds[0]?.code || '');
  const [newLrvCode, setNewLrvCode] = useState('ЛРВ-001ТХ3-0501');
  const [newShortName, setNewShortName] = useState('Переход К 219х10-159х8');
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

  useEffect(() => {
    if (!editingLrvId && !newRd && allRds.length > 0) {
      setNewRd(allRds[0].code);
    }
  }, [allRds, editingLrvId, newRd]);

  const handleStartEditLrv = (item: LRVItem) => {
    setFormError('');
    setEditingLrvId(item.id);
    setNewRd(item.rdCode);
    setNewLrvCode(item.lrvCode);
    setNewShortName(item.shortName);
    setNewMaterial(item.material);
    setNewNtd(item.ntd);
    setNewManufacturer(item.manufacturer || '');
    setNewDn1(getLrvItemDn1(item) || 150);
    setNewDiameter1(item.diameterMm);
    setNewThickness1(item.wallThickness);
    const has2 = Boolean(item.diameterMm2 || item.wallThickness2);
    setHasSecondDimension(has2);
    setNewDn2(getLrvItemDn2(item) || 100);
    setNewDiameter2(item.diameterMm2 || 108);
    setNewThickness2(item.wallThickness2 || 6);
    setNewQty(item.specQty);
    setNewUnit(item.unit);
    setShowAddForm(true);
  };

  // Базовая выборка по шифру РД
  const rdScopedCatalog = useMemo(() => {
    return catalog.filter((item) => {
      if (rdFilter !== 'ALL' && item.rdCode !== rdFilter) return false;
      return true;
    });
  }, [catalog, rdFilter]);

  const lrvColumnGetters = useMemo<Record<string, (item: LRVItem) => string>>(
    () => ({
      lrvCode: (item) => item.lrvCode,
      rdCode: (item) => item.rdCode,
      shortName: (item) => item.shortName,
      material: (item) => item.material,
      ntd: (item) => item.ntd,
      manufacturer: (item) => item.manufacturer || '',
      dn1: (item) => {
        const val = getLrvItemDn1(item);
        return val !== undefined ? String(val) : '';
      },
      diameterMm: (item) => String(item.diameterMm),
      wallThickness: (item) => item.wallThickness.toFixed(1),
      // Для элементов с одним диаметром вторые поля строго пустые ("")
      dn2: (item) => {
        const val = getLrvItemDn2(item);
        return val !== undefined ? String(val) : '';
      },
      diameterMm2: (item) =>
        item.diameterMm2 !== undefined ? String(item.diameterMm2) : '',
      wallThickness2: (item) =>
        item.wallThickness2 !== undefined ? item.wallThickness2.toFixed(1) : '',
      specQty: (item) => `${item.specQty} ${item.unit}`,
    }),
    []
  );

  const lrvColumnLabels: Record<string, string> = {
    lrvCode: 'Код ЛРВ',
    rdCode: 'Шифр РД',
    shortName: 'Краткое наименование',
    material: 'Материал (Сталь)',
    ntd: 'НТД',
    manufacturer: 'Завод-изготовитель',
    dn1: 'DN 1',
    diameterMm: 'Диаметр Ø1, мм',
    wallThickness: 'Толщина стенки S1, мм',
    dn2: 'DN 2',
    diameterMm2: 'Диаметр Ø2, мм',
    wallThickness2: 'Толщина стенки S2, мм',
    specQty: 'Кол-во по спец.',
  };

  const filteredCatalog = useMemo(
    () =>
      applyTableColumnFiltersAndSort(
        rdScopedCatalog,
        columnFilters,
        lrvColumnGetters,
        sortConfig
      ),
    [rdScopedCatalog, columnFilters, lrvColumnGetters, sortConfig]
  );

  const handleApplyColumnFilter = (
    colKey: string,
    vals: string[] | undefined
  ) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (vals === undefined) {
        delete next[colKey];
      } else {
        next[colKey] = vals;
      }
      return next;
    });
  };

  const handleSortColumn = (colKey: string, direction: 'asc' | 'desc') => {
    setSortConfig({ key: colKey, direction });
  };

  const [formError, setFormError] = useState('');

  const handleAddSingleItem = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanCode = newLrvCode.trim();
    if (!cleanCode) {
      setFormError('Укажите код ЛРВ.');
      return;
    }

    if (
      catalog.some(
        (existing) =>
          existing.id !== editingLrvId &&
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
      id: editingLrvId || `lrv-${Date.now()}`,
      lrvCode: cleanCode,
      rdCode: rdEntry?.code || newRd.trim() || 'НОВЫЙ-ШИФР-РД',
      objectName: rdEntry?.objectName || 'Новый объект',
      shortName: newShortName.trim(),
      material: newMaterial.trim(),
      ntd: newNtd.trim(),
      manufacturer: newManufacturer.trim() || undefined,
      dn1: computedDn1,
      diameterMm: d1,
      wallThickness: s1,
      dn2: computedDn2,
      diameterMm2: d2,
      wallThickness2: s2,
      specQty: Math.max(0.01, Number(String(newQty).replace(',', '.')) || 1),
      unit: newUnit,
    };

    if (editingLrvId && onUpdateLrvItem) {
      onUpdateLrvItem(item);
    } else {
      onAddLrvItems([item]);
    }
    setEditingLrvId(null);
    setShowAddForm(false);
  };

  const handleExcelFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelUploadMessage(null);

    const activeRdCode =
      rdFilter !== 'ALL'
        ? rdFilter
        : newRd || allRds[0]?.code || 'НОВЫЙ-ШИФР-РД';
    const rdEntry =
      allRds.find((r) => r.code === activeRdCode) || allRds[0];
    const defaultObjName = rdEntry?.objectName || facilities[0]?.name || 'Новый объект';
    const existingCodes = new Set(
      catalog.map((c) => c.lrvCode.trim().toLowerCase())
    );

    try {
      const parsedItems = await readLrvCatalogFromExcelFile(
        file,
        defaultObjName,
        activeRdCode,
        existingCodes
      );
      if (parsedItems.length === 0) {
        setExcelUploadMessage({
          type: 'error',
          text: `В файле «${file.name}» не найдено новых позиций ЛРВ (или все коды уже есть в каталоге).`,
        });
      } else {
        onAddLrvItems(parsedItems);
        setExcelUploadMessage({
          type: 'success',
          text: `Из файла «${file.name}» успешно загружено ${parsedItems.length} поз. ЛРВ.`,
        });
      }
    } catch {
      setExcelUploadMessage({
        type: 'error',
        text: `Ошибка чтения файла «${file.name}». Проверьте формат (.xlsx, .xls, .csv).`,
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const activeFilterKeys = Object.keys(columnFilters);

  return (
    <div className="space-y-4">
      {!canEdit && (
        <div className="px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <Lock className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Ролевое ограничение (RBAC): Текущая роль — «{currentUserRoleLabel}». Редактирование раздела «Каталог ЛРВ и спецификации» доступно только ролям «Инженер ПТО» и «Администратор». Включён режим чтения.
            </span>
          </div>
          <span className="px-2 py-0.5 rounded bg-amber-200/70 text-amber-900 font-mono text-[11px] shrink-0">
            Только чтение
          </span>
        </div>
      )}

      {/* Верхняя панель каталога ЛРВ */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 shadow-2xs flex flex-wrap items-center justify-end gap-2">
        <div className="flex flex-wrap items-center gap-2 w-full justify-end">
          <button
            type="button"
            onClick={() => exportLrvCatalogToExcel(filteredCatalog, false)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[#1e3799]" />
            <span>Выгрузить каталог (.xlsx)</span>
          </button>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => exportLrvCatalogToExcel([], true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Шаблон Excel</span>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#1e3799]/30 bg-[#e8f1fc] text-[#1e3799] text-xs font-semibold hover:bg-sky-100 transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span>Загрузить из Excel (.xlsx / .csv)</span>
              </button>

              {onDeleteLrvItems &&
                selectedLrvIds.length > 0 &&
                (confirmBulkDeleteLrv ? (
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-300 bg-red-50 text-xs">
                    <span className="font-bold text-red-800">
                      Удалить {selectedLrvIds.length} поз. ЛРВ?
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onDeleteLrvItems(selectedLrvIds);
                        setSelectedLrvIds([]);
                        setConfirmBulkDeleteLrv(false);
                      }}
                      className="px-2 py-0.5 rounded bg-red-600 text-white font-bold hover:bg-red-700"
                    >
                      Да, удалить
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmBulkDeleteLrv(false)}
                      className="px-2 py-0.5 rounded bg-white border border-slate-300 text-slate-700"
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDeleteLrv(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить материалы ({selectedLrvIds.length})</span>
                  </button>
                ))}

              <button
                type="button"
                onClick={() => {
                  setEditingLrvId(null);
                  setShowAddForm((v) => !v);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить позицию ЛРВ</span>
              </button>
            </>
          )}
        </div>
      </div>

      {excelUploadMessage && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 ${
            excelUploadMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-red-50 border-red-300 text-red-900'
          }`}
        >
          <span>{excelUploadMessage.text}</span>
          <button
            type="button"
            onClick={() => setExcelUploadMessage(null)}
            className="text-slate-500 hover:text-slate-800 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Форма ручного добавления или редактирования одной позиции ЛРВ */}
      {showAddForm && (
        <form
          onSubmit={handleAddSingleItem}
          className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-sm"
        >
          {formError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 text-xs font-semibold">
              {formError}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-[#1e3799]">
              {editingLrvId
                ? `Редактирование позиции ЛРВ (${newLrvCode})`
                : 'Новая позиция спецификации ЛРВ'}
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

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
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
            <div>
              <label className="block text-xs text-slate-600 mb-1">Код ЛРВ *</label>
              <input
                type="text"
                required
                value={newLrvCode}
                onChange={(e) => setNewLrvCode(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Краткое наименование *</label>
              <input
                type="text"
                required
                value={newShortName}
                onChange={(e) => setNewShortName(e.target.value)}
                className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-9 gap-3">
            <div>
              <label className="block text-xs text-slate-600 mb-1">Марка стали</label>
              <input
                type="text"
                value={newMaterial}
                onChange={(e) => setNewMaterial(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">НТД (ГОСТ / ТУ)</label>
              <input
                type="text"
                value={newNtd}
                onChange={(e) => setNewNtd(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-600 mb-1">Завод-изготовитель</label>
              <input
                type="text"
                value={newManufacturer}
                onChange={(e) => setNewManufacturer(e.target.value)}
                placeholder="ПАО «ЧТПЗ»"
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded text-xs"
              />
            </div>
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
                  <label className="block text-xs text-[#1e3799] font-semibold mb-1">
                    DN 2
                  </label>
                  <input
                    type="number"
                    value={newDn2}
                    onChange={(e) => setNewDn2(Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 bg-[#f4f8fe] border border-[#1e3799]/40 rounded text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#1e3799] font-semibold mb-1">
                    Диаметр Ø2, мм
                  </label>
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
                  <label className="block text-xs text-[#1e3799] font-semibold mb-1">
                    Толщина S2, мм
                  </label>
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
            <div>
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

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1.5 rounded border border-slate-300 text-xs text-slate-600"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e]"
            >
              Сохранить позицию
            </button>
          </div>
        </form>
      )}

      {/* Фильтр по Шифру РД (строго из лайнлиста) */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">
            Фильтр по Шифру РД (из лайнлиста):
          </span>
          <select
            value={rdFilter}
            onChange={(e) => setRdFilter(e.target.value)}
            aria-label="Фильтр по Шифру РД (из лайнлиста)"
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono"
          >
            <option value="ALL">Все шифры РД лайнлиста ({catalog.length} поз.)</option>
            {allRds.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} ({r.objectName})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Индикатор активных Excel-фильтров каталога ЛРВ */}
      {activeFilterKeys.length > 0 && (
        <div className="bg-[#e8f1fc] rounded-xl border border-sky-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {activeFilterKeys.map((k) => (
              <span
                key={k}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white border border-sky-300 text-[#1e3799] font-medium"
              >
                <Filter className="w-3 h-3" />
                <span>
                  {lrvColumnLabels[k] || k}: {columnFilters[k]?.length} знач.
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyColumnFilter(k, undefined)}
                  className="text-slate-400 hover:text-red-600 font-bold"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setColumnFilters({})}
            className="inline-flex items-center gap-1 text-[#1e3799] hover:underline font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сбросить фильтры столбцов</span>
          </button>
        </div>
      )}

      {/* Таблица каталога ЛРВ с шапкой #1e3799, Excel-фильтрами и раздельными столбцами DN 1/DN 2, Ø1/Ø2 и S1/S2 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto overflow-y-auto min-h-[380px] max-h-[calc(100vh-250px)] table-scroll-container">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 z-20 shadow-xs">
              <tr className="bg-[#1e3799] text-white text-left">
                {onDeleteLrvItems && (
                  <th className="py-2.5 px-2.5 border-r border-white/15 w-9 text-center sticky left-0 top-0 z-30 bg-[#1e3799]">
                    <input
                      type="checkbox"
                      aria-label="Выбрать все материалы в ЛРВ"
                      checked={
                        filteredCatalog.length > 0 &&
                        filteredCatalog.every((item) =>
                          selectedLrvIds.includes(item.id)
                        )
                      }
                      onChange={() => {
                        const visIds = filteredCatalog.map((i) => i.id);
                        const allChecked =
                          visIds.length > 0 &&
                          visIds.every((id) => selectedLrvIds.includes(id));
                        if (allChecked) {
                          setSelectedLrvIds((prev) =>
                            prev.filter((id) => !visIds.includes(id))
                          );
                        } else {
                          setSelectedLrvIds((prev) =>
                            Array.from(new Set([...prev, ...visIds]))
                          );
                        }
                      }}
                      className="rounded border-white/40 text-sky-400 focus:ring-sky-300 cursor-pointer"
                    />
                  </th>
                )}
                <TableColumnFilterHeader
                  columnKey="lrvCode"
                  label="Код ЛРВ"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.lrvCode}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  width={getColumnWidth('lrvCode')}
                  minWidth={90}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('lrvCode', 140)}
                />
                <TableColumnFilterHeader
                  columnKey="rdCode"
                  label="Шифр РД"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.rdCode}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  width={getColumnWidth('rdCode')}
                  minWidth={110}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('rdCode', 180)}
                />
                <TableColumnFilterHeader
                  columnKey="shortName"
                  label="Краткое наименование"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.shortName}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  width={getColumnWidth('shortName')}
                  minWidth={130}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('shortName', 220)}
                />
                <TableColumnFilterHeader
                  columnKey="material"
                  label="Материал (Сталь)"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.material}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  width={getColumnWidth('material')}
                  minWidth={90}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('material', 130)}
                />
                <TableColumnFilterHeader
                  columnKey="ntd"
                  label="НТД (ГОСТ / ТУ)"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.ntd}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  width={getColumnWidth('ntd')}
                  minWidth={90}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('ntd', 140)}
                />
                <TableColumnFilterHeader
                  columnKey="manufacturer"
                  label="Завод-изготовитель"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.manufacturer}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  width={getColumnWidth('manufacturer')}
                  minWidth={100}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('manufacturer', 160)}
                />
                <TableColumnFilterHeader
                  columnKey="dn1"
                  label="Условный проход DN 1"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.dn1}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  align="right"
                  width={getColumnWidth('dn1')}
                  minWidth={80}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('dn1', 95)}
                />
                <TableColumnFilterHeader
                  columnKey="diameterMm"
                  label="Диаметр Ø1, мм"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.diameterMm}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  align="right"
                  width={getColumnWidth('diameterMm')}
                  minWidth={80}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('diameterMm', 110)}
                />
                <TableColumnFilterHeader
                  columnKey="wallThickness"
                  label="Толщина стенки S1, мм"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.wallThickness}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  align="right"
                  width={getColumnWidth('wallThickness')}
                  minWidth={80}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('wallThickness', 110)}
                />
                <TableColumnFilterHeader
                  columnKey="dn2"
                  label="Условный проход DN 2"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.dn2}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  align="right"
                  width={getColumnWidth('dn2')}
                  minWidth={80}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('dn2', 95)}
                />
                <TableColumnFilterHeader
                  columnKey="diameterMm2"
                  label="Диаметр Ø2, мм"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.diameterMm2}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  align="right"
                  width={getColumnWidth('diameterMm2')}
                  minWidth={80}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('diameterMm2', 110)}
                />
                <TableColumnFilterHeader
                  columnKey="wallThickness2"
                  label="Толщина стенки S2, мм"
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.wallThickness2}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  align="right"
                  width={getColumnWidth('wallThickness2')}
                  minWidth={80}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('wallThickness2', 110)}
                />
                <TableColumnFilterHeader
                  columnKey="specQty"
                  label="Кол-во по спец."
                  rows={rdScopedCatalog}
                  getValue={lrvColumnGetters.specQty}
                  activeFilters={columnFilters}
                  onApplyFilter={handleApplyColumnFilter}
                  sortConfig={sortConfig}
                  onSort={handleSortColumn}
                  align="right"
                  width={getColumnWidth('specQty')}
                  minWidth={85}
                  onResizeStart={handleResizeStart}
                  onAutoFit={() => handleAutoFit('specQty', 110)}
                />
                {onDeleteLrvItems && (
                  <th
                    style={{
                      width: getColumnWidth('action'),
                      minWidth: getColumnWidth('action'),
                    }}
                    className="relative py-2.5 px-3 font-semibold text-center whitespace-nowrap"
                  >
                    Действие
                    <ColumnResizeHandle
                      onResizeStart={handleResizeStart}
                      onAutoFit={() => handleAutoFit('action', 95)}
                      colKey="action"
                      currentWidth={getColumnWidth('action')}
                      minWidth={70}
                    />
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredCatalog.map((item) => {
                const dn1Val = getLrvItemDn1(item);
                const dn2Val = getLrvItemDn2(item);
                const isSelected = selectedLrvIds.includes(item.id);

                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-[#e8f1fc]/50 transition-colors ${
                      isSelected
                        ? 'bg-[#e8f1fc]'
                        : 'odd:bg-white even:bg-slate-50/60'
                    }`}
                  >
                    {onDeleteLrvItems && (
                      <td className="py-2.5 px-2.5 border-r border-slate-200 text-center sticky left-0 z-10 bg-inherit">
                        <input
                          type="checkbox"
                          aria-label={`Выбрать позицию ЛРВ ${item.lrvCode}`}
                          checked={isSelected}
                          onChange={() =>
                            setSelectedLrvIds((prev) =>
                              prev.includes(item.id)
                                ? prev.filter((id) => id !== item.id)
                                : [...prev, item.id]
                            )
                          }
                          className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799] cursor-pointer"
                        />
                      </td>
                    )}
                    <td
                      style={{
                        width: getColumnWidth('lrvCode'),
                        minWidth: getColumnWidth('lrvCode'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 font-mono font-bold text-[#1e3799] whitespace-nowrap"
                    >
                      {item.lrvCode}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('rdCode'),
                        minWidth: getColumnWidth('rdCode'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 font-mono text-slate-900 whitespace-nowrap"
                    >
                      {item.rdCode}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('shortName'),
                        minWidth: getColumnWidth('shortName'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 font-semibold text-slate-900"
                    >
                      {item.shortName}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('material'),
                        minWidth: getColumnWidth('material'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 font-mono text-slate-800 whitespace-nowrap"
                    >
                      {item.material}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('ntd'),
                        minWidth: getColumnWidth('ntd'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 text-slate-700 whitespace-nowrap"
                    >
                      {item.ntd}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('manufacturer'),
                        minWidth: getColumnWidth('manufacturer'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 text-slate-700 whitespace-nowrap"
                    >
                      {item.manufacturer || '—'}
                    </td>
                    {/* Условный проход DN 1 */}
                    <td
                      style={{
                        width: getColumnWidth('dn1'),
                        minWidth: getColumnWidth('dn1'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 font-mono text-right font-semibold text-slate-900"
                    >
                      {dn1Val !== undefined ? dn1Val : ''}
                    </td>
                    {/* Диаметр Ø1, мм */}
                    <td
                      style={{
                        width: getColumnWidth('diameterMm'),
                        minWidth: getColumnWidth('diameterMm'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 font-mono text-right text-slate-900"
                    >
                      {item.diameterMm}
                    </td>
                    {/* Толщина стенки S1, мм */}
                    <td
                      style={{
                        width: getColumnWidth('wallThickness'),
                        minWidth: getColumnWidth('wallThickness'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 font-mono text-right text-slate-900"
                    >
                      {item.wallThickness.toFixed(1)}
                    </td>
                    {/* Условный проход DN 2 — для элементов с одним диаметром строго пусто */}
                    <td
                      style={{
                        width: getColumnWidth('dn2'),
                        minWidth: getColumnWidth('dn2'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 font-mono text-right font-semibold text-[#1e3799]"
                    >
                      {dn2Val !== undefined ? dn2Val : ''}
                    </td>
                    {/* Диаметр Ø2, мм — для элементов с одним диаметром строго пусто */}
                    <td
                      style={{
                        width: getColumnWidth('diameterMm2'),
                        minWidth: getColumnWidth('diameterMm2'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 font-mono text-right font-semibold text-[#1e3799]"
                    >
                      {item.diameterMm2 !== undefined ? item.diameterMm2 : ''}
                    </td>
                    {/* Толщина стенки S2, мм — для элементов с одним диаметром строго пусто */}
                    <td
                      style={{
                        width: getColumnWidth('wallThickness2'),
                        minWidth: getColumnWidth('wallThickness2'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 font-mono text-right font-semibold text-[#1e3799]"
                    >
                      {item.wallThickness2 !== undefined
                        ? item.wallThickness2.toFixed(1)
                        : ''}
                    </td>
                    <td
                      style={{
                        width: getColumnWidth('specQty'),
                        minWidth: getColumnWidth('specQty'),
                      }}
                      className="py-2.5 px-3 border-r border-slate-200 font-mono text-right font-semibold text-slate-900 whitespace-nowrap"
                    >
                      {item.specQty} {item.unit}
                    </td>
                    {onDeleteLrvItems && (
                      <td
                        style={{
                          width: getColumnWidth('action'),
                          minWidth: getColumnWidth('action'),
                        }}
                        className="py-2.5 px-3 text-center whitespace-nowrap"
                      >
                        {!canEdit ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                            <Lock className="w-3.5 h-3.5" />
                          </span>
                        ) : confirmDeleteLrvId === item.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteLrvItems([item.id]);
                                setConfirmDeleteLrvId(null);
                                setSelectedLrvIds((prev) =>
                                  prev.filter((id) => id !== item.id)
                                );
                              }}
                              className="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold hover:bg-red-700"
                            >
                              Удалить
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteLrvId(null)}
                              className="px-1.5 py-0.5 rounded border border-slate-300 text-slate-600 text-[10px]"
                            >
                              Отмена
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleStartEditLrv(item)}
                              className="p-1.5 rounded text-[#1e3799] hover:bg-sky-50 transition-colors"
                              title={`Редактировать материал ЛРВ «${item.lrvCode}»`}
                              aria-label={`Редактировать материал ЛРВ ${item.lrvCode}`}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteLrvId(item.id)}
                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title={`Удалить материал ЛРВ «${item.lrvCode}»`}
                              aria-label={`Удалить материал ЛРВ ${item.lrvCode}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2.5 bg-[#f8fafd] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <div>
              Показано позиций ЛРВ:{' '}
              <span className="font-mono font-bold text-slate-800">
                {filteredCatalog.length}
              </span>{' '}
              из <span className="font-mono">{catalog.length}</span>
            </div>
            {hasCustomWidths && (
              <button
                type="button"
                onClick={handleResetWidths}
                title="Сбросить пользовательские ширины столбцов справочника ЛРВ"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-[11px] transition-colors shadow-2xs cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 text-slate-400" />
                <span>Сбросить ширину столбцов</span>
              </button>
            )}
          </div>
          <div>
            Ширину столбцов можно регулировать перетаскиванием правой границы заголовка (двойной клик — автоподбор)
          </div>
        </div>
      </div>
    </div>
  );
};
