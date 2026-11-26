import React, { useMemo, useState } from 'react';
import {
  CircuitAssignmentResult,
  FacilityObject,
  ProjectLineItem,
  RecordStatus,
  WeldJoint,
} from '../types/welding';
import { canManageTestCircuits } from '../utils/rbac';
import type { CircuitActionOutcome } from '../hooks/useTestCircuitActions';
import {
  buildUniqueLineId,
  LINELIST_COLUMNS,
  normalizeExecutiveDocStatus,
} from '../utils/weldingLogic';
import type {
  LineBatchImportSummary,
  LineImportDuplicateMode,
} from '../utils/linelistImportValidation';
import { exportProjectLineListToExcel } from '../utils/excelUtils';
import { useResizableColumns } from '../utils/useResizableColumns';
import {
  LineListActiveFilterBar,
  LineListAssignCircuitModal,
  LineListBulkEditModal,
  LineListEditModal,
  LineListImportPanel,
  LineListKpiStrip,
  LineListStructureManager,
  LineListTable,
  LineListToolbar,
  RowModalState,
  useLineListImport,
  useLineListState,
} from './linelist';
import { useAuth, useAppContext } from '../context';

export interface ProjectLineListViewProps {
  lineList?: ProjectLineItem[];
  joints?: WeldJoint[];
  facilities?: FacilityObject[];
  selectedObjectName?: string;
  selectedRdCode?: string;
  onSelectObjectName?: (name: string) => void;
  onSelectRdCode?: (code: string) => void;
  onAddLineItems: (
    items: ProjectLineItem[],
    duplicateMode?: LineImportDuplicateMode
  ) => Promise<LineBatchImportSummary | void> | void;
  onUpdateLineItem: (
    updated: ProjectLineItem,
    previousItem?: ProjectLineItem,
    cascadeRename?: boolean
  ) => void;
  onBulkUpdateLineItems: (selectedIds: string[], patch: Partial<ProjectLineItem>) => void;
  onDeleteLineItems: (lineIds: string[]) => void;
  onDeleteObject: (objectName: string) => void;
  onDeleteRdCode: (rdCode: string) => void;
  onOpenLineInRegistry?: (uniqueLineId: string) => void;
  onOpenFacilityLocation?: (objectName: string) => void;
  onChangeLineStatus?: (
    line: ProjectLineItem,
    targetStatus: RecordStatus,
    reason?: string
  ) => Promise<{ ok: boolean; message?: string }>;
  onAssignLinesToCircuit?: (
    circuitId: string,
    lineIds: string[],
    overwriteExisting?: boolean
  ) => Promise<CircuitActionOutcome<CircuitAssignmentResult>>;
  onOpenTestingCircuits?: () => void;
  canEdit?: boolean;
  currentUserRoleLabel?: string;
}

