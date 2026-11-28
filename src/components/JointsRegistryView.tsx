import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { zaychickApi } from '../api';
import { usePersistentState } from '../hooks/usePersistentState';
import { CheckCircle2, X } from 'lucide-react';
import {
  ColumnDefinition,
  ColumnTemplate,
  NdtLabRequest,
  ProjectLineItem,
  RecordStatus,
  TestCircuit,
  WelderProfile,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';
import {
  ALL_COLUMNS,
  buildDuplicateJointIdsSet,
  computeRegistryQuickFilterCounts,
  RegistryQuickFilter,
  RegistryQuickFilterCounts,
} from '../utils/weldingLogic';
import { exportFilteredRegistryToXlsx } from '../utils/excelUtils';
import {
  RegistryActiveFilterBar,
  RegistryFooter,
  RegistryLabRequestModal,
  RegistryQuickFilterBar,
  RegistryTable,
  RegistryToolbar,
  UserRolePermissions,
} from './registry';
import { useAuth, useAppContext } from '../context';

export interface JointsRegistryViewProps {
  joints?: WeldJoint[];
  filteredAndSortedJoints: WeldJoint[];
  lines?: ProjectLineItem[];
  welders?: WelderProfile[];
  labRequests?: NdtLabRequest[];
  testCircuits?: TestCircuit[];
  currentUserFullName?: string;
  onCreateLabRequest?: (newReq: NdtLabRequest) => Promise<boolean> | boolean | void;
  selectedJointIds: string[];
  onToggleSelectRow: (jointId: string) => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;

  // Быстрый поиск и быстрые фильтры
  globalSearch?: string;
  onGlobalSearchChange?: (val: string) => void;
  quickFilter?: RegistryQuickFilter;
  onQuickFilterChange?: (next: RegistryQuickFilter) => void;
  quickFilterCounts?: RegistryQuickFilterCounts;
  duplicateJointIds?: Set<string>;

  // Диапазон дат сварки
  weldingDateFrom: string;
  weldingDateTo: string;
  onWeldingDateFromChange: (val: string) => void;
  onWeldingDateToChange: (val: string) => void;
  onResetDateRange: () => void;

  // Действия и разграничение прав (Field-Level RBAC)
  userPermissions?: UserRolePermissions;
  confirmBulkDeleteJoints: boolean;
  onSetConfirmBulkDeleteJoints: (val: boolean) => void;
  onBulkDeleteSelectedJoints: () => void;
  onOpenBulkEdit: () => void;
  onOpenImportExcel: () => void;
  onOpenCreatePassport: () => void;
  onOpenEditPassport: (joint: WeldJoint) => void;
  onChangeJointStatus?: (
    joint: WeldJoint,
    targetStatus: RecordStatus,
    reason?: string
  ) => Promise<{ ok: boolean; message?: string }>;

  // Шаблоны и настройка столбцов
  activeTemplateId: string;
  templates: ColumnTemplate[];
  onApplyTemplate: (template: ColumnTemplate) => void;
  visibleColumns: WeldJointFieldKey[];
  activeColumnDefs: ColumnDefinition[];
  columnWidths: Record<string, number>;
  onOpenColumnsModal: () => void;

  // Excel-фильтры и сортировка
  onlyActiveRepairs?: boolean;
  onResetActiveRepairs?: () => void;
  columnFilters: Record<string, string[] | undefined>;
  activeFilterKeys: string[];
  onSetColumnFilter: (key: WeldJointFieldKey, values: string[] | undefined) => void;
  onResetAllFilters: () => void;
  sortConfig: { key: WeldJointFieldKey; direction: 'asc' | 'desc' } | null;
  onSetSortConfig: React.Dispatch<
    React.SetStateAction<{ key: WeldJointFieldKey; direction: 'asc' | 'desc' } | null>
  >;
  openFilterColumnKey: WeldJointFieldKey | null;
  onSetOpenFilterColumnKey: (key: WeldJointFieldKey | null) => void;
  getUniqueValuesForColumn: (
    key: WeldJointFieldKey
  ) => { value: string; count: number }[];
  onColumnResizeStart: (
    e: React.PointerEvent,
    colKey: WeldJointFieldKey,
    currentWidth: number
  ) => void;
  onColumnAutoFit: (colKey: WeldJointFieldKey) => void;
  onMoveColumnInline: (key: WeldJointFieldKey, dir: 'left' | 'right') => void;
  onHideColumnInline: (key: WeldJointFieldKey) => void;
}

const JointsRegistryViewComponent: React.FC<JointsRegistryViewProps> = (props) => {
  const auth = useAuth();
  const app = useAppContext();

  const joints = props.joints ?? app.joints;
  const filteredAndSortedJoints = props.filteredAndSortedJoints;
  const lines = props.lines ?? app.projectLineList ?? [];
  const welders = props.welders ?? app.welders ?? [];
  const labRequests = props.labRequests ?? app.labRequests ?? [];
  const testCircuits = props.testCircuits ?? app.testCircuits ?? [];
  const currentUserFullName =
    props.currentUserFullName ?? auth.currentUser?.fullName ?? 'Инженер ПТО';
  const userPermissions = props.userPermissions ?? auth.userPermissions;

  const {
    onCreateLabRequest,
    selectedJointIds,
    onToggleSelectRow,
    onToggleSelectAll,
    onClearSelection,
    globalSearch = '',
    onGlobalSearchChange,
    quickFilter = 'all',
    onQuickFilterChange,
    weldingDateFrom,
    weldingDateTo,
    onWeldingDateFromChange,
    onWeldingDateToChange,
    onResetDateRange,
    confirmBulkDeleteJoints,
    onSetConfirmBulkDeleteJoints,
    onBulkDeleteSelectedJoints,
    onOpenBulkEdit,
    onOpenImportExcel,
    onOpenCreatePassport,
    onOpenEditPassport,
    activeTemplateId,
    templates,
    onApplyTemplate,
    visibleColumns,
    activeColumnDefs,
    columnWidths,
    onOpenColumnsModal,
    onlyActiveRepairs,
    onResetActiveRepairs,
    columnFilters,
    activeFilterKeys,
    onSetColumnFilter,
    onResetAllFilters,
    sortConfig,
    onSetSortConfig,
    openFilterColumnKey,
    onSetOpenFilterColumnKey,
    getUniqueValuesForColumn,
    onColumnResizeStart,
    onColumnAutoFit,
    onMoveColumnInline,
    onHideColumnInline,
    onChangeJointStatus,
  } = props;

  // Заявки в ЛНК доступны только пользователям с правом редактирования (не в режиме просмотра)
  const REGISTRY_PAGE_SIZE = 200;
  const canUseServerPagination = Boolean(
    app.isDbConnected &&
      !props.joints &&
      activeFilterKeys.length === 0 &&
      quickFilter === 'all' &&
      !sortConfig
  );
  const [serverPage, setServerPage] = usePersistentState<number>('registry:page', 1);
  const [serverPageJoints, setServerPageJoints] = useState<WeldJoint[] | null>(null);
  const [serverTotal, setServerTotal] = useState<number>(0);
  const [isLoadingServerPage, setIsLoadingServerPage] = useState(false);

  useEffect(() => {
    setServerPage(1);
  }, [
    app.selectedObjectName,
    app.selectedRdCode,
    globalSearch,
    weldingDateFrom,
    weldingDateTo,
    onlyActiveRepairs,
    setServerPage,
  ]);

  useEffect(() => {
    if (!canUseServerPagination) {
      setServerPageJoints(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoadingServerPage(true);
      zaychickApi
        .listJointsPage({
          objectName: app.selectedObjectName,
          rdCode: app.selectedRdCode,
          search: globalSearch,
          dateFrom: weldingDateFrom || undefined,
          dateTo: weldingDateTo || undefined,
          onlyActiveRepairs,
          limit: REGISTRY_PAGE_SIZE,
          offset: (serverPage - 1) * REGISTRY_PAGE_SIZE,
        })
        .then((res) => {
          if (cancelled) return;
          setServerPageJoints(res.items);
          setServerTotal(res.total);
        })
        .catch(() => {
          if (!cancelled) setServerPageJoints(null);
        })
        .finally(() => {
          if (!cancelled) setIsLoadingServerPage(false);
        });
    }, globalSearch ? 200 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    canUseServerPagination,
    app.selectedObjectName,
    app.selectedRdCode,
    globalSearch,
    weldingDateFrom,
    weldingDateTo,
    onlyActiveRepairs,
    serverPage,
    joints.length,
  ]);

  const displayedJoints =
    canUseServerPagination && serverPageJoints !== null && serverTotal > REGISTRY_PAGE_SIZE
      ? serverPageJoints
      : filteredAndSortedJoints;

  const canSubmitLabRequest =
    Boolean(onCreateLabRequest) &&
    (userPermissions.canEditPrepAndWeldingFields ||
      userPermissions.canEditNdtFields);

  // Состояние модального окна подачи заявки на НК из Реестра стыков
  const [isLabReqModalOpen, setIsLabReqModalOpen] = useState(false);
  const [labReqCandidateIds, setLabReqCandidateIds] = useState<string[]>([]);
  const [labReqSuccessBanner, setLabReqSuccessBanner] = useState<string | null>(
    null
  );

  const openSubmitLabRequestModal = (targetJointIds?: string[]) => {
    if (!canSubmitLabRequest) return;
    const baseIds =
      targetJointIds && targetJointIds.length > 0
        ? targetJointIds
        : selectedJointIds.length > 0
        ? selectedJointIds
        : filteredAndSortedJoints.map((j) => j.id);

    setLabReqCandidateIds(baseIds);
    setIsLabReqModalOpen(true);
  };

  // Карта дубликатов номеров стыков на технологических линиях
  const duplicateJointIds = useMemo(() => {
    if (props.duplicateJointIds) return props.duplicateJointIds;
    return buildDuplicateJointIdsSet(joints);
  }, [props.duplicateJointIds, joints]);

  const quickFilterCounts = useMemo(() => {
    if (props.quickFilterCounts) return props.quickFilterCounts;
    return computeRegistryQuickFilterCounts(joints, {
      labRequests,
      welders,
      duplicateJointIds,
    });
  }, [props.quickFilterCounts, joints, labRequests, welders, duplicateJointIds]);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId);

  const handleExportExcel = useCallback(() => {
    exportFilteredRegistryToXlsx({
      joints: filteredAndSortedJoints,
      columns: activeColumnDefs,
      labRequests,
      testCircuits,
      templateName: activeTemplate?.name,
    });
  }, [
    filteredAndSortedJoints,
    activeColumnDefs,
    labRequests,
    testCircuits,
    activeTemplate?.name,
  ]);

  return (
    <div className="space-y-2.5">
      {labReqSuccessBanner && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3 text-xs font-semibold shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{labReqSuccessBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setLabReqSuccessBanner(null)}
            className="p-1 rounded hover:bg-emerald-100 text-emerald-800 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Верхняя полоса: Поиск, диапазон дат сварки, действия и выбор шаблона таблицы */}
      <RegistryToolbar
        globalSearch={globalSearch}
        onGlobalSearchChange={(v) => onGlobalSearchChange?.(v)}
        weldingDateFrom={weldingDateFrom}
        weldingDateTo={weldingDateTo}
        onWeldingDateFromChange={onWeldingDateFromChange}
        onWeldingDateToChange={onWeldingDateToChange}
        onResetDateRange={onResetDateRange}
        userPermissions={userPermissions}
        selectedJointIds={selectedJointIds}
        confirmBulkDeleteJoints={confirmBulkDeleteJoints}
        onSetConfirmBulkDeleteJoints={onSetConfirmBulkDeleteJoints}
        onBulkDeleteSelectedJoints={onBulkDeleteSelectedJoints}
        onOpenBulkEdit={onOpenBulkEdit}
        onOpenImportExcel={onOpenImportExcel}
        onExportExcel={handleExportExcel}
        onOpenCreatePassport={onOpenCreatePassport}
        onOpenSubmitLabRequestModal={() => openSubmitLabRequestModal()}
        canCreateLabRequest={canSubmitLabRequest}
        activeTemplateId={activeTemplateId}
        templates={templates}
        onApplyTemplate={onApplyTemplate}
        visibleColumnsCount={visibleColumns.length}
        totalColumnsCount={ALL_COLUMNS.length}
        onOpenColumnsModal={onOpenColumnsModal}
        hasActiveFilters={Boolean(
          globalSearch.trim() ||
            quickFilter !== 'all' ||
            weldingDateFrom ||
            weldingDateTo ||
            onlyActiveRepairs ||
            activeFilterKeys.length > 0
        )}
        onResetAllFilters={onResetAllFilters}
      />

      {/* Быстрые оперативные срезы реестра */}
      {onQuickFilterChange && (
        <RegistryQuickFilterBar
          quickFilter={quickFilter}
          onQuickFilterChange={onQuickFilterChange}
          counts={quickFilterCounts}
        />
      )}

      {/* Полоса активных фильтров (поиск + быстрые фильтры + даты сварки + Excel-фильтры) */}
      <RegistryActiveFilterBar
        globalSearch={globalSearch}
        onResetGlobalSearch={() => onGlobalSearchChange?.('')}
        quickFilter={quickFilter}
        onResetQuickFilter={() => onQuickFilterChange?.('all')}
        weldingDateFrom={weldingDateFrom}
        weldingDateTo={weldingDateTo}
        onResetDateRange={onResetDateRange}
        onlyActiveRepairs={onlyActiveRepairs}
        onResetActiveRepairs={onResetActiveRepairs}
        activeFilterKeys={activeFilterKeys}
        columnFilters={columnFilters}
        onSetColumnFilter={onSetColumnFilter}
        selectedJointIdsCount={selectedJointIds.length}
        onClearSelection={onClearSelection}
        onResetAllFilters={onResetAllFilters}
      />

      {/* Основная виртуализированная таблица сварных стыков */}
      <RegistryTable
        joints={joints}
        filteredAndSortedJoints={displayedJoints}
        selectedJointIds={selectedJointIds}
        onToggleSelectRow={onToggleSelectRow}
        onToggleSelectAll={onToggleSelectAll}
        activeColumnDefs={activeColumnDefs}
        columnWidths={columnWidths}
        columnFilters={columnFilters}
        sortConfig={sortConfig}
        onSetSortConfig={onSetSortConfig}
        openFilterColumnKey={openFilterColumnKey}
        onSetOpenFilterColumnKey={onSetOpenFilterColumnKey}
        getUniqueValuesForColumn={getUniqueValuesForColumn}
        onSetColumnFilter={onSetColumnFilter}
        onMoveColumnInline={onMoveColumnInline}
        onHideColumnInline={onHideColumnInline}
        onColumnResizeStart={onColumnResizeStart}
        onColumnAutoFit={onColumnAutoFit}
        onResetAllFilters={onResetAllFilters}
        onOpenEditPassport={onOpenEditPassport}
        onOpenSubmitLabRequestForJoint={(jId) => openSubmitLabRequestModal([jId])}
        labRequests={labRequests}
        testCircuits={testCircuits}
        welders={welders}
        duplicateJointIds={duplicateJointIds}
        canCreateLabRequest={canSubmitLabRequest}
        onChangeJointStatus={onChangeJointStatus}
      />

      {/* Подвал таблицы со статистикой и подсказками */}
      <RegistryFooter
        filteredCount={displayedJoints.length}
        totalCount={quickFilterCounts.all}
        activeTemplateName={activeTemplate?.name}
        selectedCount={selectedJointIds.length}
        serverPagination={
          canUseServerPagination && serverTotal > REGISTRY_PAGE_SIZE
            ? {
                page: serverPage,
                totalPages: Math.max(1, Math.ceil(serverTotal / REGISTRY_PAGE_SIZE)),
                totalItems: serverTotal,
                isLoading: isLoadingServerPage,
                onPrev: () => setServerPage((p) => Math.max(1, p - 1)),
                onNext: () => setServerPage((p) => p + 1),
              }
            : undefined
        }
      />

      {/* Модальное окно подачи заявки в Лабораторию НК */}
      {canSubmitLabRequest && onCreateLabRequest && (
        <RegistryLabRequestModal
          isOpen={isLabReqModalOpen}
          onClose={() => setIsLabReqModalOpen(false)}
          candidateJointIds={labReqCandidateIds}
          joints={joints}
          lines={lines}
          welders={welders}
          labRequests={labRequests}
          currentUserFullName={currentUserFullName}
          onCreateLabRequest={onCreateLabRequest}
          onSuccess={(msg) => setLabReqSuccessBanner(msg)}
        />
      )}
    </div>
  );
};

export const JointsRegistryView = memo(JointsRegistryViewComponent);
