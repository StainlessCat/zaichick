import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { FacilityObject, LRVItem, WeldJoint } from '../types/welding';
import { MaterialBatchAct, MaterialItemWithControl } from '../types/materialControl';
import { useAuth, useAppContext } from '../context';
import {
  exportLrvCatalogToExcel,
  exportLrvFilteredToXlsx,
  readLrvCatalogFromExcelFile,
} from '../utils/excelUtils';
import {
  filterLrvCatalogByObject,
  getJointsUsingLrvItem,
} from '../utils/weldingLogic';
import { resolveLrvItemCategory } from '../utils/pipeCalc';
import {
  INCOMING_CONTROL_VERDICT_LABELS,
  MATERIAL_CONTROL_STATUS_LABELS,
  calculateMaterialControlBalance,
} from '../utils/materialControlLogic';
import { formatInspectorShortName } from '../utils/rbac';
import { useResizableColumns } from '../utils/useResizableColumns';
import { MaterialPartialReplaceModal } from './materials/MaterialPartialReplaceModal';
import { AddIncomingControlActModal } from './materials/AddIncomingControlActModal';
import { LrvToolbar, LrvStatusCounts, LrvStatusFilter } from './lrv/LrvToolbar';
import { LrvItemFormModal } from './lrv/LrvItemFormModal';
import { LrvSupersedeModal } from './lrv/LrvSupersedeModal';
import { LrvSortConfig, LrvTable } from './lrv/LrvTable';
import {
  LRV_COLUMN_DEFINITIONS,
  LRV_FULL_COLUMNS,
  LRV_OPERATIONAL_COLUMNS,
  LrvColumnKey,
  LrvColumnPreset,
  loadSavedLrvColumns,
  saveLrvColumns,
} from './lrv/lrvColumns';

interface LrvCatalogViewProps {
  catalog?: LRVItem[];
  facilities?: FacilityObject[];
  selectedObjectName?: string;
  selectedRdCode?: string;
  onAddLrvItems?: (items: LRVItem[]) => void;
  onUpdateLrvItem?: (item: LRVItem) => void;
  onUpdateLrvBatches?: (item: LRVItem) => void;
  onDeleteLrvItems?: (ids: string[]) => void;
  onOpenJointsByLrvCode?: (lrvCode: string, rdCode?: string) => void;
  canEdit?: boolean;
  canManageIncomingControl?: boolean;
  joints?: WeldJoint[];
}