export const ProjectLineListView: React.FC<ProjectLineListViewProps> = (props) => {
  const auth = useAuth();
  const app = useAppContext();

  const lineList = props.lineList ?? app.projectLineList;
  const joints = props.joints ?? app.joints;
  const facilities = props.facilities ?? app.derivedFacilities;
  const selectedObjectName = props.selectedObjectName ?? app.selectedObjectName;
  const selectedRdCode = props.selectedRdCode ?? app.selectedRdCode;
  const onSelectRdCode = props.onSelectRdCode ?? app.setSelectedRdCode;
  const canEdit = props.canEdit ?? auth.userPermissions.canEditLineList;
  const currentUserRoleLabel = props.currentUserRoleLabel ?? auth.userPermissions.categoryLabel;

  const {
    onAddLineItems,
    onUpdateLineItem,
    onBulkUpdateLineItems,
    onDeleteLineItems,
    onDeleteObject,
    onDeleteRdCode,
    onOpenLineInRegistry,
    onOpenFacilityLocation,
    onChangeLineStatus,
    onAssignLinesToCircuit,
    onOpenTestingCircuits,
  } = props;

  const canManageCircuits = canManageTestCircuits(auth.currentUser);
  const testCircuits = app.testCircuits;

  const [showStructureManager, setShowStructureManager] = useState(false);
  const [confirmDeleteLineId, setConfirmDeleteLineId] = useState<string | null>(null);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isAssignCircuitModalOpen, setIsAssignCircuitModalOpen] = useState(false);

  // Состояние таблицы, O(N+M) индексации стыков, фильтрации, сортировки и KPI
  const state = useLineListState({
    lineList,
    joints,
    facilities,
    testCircuits,
    userAccounts: auth.userAccounts,
    selectedObjectName,
    selectedRdCode,
  });

  const defaultObj =
    selectedObjectName === 'ALL'
      ? facilities[0]?.name || ''
      : selectedObjectName;
  const defaultFacility =
    facilities.find((f) => f.name === defaultObj) || facilities[0];
  const defaultRd =
    selectedRdCode === 'ALL'
      ? defaultFacility?.rdCodes[0]?.code || ''
      : selectedRdCode;

  // Импорт из Excel и буфера обмена
  const importFlow = useLineListImport({
    defaultObj,
    defaultRd,
    onAddLineItems,
  });

  // Модальное окно создания или редактирования одной строки лайнлиста
  const [rowModal, setRowModal] = useState<RowModalState>({
    isOpen: false,
    mode: 'create',
    item: null,
  });

  const [editForm, setEditForm] = useState<ProjectLineItem>({
    id: '',
    objectName: defaultObj,
    rdCode: defaultRd,
    lineNumber: '',
    uniqueLineId: '',
    lineName: '',
    product: '',
    testContour: '',
    weldingNtd: '',
    controlNtd: '',
    qualityLevel: '',
    pipelineCategory: '',
    workingPressure: '',
    workingTemperature: '',
    rkPercent: 0,
    uzkPercent: 0,
    pvkPercent: 0,
    manualStatus: '',
    testDate: '',
    idStatus: 'IN_WORK',
    responsiblePto: '',
  });

  const [isCustomObject, setIsCustomObject] = useState(false);
  const [isCustomRd, setIsCustomRd] = useState(false);
  const [cascadeRename, setCascadeRename] = useState(true);
  const [lineFormError, setLineFormError] = useState('');

  // Настраиваемая курсором ширина столбцов лайнлиста с сохранением в localStorage
  const {
    getColumnWidth,
    handleResizeStart,
    handleAutoFit,
    handleResetWidths,
    hasCustomWidths,
  } = useResizableColumns({
    storageKey: 'zaychick_col_widths_linelist',
    defaultWidths: Object.fromEntries(
      LINELIST_COLUMNS.map((col) => [col.key, col.minWidth])
    ),
  });

  // Список доступных шифров РД для выбранного в форме объекта
  const rdsForCurrentObject = useMemo(() => {
    const curObj = editForm.objectName.trim();
    const fac = facilities.find((f) => f.name.trim() === curObj);
    const fromFac = fac ? fac.rdCodes.map((r) => r.code.trim()).filter(Boolean) : [];
    const fromLines = lineList
      .filter((l) => l.objectName.trim() === curObj)
      .map((l) => l.rdCode.trim())
      .filter(Boolean);
    return Array.from(new Set([...fromFac, ...fromLines]));
  }, [facilities, lineList, editForm.objectName]);

  const handleSelectExistingObject = (newObj: string) => {
    const fac = facilities.find((f) => f.name === newObj);
    const rds = fac
      ? fac.rdCodes.map((r) => r.code)
      : lineList.filter((l) => l.objectName === newObj).map((l) => l.rdCode);
    const firstRd = rds[0] || '';
    const firstContour = fac?.rdCodes[0]?.contours[0] || '';
    setEditForm((prev) => ({
      ...prev,
      objectName: newObj,
      rdCode: firstRd,
      uniqueLineId: buildUniqueLineId(firstRd, prev.lineNumber),
      testContour: firstContour,
    }));
    setIsCustomRd(false);
  };

  const handleSelectExistingRd = (newRd: string) => {
    const fac = facilities.find((f) => f.name === editForm.objectName);
    const rdMeta = fac?.rdCodes.find((r) => r.code === newRd);
    const firstContour = rdMeta?.contours[0] || editForm.testContour;
    setEditForm((prev) => ({
      ...prev,
      rdCode: newRd,
      uniqueLineId: buildUniqueLineId(newRd, prev.lineNumber),
      testContour: firstContour,
    }));
  };

  const openCreateLineModal = () => {
    const initObj = defaultObj || state.availableObjectOptions[0] || '';
    const fac = facilities.find((f) => f.name === initObj);
    const rds = fac
      ? fac.rdCodes.map((r) => r.code)
      : lineList.filter((l) => l.objectName === initObj).map((l) => l.rdCode);
    const initRd = defaultRd && defaultRd !== 'ALL' ? defaultRd : rds[0] || '';

    setIsCustomObject(!initObj);
    setIsCustomRd(!initRd);
    setLineFormError('');

    setEditForm({
      id: `ll-man-${Date.now()}`,
      objectName: initObj,
      rdCode: initRd,
      lineNumber: '',
      uniqueLineId: '',
      lineName: '',
      product: '',
      testContour: '',
      weldingNtd: '',
      controlNtd: '',
      qualityLevel: '',
      pipelineCategory: '',
      workingPressure: '',
      workingTemperature: '',
      rkPercent: 0,
      uzkPercent: 0,
      pvkPercent: 0,
      manualStatus: '',
      testDate: '',
      idStatus: 'IN_WORK',
      responsiblePto: '',
    });
    setRowModal({ isOpen: true, mode: 'create', item: null });
  };

  const openEditLineModal = (item: ProjectLineItem) => {
    setLineFormError('');
    setEditForm({
      ...item,
      idStatus: normalizeExecutiveDocStatus(item.idStatus),
      responsiblePto: item.responsiblePto || '',
    });
    setCascadeRename(true);
    setIsCustomObject(!state.availableObjectOptions.includes(item.objectName));
    const knownRds =
      facilities
        .find((f) => f.name === item.objectName)
        ?.rdCodes.map((r) => r.code) || [];
    setIsCustomRd(!knownRds.includes(item.rdCode));
    setRowModal({ isOpen: true, mode: 'edit', item });
  };

  const handleSaveSingleRow = (e: React.FormEvent) => {
    e.preventDefault();
    setLineFormError('');
    const cleanObj = editForm.objectName.trim() || defaultObj;
    if (!cleanObj) {
      setLineFormError('Укажите название объекта строительства.');
      return;
    }

    const cleanRd = editForm.rdCode.trim() || defaultRd;
    if (!cleanRd) {
      setLineFormError('Укажите шифр рабочей документации.');
      return;
    }

    const cleanLine = editForm.lineNumber.trim();
    if (!cleanLine) {
      setLineFormError('Укажите номер линии.');
      return;
    }

    const candidateUniqueId = buildUniqueLineId(cleanRd, cleanLine);

    const duplicateLine = lineList.find(
      (l) =>
        l.id !== editForm.id &&
        l.uniqueLineId.trim().toLowerCase() === candidateUniqueId.toLowerCase()
    );
    if (duplicateLine) {
      setLineFormError(
        `Линия «${cleanLine}» в шифре РД «${cleanRd}» уже существует в лайнлисте (${duplicateLine.lineName}). Дублирование запрещено.`
      );
      return;
    }

    const clampPct = (val: number) =>
      Math.max(0, Math.min(100, Number.isFinite(val) ? val : 0));

    const finalItem: ProjectLineItem = {
      ...editForm,
      objectName: cleanObj,
      rdCode: cleanRd,
      lineNumber: cleanLine,
      uniqueLineId: candidateUniqueId,
      lineName: editForm.lineName.trim(),
      product: editForm.product.trim(),
      testContour: editForm.testContour.trim(),
      weldingNtd: editForm.weldingNtd.trim(),
      controlNtd: editForm.controlNtd.trim(),
      qualityLevel: editForm.qualityLevel.trim(),
      pipelineCategory: editForm.pipelineCategory.trim(),
      workingPressure: editForm.workingPressure.trim(),
      workingTemperature: editForm.workingTemperature.trim(),
      rkPercent: clampPct(Number(editForm.rkPercent)),
      uzkPercent: clampPct(Number(editForm.uzkPercent)),
      pvkPercent: clampPct(Number(editForm.pvkPercent)),
      idStatus: normalizeExecutiveDocStatus(editForm.idStatus),
      responsiblePto: (editForm.responsiblePto || '').trim() || undefined,
    };

    if (rowModal.mode === 'create') {
      onAddLineItems([finalItem]);
    } else {
      onUpdateLineItem(finalItem, rowModal.item || undefined, cascadeRename);
    }

    setRowModal({ isOpen: false, mode: 'create', item: null });
  };

  const handleDeleteFromEditModal = () => {
    if (!rowModal.item) return;
    onDeleteLineItems([rowModal.item.id]);
    setRowModal({ isOpen: false, mode: 'create', item: null });
    state.setSelectedLineIds((prev) => prev.filter((id) => id !== rowModal.item?.id));
  };

  const handleApplyBulk = (patch: Partial<ProjectLineItem>) => {
    onBulkUpdateLineItems(state.selectedLineIds, patch);
    state.setSelectedLineIds([]);
    setIsBulkModalOpen(false);
  };

  const handleExportExcel = () => {
    exportProjectLineListToExcel(
      state.filteredAndSortedList.map((r) => r.item),
      joints,
      false,
      selectedRdCode !== 'ALL' ? selectedRdCode : undefined
    );
  };

  return (
    <div className="space-y-3">
      {/* Панель инструментов: поиск, столбцы, создание, удаление, импорт и экспорт */}
      <LineListToolbar
        canEdit={canEdit}
        currentUserRoleLabel={currentUserRoleLabel}
        showStructureManager={showStructureManager}
        onToggleStructureManager={() => setShowStructureManager((prev) => !prev)}
        selectedLineIds={state.selectedLineIds}
        selectedDeletableLineIds={state.selectedDeletableLineIds}
        selectedBlockedByJointsCount={state.selectedBlockedByJointsCount}
        onClearSelection={() => state.setSelectedLineIds([])}
        confirmBulkDelete={state.confirmBulkDelete}
        setConfirmBulkDelete={state.setConfirmBulkDelete}
        onDeleteLineItems={onDeleteLineItems}
        onOpenBulkModal={() => {
          if (state.selectedLineIds.length > 0) setIsBulkModalOpen(true);
        }}
        onToggleImportPanel={importFlow.toggleImportPanel}
        onExportExcel={handleExportExcel}
        onOpenCreateLineModal={openCreateLineModal}
        fileInputRef={importFlow.fileInputRef}
        onFileChange={importFlow.handleFileChange}
        uniqueObjectNames={state.uniqueObjectNames}
        uniqueRdCodes={state.uniqueRdCodes}
        uniqueContours={state.uniqueContours}
        ptoEngineerOptions={state.ptoEngineerOptions}
        selectedRdCode={selectedRdCode}
        availableRdCodes={state.availableFilterRdCodes}
        onSelectRdCode={onSelectRdCode}
        searchQuery={state.searchQuery}
        onChangeSearchQuery={state.setSearchQuery}
        visibleColumns={state.visibleColumns}
        onToggleColumnVisibility={state.handleToggleColumnVisibility}
        onShowAllColumns={state.handleShowAllColumns}
        canManageCircuits={canManageCircuits && Boolean(onAssignLinesToCircuit)}
        onOpenAssignCircuitModal={() => setIsAssignCircuitModalOpen(true)}
      />

      {/* Компактная сводка KPI по текущей выборке линий */}
      <LineListKpiStrip summary={state.kpiSummary} />

      {/* Панель управления структурой */}
      <LineListStructureManager
        isOpen={showStructureManager}
        onClose={() => setShowStructureManager(false)}
        uniqueObjectNames={state.uniqueObjectNames}
        uniqueRdCodes={state.uniqueRdCodes}
        lineList={lineList}
        joints={joints}
        onDeleteObject={onDeleteObject}
        onDeleteRdCode={onDeleteRdCode}
      />

      {/* Панель активных фильтров, поиска и выделения строк */}
      <LineListActiveFilterBar
        selectedLineIdsCount={state.selectedLineIds.length}
        searchQuery={state.searchQuery}
        onClearSearchQuery={() => state.setSearchQuery('')}
        activeFilterKeys={state.activeFilterKeys}
        columnFilters={state.columnFilters}
        columnLabelMap={state.columnLabelMap}
        onRemoveColumnFilter={(k) =>
          state.setColumnFilters((prev) => {
            const next = { ...prev };
            delete next[k];
            return next;
          })
        }
        onClearSelection={() => state.setSelectedLineIds([])}
        onResetAllFilters={() => {
          state.setColumnFilters({});
          state.setSearchQuery('');
          state.setSelectedLineIds([]);
        }}
      />

      {/* Панель импорта из Excel */}
      {importFlow.showImportPanel && (
        <LineListImportPanel
          existingLineList={lineList}
          joints={joints}
          fileInputRef={importFlow.fileInputRef}
          uploadedFileName={importFlow.uploadedFileName}
          importError={importFlow.importError}
          pasteText={importFlow.pasteText}
          previewItems={importFlow.previewItems}
          duplicateMode={importFlow.importDuplicateMode}
          isImporting={importFlow.isImporting}
          importResult={importFlow.importResult}
          onChangeDuplicateMode={importFlow.setImportDuplicateMode}
          onChangePasteText={importFlow.setPasteText}
          onParsePasteText={importFlow.handleParsePasteText}
          onConfirmImport={(items, mode) =>
            void importFlow.handleConfirmImport(items, mode)
          }
          onClose={importFlow.closeImportPanel}
        />
      )}

      {/* Инженерная таблица лайнлиста с виртуализацией строк */}
      <LineListTable
        filteredAndSortedList={state.filteredAndSortedList}
        visibleColumns={state.visibleColumns}
        selectedLineIds={state.selectedLineIds}
        onToggleSelectAll={state.toggleSelectAllVisible}
        onToggleSelectRow={state.toggleSelectRow}
        canEdit={canEdit}
        canSelectForCircuit={canManageCircuits && Boolean(onAssignLinesToCircuit)}
        lineCircuitsMap={state.lineCircuitsMap}
        onOpenTestingCircuits={onOpenTestingCircuits}
        columnFilters={state.columnFilters}
        setColumnFilters={state.setColumnFilters}
        openFilterColumnKey={state.openFilterColumnKey}
        setOpenFilterColumnKey={state.setOpenFilterColumnKey}
        sortConfig={state.sortConfig}
        setSortConfig={state.setSortConfig}
        getColumnWidth={getColumnWidth}
        handleResizeStart={handleResizeStart}
        handleAutoFit={handleAutoFit}
        getUniqueValuesForColumn={state.getUniqueValuesForColumn}
        onOpenFacilityLocation={onOpenFacilityLocation}
        onOpenLineInRegistry={onOpenLineInRegistry}
        onOpenEditLineModal={openEditLineModal}
        onDeleteLineItems={onDeleteLineItems}
        confirmDeleteLineId={confirmDeleteLineId}
        setConfirmDeleteLineId={setConfirmDeleteLineId}
        totalLinesCount={state.scopedList.length}
        hasCustomWidths={hasCustomWidths}
        onResetWidths={handleResetWidths}
        currentUser={auth.currentUser}
        onChangeLineStatus={onChangeLineStatus}
      />

      {/* Модальное окно создания и редактирования строки лайнлиста */}
      <LineListEditModal
        testCircuits={testCircuits}
        isOpen={rowModal.isOpen}
        mode={rowModal.mode}
        rowItem={rowModal.item}
        editForm={editForm}
        setEditForm={setEditForm}
        selectedObjectName={selectedObjectName}
        availableObjectOptions={state.availableObjectOptions}
        isCustomObject={isCustomObject}
        setIsCustomObject={setIsCustomObject}
        isCustomRd={isCustomRd}
        setIsCustomRd={setIsCustomRd}
        rdsForCurrentObject={rdsForCurrentObject}
        onSelectExistingObject={handleSelectExistingObject}
        onSelectExistingRd={handleSelectExistingRd}
        cascadeRename={cascadeRename}
        setCascadeRename={setCascadeRename}
        lineFormError={lineFormError}
        onSave={handleSaveSingleRow}
        onDelete={handleDeleteFromEditModal}
        onClose={() => setRowModal({ isOpen: false, mode: 'create', item: null })}
      />

      {/* Модальное окно группового редактирования выбранных линий */}
      <LineListBulkEditModal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        selectedLineIds={state.selectedLineIds}
        lineList={lineList}
        testCircuits={testCircuits}
        onApplyBulk={handleApplyBulk}
      />

      {/* Модальное окно назначения выбранных линий в испытательный контур */}
      <LineListAssignCircuitModal
        isOpen={isAssignCircuitModalOpen}
        onClose={() => setIsAssignCircuitModalOpen(false)}
        selectedLineIds={state.selectedLineIds}
        lineList={lineList}
        testCircuits={testCircuits}
        onAssignLinesToCircuit={onAssignLinesToCircuit}
        onAssignedSuccess={() => state.setSelectedLineIds([])}
        onOpenTestingCircuits={onOpenTestingCircuits}
      />
    </div>
  );
};
