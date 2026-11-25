import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Filter, RotateCcw } from 'lucide-react';
import { FacilityObject, LRVItem, WeldJoint } from '../types/welding';
import { MaterialBatchAct } from '../types/materialControl';
import {
  calculateMaterialControlBalance,
  splitMaterialForPartialReplacement,
} from '../utils/materialControlLogic';
import {
  MaterialPartialReplaceModal,
  AddIncomingControlActModal,
} from './materials';
import {
  exportLrvCatalogToExcel,
  readLrvCatalogFromExcelFile,
} from '../utils/excelUtils';
import { getJointsUsingLrvItem } from '../utils/pipeCalc';
import {
  getLrvItemDn1,
  getLrvItemDn2,
  isLrvItemUsedInJoints,
  resolveLrvConnectionType,
  resolveLrvFullName,
  resolveLrvItemCategory,
} from '../utils/weldingLogic';
import { applyTableColumnFiltersAndSort } from './TableColumnFilterPopover';
import { filterLrvCatalogByObject } from '../utils/filters';
import { useResizableColumns } from '../utils/useResizableColumns';
import { useAuth, useAppContext } from '../context';
import {
  LrvItemFormModal,
  LrvStatusFilter,
  LrvSupersedeModal,
  LrvTable,
  LrvToolbar,
} from './lrv';

interface LrvCatalogViewProps {
  catalog?: LRVItem[];
  facilities?: FacilityObject[];
  selectedObjectName?: string;
  selectedRdCode?: string;
  onAddLrvItems: (items: LRVItem[]) => void;
  onUpdateLrvItem?: (item: LRVItem) => void;
  onDeleteLrvItems?: (ids: string[]) => void;
  canEdit?: boolean;
  currentUserRoleLabel?: string;
  joints?: WeldJoint[];
}