const DEFAULT_COL_WIDTHS: Record<string, number> = Object.fromEntries(
  LRV_COLUMN_DEFINITIONS.map((c) => [c.key, c.defaultWidth])
);

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
  const canEditCatalog = props.canEdit ?? auth?.userPermissions?.canEditLrvCatalog ?? false;
  const canManageIncomingControl =
    props.canManageIncomingControl ??
    auth?.userPermissions?.canManageIncomingControl ??
    canEditCatalog;
  const defaultInspectorName = formatInspectorShortName(auth?.currentUser?.fullName);

  const {
    onAddLrvItems,
    onUpdateLrvItem,
    onUpdateLrvBatches,
    onDeleteLrvItems,
    onOpenJointsByLrvCode,
  } = props;

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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LrvStatusFilter>('all');
  const [visibleColumns, setVisibleColumns] = useState<LrvColumnKey[]>(() =>
    loadSavedLrvColumns()
  );
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  const [sortConfig, setSortConfig] = useState<LrvSortConfig | null>(null);

  const [isItemFormOpen, setIsItemFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LRVItem | null>(null);
  const [selectedLrvIds, setSelectedLrvIds] = useState<string[]>([]);
  const [expandedMaterialIds, setExpandedMaterialIds] = useState<Record<string, boolean>>({});
  const [activeReplaceTarget, setActiveReplaceTarget] = useState<{
    material: LRVItem;
    batch: MaterialBatchAct;
  } | null>(null);
  const [activeActModal, setActiveActModal] = useState<{
    material: LRVItem;
    editingBatch: MaterialBatchAct | null;
  } | null>(null);
  const [supersedeModalItem, setSupersedeModalItem] = useState<LRVItem | null>(null);
  const [bulkDeleteBlockMessage, setBulkDeleteBlockMessage] = useState<string | null>(null);
  const [confirmDeleteLrvId, setConfirmDeleteLrvId] = useState<string | null>(null);
  const [excelUploadMessage, setExcelUploadMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const { getColumnWidth, handleResizeStart, handleAutoFit } = useResizableColumns({
    storageKey: 'zaychick_col_widths_lrv_v2',
    defaultWidths: DEFAULT_COL_WIDTHS,
    minColumnWidth: 64,
  });

  useEffect(() => {
    saveLrvColumns(visibleColumns);
  }, [visibleColumns]);

  useEffect(() => {
    if (selectedRdCode && selectedRdCode !== 'ALL') {
      if (allRds.some((r) => r.code === selectedRdCode)) {
        setRdFilter(selectedRdCode);
        return;
      }
    }
    setRdFilter('ALL');
  }, [selectedRdCode, selectedObjectName, allRds]);

  const linkedJointsCountById = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of catalog) {
      map.set(item.id, getJointsUsingLrvItem(item, joints).length);
    }
    return map;
  }, [catalog, joints]);

  const computeBalance = (item: LRVItem) =>
    calculateMaterialControlBalance(item.totalSpecQty ?? item.specQty, item.batches || []);

  // Базовая выборка по шифру РД и текстовому поиску (для счётчиков KPI и вкладок)
  const rdAndSearchItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (rdFilter !== 'ALL' && item.rdCode !== rdFilter) return false;
      if (!q) return true;
      const inBasic = [
        item.lrvCode,
        item.rdCode,
        item.shortName,
        item.fullName,
        item.marking,
        item.material,
        item.ntd,
        item.manufacturer,
        resolveLrvItemCategory(item),
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
      if (inBasic) return true;
      return (item.batches || []).some((b) =>
        [
          b.actNumber,
          b.certificateNumber,
          b.heatNumber,
          b.inspectorName,
          ...(b.serialNumbers || []),
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    });
  }, [catalog, rdFilter, searchQuery]);

  const statusCounts: LrvStatusCounts = useMemo(() => {
    let accepted = 0;
    let partial = 0;
    let rejected = 0;
    let pending = 0;
    let superseded = 0;
    let totalActs = 0;

    for (const item of rdAndSearchItems) {
      totalActs += (item.batches || []).length;
      if (item.status === 'superseded') {
        superseded += 1;
        continue;
      }
      const bal = computeBalance(item);
      if (bal.controlStatus === 'accepted' || bal.controlStatus === 'replaced') {
        accepted += 1;
      } else if (bal.controlStatus === 'partial') {
        partial += 1;
      } else if (bal.controlStatus === 'rejected') {
        rejected += 1;
      } else {
        pending += 1;
      }
    }

    return {
      all: rdAndSearchItems.length,
      accepted,
      partial,
      rejected,
      pending,
      superseded,
      totalActs,
    };
  }, [rdAndSearchItems]);

  const baseFilteredItems = useMemo(() => {
    return rdAndSearchItems.filter((item) => {
      if (statusFilter === 'all') return true;
      if (statusFilter === 'superseded') return item.status === 'superseded';
      if (item.status === 'superseded') return false;
      const bal = computeBalance(item);
      if (statusFilter === 'accepted') {
        return bal.controlStatus === 'accepted' || bal.controlStatus === 'replaced';
      }
      return bal.controlStatus === statusFilter;
    });
  }, [rdAndSearchItems, statusFilter]);

  const lrvColumnGetters: Record<string, (item: LRVItem, _idx?: number) => string> = useMemo(
    () => ({
      lrvCode: (i) => i.lrvCode || '',
      rdCode: (i) => i.rdCode || '',
      shortName: (i) => i.shortName || '',
      marking: (i) => i.marking || '',
      fullName: (i) =>
        i.fullName || [i.shortName, i.material, i.ntd].filter(Boolean).join(', '),
      category: (i) => resolveLrvItemCategory(i),
      pnMpa: (i) => i.pnMpa || '',
      connectionType: (i) => i.connectionType || '',
      material: (i) => i.material || '',
      ntd: (i) => i.ntd || '',
      manufacturer: (i) => i.manufacturer || '',
      sizeSummary: (i) => {
        const dn =
          i.dn1 !== undefined ? `DN${i.dn1}${i.dn2 !== undefined ? `/${i.dn2}` : ''}` : '';
        const d1 = i.diameterMm > 0 ? `Ø${i.diameterMm}×${i.wallThickness}` : '';
        return [dn, d1].filter(Boolean).join(' ');
      },
      dn1: (i) => (i.dn1 !== undefined ? String(i.dn1) : ''),
      diameterMm: (i) => (i.diameterMm > 0 ? String(i.diameterMm) : ''),
      wallThickness: (i) => (i.wallThickness > 0 ? String(i.wallThickness) : ''),
      dn2: (i) => (i.dn2 !== undefined ? String(i.dn2) : ''),
      diameterMm2: (i) => (i.diameterMm2 !== undefined ? String(i.diameterMm2) : ''),
      wallThickness2: (i) => (i.wallThickness2 !== undefined ? String(i.wallThickness2) : ''),
      specQty: (i) => `${i.totalSpecQty ?? i.specQty} ${i.unit}`,
      linkedJoints: (i) => String(linkedJointsCountById.get(i.id) ?? 0),
      controlStatus: (i) => {
        if (i.status === 'superseded') return 'Аннулирована';
        const bal = computeBalance(i);
        return MATERIAL_CONTROL_STATUS_LABELS[bal.controlStatus] || bal.controlStatus;
      },
      balance: (i) => {
        const bal = computeBalance(i);
        return `${bal.acceptedQty + bal.replacedQty}/${i.totalSpecQty ?? i.specQty}`;
      },
    }),
    [linkedJointsCountById]
  );

  const filteredItems = useMemo(() => {
    const activeEntries = Object.entries(columnFilters);
    let rows =
      activeEntries.length === 0
        ? baseFilteredItems
        : baseFilteredItems.filter((row, idx) =>
            activeEntries.every(([colKey, allowed]) => {
              const getter = lrvColumnGetters[colKey];
              if (!getter) return true;
              const val = String(getter(row, idx) ?? '').trim();
              return allowed.includes(val);
            })
          );

    if (sortConfig) {
      const getter = lrvColumnGetters[sortConfig.key];
      if (getter) {
        const dir = sortConfig.direction === 'asc' ? 1 : -1;
        rows = [...rows].sort((a, b) => {
          const av = getter(a) ?? '';
          const bv = getter(b) ?? '';
          const an = Number(av.replace(',', '.'));
          const bn = Number(bv.replace(',', '.'));
          if (av !== '' && bv !== '' && Number.isFinite(an) && Number.isFinite(bn)) {
            return (an - bn) * dir;
          }
          return av.localeCompare(bv, 'ru', { numeric: true }) * dir;
        });
      }
    }
    return rows;
  }, [baseFilteredItems, columnFilters, sortConfig, lrvColumnGetters]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      rdFilter !== 'ALL' ||
      statusFilter !== 'all' ||
      Object.keys(columnFilters).length > 0 ||
      sortConfig !== null
  );

  const handleResetAllFilters = () => {
    setSearchQuery('');
    setRdFilter('ALL');
    setStatusFilter('all');
    setColumnFilters({});
    setSortConfig(null);
  };

  const handleApplyPreset = (preset: LrvColumnPreset) => {
    setVisibleColumns(preset === 'operational' ? LRV_OPERATIONAL_COLUMNS : LRV_FULL_COLUMNS);
  };

  const handleApplyColumnFilter = (colKey: string, selectedValues: string[] | undefined) => {
    setColumnFilters((prev) => {
      const next = { ...prev };
      if (selectedValues === undefined) {
        delete next[colKey];
      } else {
        next[colKey] = selectedValues;
      }
      return next;
    });
  };

  const handleSaveItemForm = (item: LRVItem, isEdit: boolean) => {
    if (isEdit) {
      onUpdateLrvItem?.(item);
    } else {
      onAddLrvItems?.([item]);
    }
    setIsItemFormOpen(false);
    setEditingItem(null);
  };

  const persistBatchesForMaterial = (material: LRVItem, nextBatches: MaterialBatchAct[]) => {
    const totalSpec = material.totalSpecQty ?? material.specQty;
    const balance = calculateMaterialControlBalance(totalSpec, nextBatches);
    const updatedItem: LRVItem = {
      ...material,
      totalSpecQty: totalSpec,
      batches: nextBatches,
      ...balance,
    };
    if (onUpdateLrvBatches) {
      onUpdateLrvBatches(updatedItem);
    } else {
      onUpdateLrvItem?.(updatedItem);
    }
  };

  const handleSaveBatchAct = (
    material: LRVItem,
    savedBatch: MaterialBatchAct,
    isEdit: boolean
  ) => {
    const currentBatches = material.batches || [];
    const nextBatches = isEdit
      ? currentBatches.map((b) => (b.id === savedBatch.id ? savedBatch : b))
      : [...currentBatches, savedBatch];
    persistBatchesForMaterial(material, nextBatches);
    setExpandedMaterialIds((prev) => ({ ...prev, [material.id]: true }));
  };

  const handleDeleteBatchAct = (material: LRVItem, batchId: string) => {
    const nextBatches = (material.batches || []).filter((b) => b.id !== batchId);
    persistBatchesForMaterial(material, nextBatches);
  };

  const handleConfirmPartialReplace = (result: {
    updatedOriginal: MaterialItemWithControl;
    replacementItem: MaterialItemWithControl;
  }) => {
    if (onUpdateLrvBatches && !canEditCatalog) {
      onUpdateLrvBatches(result.updatedOriginal);
    } else {
      onUpdateLrvItem?.(result.updatedOriginal);
    }
    onAddLrvItems?.([result.replacementItem]);
    setExpandedMaterialIds((prev) => ({
      ...prev,
      [result.updatedOriginal.id]: true,
      [result.replacementItem.id]: true,
    }));
  };

  const handleExcelFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelUploadMessage(null);
    try {
      const effectiveDefaultRd =
        rdFilter !== 'ALL' ? rdFilter : allRds[0]?.code || '';
      const defaultObj =
        (selectedObjectName !== 'ALL' ? selectedObjectName : '') ||
        allRds.find((r) => r.code === effectiveDefaultRd)?.objectName ||
        allRds[0]?.objectName ||
        '';
      const existingCodes = new Set(
        catalog
          .filter((i) => !effectiveDefaultRd || i.rdCode === effectiveDefaultRd)
          .map((i) => i.lrvCode)
      );
      const parsedItems = await readLrvCatalogFromExcelFile(
        file,
        defaultObj,
        effectiveDefaultRd,
        existingCodes
      );
      if (parsedItems.length === 0) {
        setExcelUploadMessage({
          type: 'error',
          text: 'Новые позиции для импорта не обнаружены или все коды ЛРВ уже присутствуют в каталоге.',
        });
      } else {
        onAddLrvItems?.(parsedItems);
        setExcelUploadMessage({
          type: 'success',
          text: `Успешно импортировано позиций ЛРВ: ${parsedItems.length}`,
        });
      }
    } catch (err) {
      setExcelUploadMessage({
        type: 'error',
        text:
          err instanceof Error
            ? `Ошибка чтения файла Excel: ${err.message}`
            : 'Не удалось прочитать файл Excel.',
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportFilteredExcel = () => {
    exportLrvFilteredToXlsx({
      items: filteredItems.map((it) => ({
        ...it,
        linkedJointsCount: linkedJointsCountById.get(it.id) ?? 0,
      })),
      statusLabels: MATERIAL_CONTROL_STATUS_LABELS,
      verdictLabels: INCOMING_CONTROL_VERDICT_LABELS,
      resolveCategory: (it) => resolveLrvItemCategory(it),
      computeBalance,
    });
  };

  const handleDownloadTemplate = async () => {
    try {
      await exportLrvCatalogToExcel(
        [],
        true,
        rdFilter !== 'ALL' ? rdFilter : undefined
      );
    } catch {
      setExcelUploadMessage({
        type: 'error',
        text: 'Не удалось скачать шаблон Excel. Выполните вход в систему.',
      });
    }
  };

  const handleRequestDeleteOrSupersede = (item: LRVItem) => {
    const linked = getJointsUsingLrvItem(item, joints);
    if (linked.length > 0) {
      setSupersedeModalItem(item);
      setConfirmDeleteLrvId(null);
    } else {
      setConfirmDeleteLrvId(item.id);
    }
  };

  const handleBulkDelete = () => {
    if (!onDeleteLrvItems || selectedLrvIds.length === 0) return;
    const selectedItems = catalog.filter((i) => selectedLrvIds.includes(i.id));
    const blocked = selectedItems.filter((i) => (linkedJointsCountById.get(i.id) ?? 0) > 0);
    const deletableIds = selectedItems
      .filter((i) => (linkedJointsCountById.get(i.id) ?? 0) === 0 && i.status !== 'superseded')
      .map((i) => i.id);

    if (blocked.length > 0) {
      const codes = blocked.map((b) => b.lrvCode).slice(0, 5).join(', ');
      setBulkDeleteBlockMessage(
        `Позиции ${codes}${blocked.length > 5 ? ' и др.' : ''} привязаны к сварным стыкам и не могут быть удалены физически. Для них используйте аннулирование в строке таблицы.`
      );
    } else {
      setBulkDeleteBlockMessage(null);
    }

    if (deletableIds.length > 0) {
      onDeleteLrvItems(deletableIds);
      setSelectedLrvIds((prev) => prev.filter((id) => !deletableIds.includes(id)));
    }
  };

  const handleConfirmSupersede = (item: LRVItem, letter: string, date: string) => {
    onUpdateLrvItem?.({
      ...item,
      status: 'superseded',
      replacementLetter: letter.trim() || 'Письмо согласования',
      replacementDate: date || new Date().toISOString().slice(0, 10),
    });
    setSupersedeModalItem(null);
  };

  const handleToggleSelectAll = () => {
    const visibleIds = filteredItems.map((i) => i.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedLrvIds.includes(id));
    if (allSelected) {
      setSelectedLrvIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedLrvIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleToggleSelectRow = (id: string) => {
    setSelectedLrvIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-3">
      <LrvToolbar
        canEdit={canEditCatalog}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        statusCounts={statusCounts}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        rdFilter={rdFilter}
        onRdFilterChange={setRdFilter}
        allRds={allRds}
        visibleColumns={visibleColumns}
        onVisibleColumnsChange={setVisibleColumns}
        onApplyPreset={handleApplyPreset}
        selectedCount={selectedLrvIds.length}
        hasActiveFilters={hasActiveFilters}
        onResetAllFilters={handleResetAllFilters}
        onBulkDelete={handleBulkDelete}
        onOpenAddForm={() => {
          setEditingItem(null);
          setIsItemFormOpen(true);
        }}
        onDownloadTemplate={handleDownloadTemplate}
        onExportExcel={handleExportFilteredExcel}
        onExcelFileChange={handleExcelFileChange}
        fileInputRef={fileInputRef}
      />

      {excelUploadMessage && (
        <div
          className={`px-4 py-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
            excelUploadMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {excelUploadMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{excelUploadMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setExcelUploadMessage(null)}
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {bulkDeleteBlockMessage && (
        <div className="px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{bulkDeleteBlockMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setBulkDeleteBlockMessage(null)}
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <LrvTable
        items={filteredItems}
        baseItems={baseFilteredItems}
        allFilteredCount={filteredItems.length}
        totalCatalogCount={catalog.length}
        totalActsCount={statusCounts.totalActs}
        canEditCatalog={canEditCatalog}
        canManageIncomingControl={canManageIncomingControl}
        visibleColumns={visibleColumns}
        linkedJointsCountById={linkedJointsCountById}
        selectedLrvIds={selectedLrvIds}
        expandedMaterialIds={expandedMaterialIds}
        confirmDeleteLrvId={confirmDeleteLrvId}
        columnFilters={columnFilters}
        sortConfig={sortConfig}
        columnValueGetters={lrvColumnGetters}
        getColumnWidth={getColumnWidth}
        onResizeStart={handleResizeStart}
        onAutoFitCol={(colKey) => handleAutoFit(colKey, DEFAULT_COL_WIDTHS[colKey])}
        onApplyColumnFilter={handleApplyColumnFilter}
        onApplySort={(colKey, direction) => setSortConfig({ key: colKey, direction })}
        onToggleSelectAll={handleToggleSelectAll}
        onToggleSelectRow={handleToggleSelectRow}
        onToggleExpandRow={(id) =>
          setExpandedMaterialIds((prev) => ({ ...prev, [id]: !prev[id] }))
        }
        onStartEdit={(item) => {
          setEditingItem(item);
          setIsItemFormOpen(true);
        }}
        onOpenAddAct={(item) =>
          setActiveActModal({ material: item, editingBatch: null })
        }
        onOpenEditAct={(item, batch) =>
          setActiveActModal({ material: item, editingBatch: batch })
        }
        onDeleteAct={handleDeleteBatchAct}
        onOpenReplaceBatch={(item, batch) =>
          setActiveReplaceTarget({ material: item, batch })
        }
        onOpenJointsByLrvCode={onOpenJointsByLrvCode}
        onRequestDeleteOrSupersede={handleRequestDeleteOrSupersede}
        onConfirmDeleteSingle={(id) => {
          onDeleteLrvItems?.([id]);
          setConfirmDeleteLrvId(null);
          setSelectedLrvIds((prev) => prev.filter((x) => x !== id));
        }}
        onCancelConfirmDelete={() => setConfirmDeleteLrvId(null)}
        hasDeleteHandler={Boolean(onDeleteLrvItems)}
      />

      <LrvItemFormModal
        isOpen={isItemFormOpen}
        editingItem={editingItem}
        allRds={allRds}
        defaultRdCode={rdFilter}
        catalog={catalog}
        onSave={handleSaveItemForm}
        onCancel={() => {
          setIsItemFormOpen(false);
          setEditingItem(null);
        }}
      />

      {activeActModal && (
        <AddIncomingControlActModal
          isOpen={Boolean(activeActModal)}
          onClose={() => setActiveActModal(null)}
          material={{
            ...activeActModal.material,
            ...computeBalance(activeActModal.material),
            totalSpecQty:
              activeActModal.material.totalSpecQty ?? activeActModal.material.specQty,
          }}
          editingBatch={activeActModal.editingBatch}
          defaultInspectorName={defaultInspectorName}
          onSaveAct={handleSaveBatchAct}
        />
      )}

      {activeReplaceTarget && (
        <MaterialPartialReplaceModal
          isOpen={Boolean(activeReplaceTarget)}
          onClose={() => setActiveReplaceTarget(null)}
          originalMaterial={activeReplaceTarget.material}
          rejectedBatch={activeReplaceTarget.batch}
          defaultInspectorName={defaultInspectorName}
          onConfirmReplacement={handleConfirmPartialReplace}
        />
      )}

      <LrvSupersedeModal
        item={supersedeModalItem}
        onClose={() => setSupersedeModalItem(null)}
        onConfirm={handleConfirmSupersede}
        joints={joints}
      />
    </div>
  );
};