export const LrvCatalogView: React.FC<LrvCatalogViewProps> = (props) => {
  const auth = useAuth();
  const app = useAppContext();

  const joints = props.joints ?? app?.joints ?? [];
  const selectedObjectName = props.selectedObjectName ?? app?.selectedObjectName ?? 'ALL';
  const rawCatalog = props.catalog ?? app?.lrvCatalog ?? [];
  const rawFacilities = props.facilities ?? app?.derivedFacilities ?? [];

  const facilities = useMemo(
    () =>
      selectedObjectName && selectedObjectName !== 'ALL'
        ? rawFacilities.filter((f) => f.name.trim() === selectedObjectName.trim())
        : rawFacilities,
    [rawFacilities, selectedObjectName]
  );

  const catalog = useMemo(
    () => filterLrvCatalogByObject(rawCatalog, selectedObjectName, rawFacilities),
    [rawCatalog, selectedObjectName, rawFacilities]
  );

  const selectedRdCode = props.selectedRdCode ?? app?.selectedRdCode ?? 'ALL';
  const canEdit = props.canEdit ?? auth?.userPermissions?.canEditLrvCatalog ?? false;

  const { onAddLrvItems, onUpdateLrvItem, onDeleteLrvItems } = props;

  const allRds = useMemo(
    () =>
      (facilities || []).flatMap((f) =>
        (f.rdCodes || []).map((r) => ({
          objectName: f.name,
          code: r.code,
          title: r.title,
        }))
      ),
    [facilities]
  );

  const [rdFilter, setRdFilter] = useState<string>(() =>
    selectedRdCode && selectedRdCode !== 'ALL' && allRds.some((r) => r.code === selectedRdCode)
      ? selectedRdCode
      : 'ALL'
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<LRVItem | null>(null);
  const [selectedLrvIds, setSelectedLrvIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<LrvStatusFilter>('all');
  const [expandedMaterialIds, setExpandedMaterialIds] = useState<Record<string, boolean>>({});
  const [activeReplaceTarget, setActiveReplaceTarget] = useState<{
    material: LRVItem;
    batch: MaterialBatchAct;
  } | null>(null);
  const [activeAddActMaterial, setActiveAddActMaterial] = useState<LRVItem | null>(null);
  const [supersedeModalItem, setSupersedeModalItem] = useState<LRVItem | null>(null);
  const [bulkDeleteBlockMessage, setBulkDeleteBlockMessage] = useState<string | null>(null);
  const [confirmDeleteLrvId, setConfirmDeleteLrvId] = useState<string | null>(null);
  const [excelUploadMessage, setExcelUploadMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Column filters & sort
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: 'asc' | 'desc';
  } | null>(null);

  const {
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
      shortName: 200,
      marking: 150,
      fullName: 240,
      category: 110,
      pnMpa: 120,
      connectionType: 120,
      material: 130,
      ntd: 140,
      manufacturer: 160,
      dn1: 90,
      diameterMm: 110,
      wallThickness: 110,
      dn2: 90,
      diameterMm2: 110,
      wallThickness2: 110,
      specQty: 110,
      controlStatus: 140,
      balance: 140,
      action: 95,
    },
  });

  const normalizedCatalog = useMemo(() => {
    return catalog.map((item) => {
      const totalSpec = item.totalSpecQty ?? item.specQty;
      const balance = calculateMaterialControlBalance(totalSpec, item.batches || []);
      return {
        ...item,
        totalSpecQty: totalSpec,
        ...balance,
      };
    });
  }, [catalog]);

  const prevObjectRef = useRef<string>(selectedObjectName);

  // Сбрасываем устаревшие фильтры и выделение при смене объекта строительства
  useEffect(() => {
    if (prevObjectRef.current !== selectedObjectName) {
      prevObjectRef.current = selectedObjectName;
      setColumnFilters({});
      setSelectedLrvIds([]);
      setRdFilter((prev) => {
        if (
          selectedRdCode &&
          selectedRdCode !== 'ALL' &&
          allRds.some((r) => r.code === selectedRdCode)
        ) {
          return selectedRdCode;
        }
        if (prev && prev !== 'ALL' && allRds.some((r) => r.code === prev)) {
          return prev;
        }
        return 'ALL';
      });
    }
  }, [selectedObjectName, selectedRdCode, allRds]);

  // Синхронизируем фильтр шифра РД, если текущий шифр отсутствует в новом списке доступных РД
  useEffect(() => {
    if (rdFilter && rdFilter !== 'ALL' && !allRds.some((r) => r.code === rdFilter)) {
      setRdFilter('ALL');
    }
  }, [rdFilter, allRds]);

  const rdScopedCatalog = useMemo(() => {
    return normalizedCatalog.filter((item) => {
      if (rdFilter && rdFilter !== 'ALL' && item.rdCode !== rdFilter) return false;
      if (statusFilter === 'accepted' && item.controlStatus !== 'accepted') return false;
      if (statusFilter === 'partial' && item.controlStatus !== 'partial') return false;
      if (statusFilter === 'rejected' && item.controlStatus !== 'rejected') return false;
      if (statusFilter === 'pending' && item.controlStatus !== 'pending') return false;
      if (
        statusFilter === 'superseded' &&
        item.status !== 'superseded' &&
        item.status !== 'archived'
      ) {
        return false;
      }
      return true;
    });
  }, [normalizedCatalog, rdFilter, statusFilter]);

  const lrvColumnGetters = useMemo<Record<string, (item: LRVItem) => string>>(
    () => ({
      lrvCode: (item) => item.lrvCode || '',
      rdCode: (item) => item.rdCode || '',
      shortName: (item) => item.shortName || '',
      marking: (item) => item.marking || '',
      fullName: (item) => resolveLrvFullName(item),
      category: (item) => resolveLrvItemCategory(item),
      pnMpa: (item) => (item.pnMpa ? `${item.pnMpa} МПа` : ''),
      connectionType: (item) =>
        resolveLrvItemCategory(item) === 'ЗРА'
          ? resolveLrvConnectionType(item) === 'фланцевый'
            ? 'фланцевый'
            : 'приварной'
          : '',
      material: (item) => item.material || '',
      ntd: (item) => item.ntd || '',
      manufacturer: (item) => item.manufacturer || '',
      dn1: (item) => {
        const val = getLrvItemDn1(item);
        return val !== undefined ? String(val) : '';
      },
      diameterMm: (item) => (item.diameterMm !== undefined ? item.diameterMm.toFixed(1) : ''),
      wallThickness: (item) => (item.wallThickness !== undefined ? item.wallThickness.toFixed(1) : ''),
      dn2: (item) => {
        const val = getLrvItemDn2(item);
        return val !== undefined ? String(val) : '';
      },
      diameterMm2: (item) =>
        item.diameterMm2 !== undefined ? item.diameterMm2.toFixed(1) : '',
      wallThickness2: (item) =>
        item.wallThickness2 !== undefined ? item.wallThickness2.toFixed(1) : '',
      specQty: (item) => `${item.specQty ?? 0} ${item.unit || 'шт'}`,
      controlStatus: (item) => item.controlStatus || 'pending',
      balance: (item) => `${item.acceptedQty || 0} / ${item.totalSpecQty ?? item.specQty}`,
    }),
    []
  );

  const lrvColumnLabels: Record<string, string> = {
    lrvCode: 'Код ЛРВ',
    rdCode: 'Шифр РД',
    shortName: 'Краткое наименование',
    marking: 'Маркировка',
    fullName: 'Полное наименование',
    category: 'Категория',
    pnMpa: 'Давление PN, МПа',
    connectionType: 'Подсоединение',
    material: 'Материал',
    ntd: 'НТД',
    manufacturer: 'Завод-изготовитель',
    dn1: 'DN 1',
    diameterMm: 'Диаметр Ø1, мм',
    wallThickness: 'Толщина стенки S1, мм',
    dn2: 'DN 2',
    diameterMm2: 'Диаметр Ø2, мм',
    wallThickness2: 'Толщина стенки S2, мм',
    specQty: 'Кол-во по спец.',
    controlStatus: 'Статус контроля',
    balance: 'Баланс допуска',
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

  const handleApplyColumnFilter = (colKey: string, vals: string[] | undefined) => {
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

  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const defaultObjectName = facilities[0]?.name || app.selectedObjectName || '';
      const defaultRd = rdFilter || selectedRdCode || '';
      const existingCodes = new Set(catalog.map((i) => i.lrvCode.trim().toUpperCase()));
      const parsedItems = await readLrvCatalogFromExcelFile(file, defaultObjectName, defaultRd, existingCodes);
      if (parsedItems.length === 0) {
        setExcelUploadMessage({
          type: 'error',
          text: `В файле «${file.name}» не найдено корректных строк материалов.`,
        });
      } else {
        onAddLrvItems(parsedItems);
        setExcelUploadMessage({
          type: 'success',
          text: `Из файла «${file.name}» успешно загружено ${parsedItems.length} поз. материалов.`,
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

  const handleDeleteRequest = (item: LRVItem) => {
    const usedJoints = joints ? getJointsUsingLrvItem(item, joints) : [];
    if (usedJoints.length > 0) {
      setSupersedeModalItem(item);
    } else {
      setConfirmDeleteLrvId(item.id);
    }
  };

  const activeFilterKeys = Object.keys(columnFilters);

  return (
    <div className="space-y-4">
      {bulkDeleteBlockMessage && (
        <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start justify-between gap-3 shadow-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <span className="leading-relaxed">{bulkDeleteBlockMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBulkDeleteBlockMessage(null)}
            className="text-amber-800 hover:text-amber-950 font-bold text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Верхняя панель каталога ЛРВ */}
      <LrvToolbar
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        canEdit={canEdit}
        onExportExcel={() => exportLrvCatalogToExcel(filteredCatalog, false)}
        onDownloadTemplate={() => exportLrvCatalogToExcel([], true)}
        onImportClick={() => fileInputRef.current?.click()}
        fileInputRef={fileInputRef}
        onFileUpload={handleExcelFileUpload}
        onToggleAddForm={() => {
          setEditingItem(null);
          setShowAddForm((v) => !v);
        }}
        selectedLrvIds={selectedLrvIds}
        onClearSelection={() => setSelectedLrvIds([])}
        onDeleteSelected={onDeleteLrvItems}
        catalog={catalog}
        joints={joints}
        onBlockMessage={setBulkDeleteBlockMessage}
      />

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
            className="text-slate-500 hover:text-slate-800 font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Форма добавления/редактирования */}
      {showAddForm && (
        <LrvItemFormModal
          isOpen={showAddForm}
          onClose={() => setShowAddForm(false)}
          editingItem={editingItem}
          allRds={allRds}
          existingItems={catalog}
          onSave={(savedItem) => {
            if (editingItem && onUpdateLrvItem) {
              onUpdateLrvItem(savedItem);
            } else {
              onAddLrvItems([savedItem]);
            }
            setShowAddForm(false);
            setEditingItem(null);
          }}
        />
      )}

      {/* Фильтр по Шифру РД */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">
            Фильтр по Шифру РД:
          </span>
          <select
            value={rdFilter}
            onChange={(e) => setRdFilter(e.target.value)}
            aria-label="Фильтр по Шифру РД"
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-md text-xs font-mono"
          >
            <option value="ALL">Все шифры РД ({catalog.length} поз.)</option>
            {allRds.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} — {r.objectName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Индикатор активных Excel-фильтров */}
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
                  className="text-slate-400 hover:text-red-600 font-bold cursor-pointer"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setColumnFilters({})}
            className="inline-flex items-center gap-1 text-[#1e3799] hover:underline font-semibold cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сбросить фильтры столбцов</span>
          </button>
        </div>
      )}

      {/* Таблица позиций ЛРВ */}
      <LrvTable
        items={filteredCatalog}
        allFilteredItems={filteredCatalog}
        rdScopedCatalog={rdScopedCatalog}
        totalCatalogCount={catalog.length}
        selectedLrvIds={selectedLrvIds}
        onToggleSelectAll={() => {
          const visIds = filteredCatalog.map((i) => i.id);
          const allChecked =
            visIds.length > 0 && visIds.every((id) => selectedLrvIds.includes(id));
          if (allChecked) {
            setSelectedLrvIds((prev) => prev.filter((id) => !visIds.includes(id)));
          } else {
            setSelectedLrvIds((prev) => Array.from(new Set([...prev, ...visIds])));
          }
        }}
        onToggleSelectRow={(id) => {
          setSelectedLrvIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
          );
        }}
        expandedMaterialIds={expandedMaterialIds}
        onToggleExpand={(id) => {
          setExpandedMaterialIds((prev) => ({ ...prev, [id]: !prev[id] }));
        }}
        canEdit={canEdit}
        onEdit={(item) => {
          setEditingItem(item);
          setShowAddForm(true);
        }}
        onDeleteRequest={handleDeleteRequest}
        confirmDeleteId={confirmDeleteLrvId}
        onConfirmDelete={(id) => {
          if (onDeleteLrvItems) {
            onDeleteLrvItems([id]);
          }
          setConfirmDeleteLrvId(null);
        }}
        onCancelDelete={() => setConfirmDeleteLrvId(null)}
        onAddAct={(item) => setActiveAddActMaterial(item)}
        onInitiateReplacement={(mat, batch) => {
          setActiveReplaceTarget({ material: mat, batch });
        }}
        onDeleteLrvItems={onDeleteLrvItems}
        joints={joints}
        getColumnWidth={getColumnWidth}
        handleResizeStart={handleResizeStart}
        handleAutoFit={handleAutoFit}
        handleResetWidths={handleResetWidths}
        hasCustomWidths={hasCustomWidths}
        columnFilters={columnFilters}
        onApplyColumnFilter={handleApplyColumnFilter}
        sortConfig={sortConfig}
        onSortColumn={handleSortColumn}
        lrvColumnGetters={lrvColumnGetters}
      />

      {/* Модальное окно аннулирования (пересогласования) */}
      <LrvSupersedeModal
        item={supersedeModalItem}
        onClose={() => setSupersedeModalItem(null)}
        onConfirm={(item, letter, date) => {
          if (onUpdateLrvItem) {
            onUpdateLrvItem({
              ...item,
              status: 'superseded',
              replacementLetter: letter.trim() || 'Письмо пересогласования',
              replacementDate: date,
            });
          }
          setSupersedeModalItem(null);
        }}
        joints={joints}
      />

      {/* Модальное окно согласования замены партии */}
      {activeReplaceTarget && (
        <MaterialPartialReplaceModal
          isOpen={Boolean(activeReplaceTarget)}
          onClose={() => setActiveReplaceTarget(null)}
          material={activeReplaceTarget.material}
          batch={activeReplaceTarget.batch}
          onConfirmReplacement={(params) => {
            const { updatedOriginal, replacementItem } = splitMaterialForPartialReplacement({
              originalMaterial: params.originalMaterial,
              rejectedBatchId: params.rejectedBatchId,
              replacedQuantity: params.replacedQuantity,
              replacementNotice: {
                letterNumber: params.letterNumber,
                letterDate: params.letterDate,
                approvedBy: params.approvedBy,
                reason: params.reason,
              },
              replacementCustomFields: params.replacementCustomFields,
            });
            if (onUpdateLrvItem) {
              onUpdateLrvItem(updatedOriginal);
            }
            onAddLrvItems([replacementItem]);
            setExpandedMaterialIds((prev) => ({
              ...prev,
              [updatedOriginal.id]: true,
              [replacementItem.id]: true,
            }));
          }}
        />
      )}

      {/* Модальное окно внесения акта входного контроля */}
      {activeAddActMaterial && (
        <AddIncomingControlActModal
          isOpen={Boolean(activeAddActMaterial)}
          onClose={() => setActiveAddActMaterial(null)}
          material={activeAddActMaterial}
          onAddAct={(mat, newBatch) => {
            if (onUpdateLrvItem) {
              const updatedBatches = [
                ...(mat.batches || []),
                newBatch,
              ];
              const balance = calculateMaterialControlBalance(
                mat.totalSpecQty ?? mat.specQty,
                updatedBatches
              );
              onUpdateLrvItem({
                ...mat,
                batches: updatedBatches,
                ...balance,
              });
              setExpandedMaterialIds((prev) => ({
                ...prev,
                [activeAddActMaterial.id]: true,
              }));
            }
            setActiveAddActMaterial(null);
          }}
        />
      )}
    </div>
  );
};
