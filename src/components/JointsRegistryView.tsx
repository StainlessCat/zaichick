import React, { memo, useMemo, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import {
  ColumnDefinition,
  ColumnTemplate,
  NdtLabRequest,
  ProjectLineItem,
  WelderProfile,
  WeldJoint,
  WeldJointFieldKey,
} from '../types/welding';
import { ALL_COLUMNS } from '../utils/weldingLogic';
import { getUserRolePermissions } from '../utils/rbac';
import {
  RegistryActiveFilterBar,
  RegistryFooter,
  RegistryLabRequestModal,
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
  currentUserFullName?: string;
  onCreateLabRequest?: (newReq: NdtLabRequest) => Promise<boolean> | boolean | void;
  selectedJointIds: string[];
  onToggleSelectRow: (jointId: string) => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;

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
  onQuickAddSupplementaryJoint: () => void;
  onOpenImportExcel: () => void;
  onOpenCreatePassport: () => void;
  onOpenEditPassport: (joint: WeldJoint) => void;

  // Шаблоны и настройка столбцов
  activeTemplateId: string;
  templates: ColumnTemplate[];
  onApplyTemplate: (template: ColumnTemplate) => void;
  visibleColumns: WeldJointFieldKey[];
  activeColumnDefs: ColumnDefinition[];
  columnWidths: Record<string, number>;
  onOpenColumnsModal: () => void;

  // Excel-фильтры и сортировка
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
  const currentUserFullName = props.currentUserFullName ?? auth.currentUser?.fullName ?? 'Инженер ПТО';
  const userPermissions = props.userPermissions ?? auth.userPermissions;

  const {
    onCreateLabRequest,
    selectedJointIds,
    onToggleSelectRow,
    onToggleSelectAll,
    onClearSelection,
    weldingDateFrom,
    weldingDateTo,
    onWeldingDateFromChange,
    onWeldingDateToChange,
    onResetDateRange,
    confirmBulkDeleteJoints,
    onSetConfirmBulkDeleteJoints,
    onBulkDeleteSelectedJoints,
    onOpenBulkEdit,
    onQuickAddSupplementaryJoint,
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
  } = props;
  // Состояние модального окна подачи заявки на НК из Реестра стыков
  const [isLabReqModalOpen, setIsLabReqModalOpen] = useState(false);
  const [labReqCandidateIds, setLabReqCandidateIds] = useState<string[]>([]);
  const [labReqSuccessBanner, setLabReqSuccessBanner] = useState<string | null>(
    null
  );

  const openSubmitLabRequestModal = (targetJointIds?: string[]) => {
    const baseIds =
      targetJointIds && targetJointIds.length > 0
        ? targetJointIds
        : selectedJointIds.length > 0
        ? selectedJointIds
        : filteredAndSortedJoints.map((j) => j.id);

    setLabReqCandidateIds(baseIds);
    setIsLabReqModalOpen(true);
  };

  // Карта дубликатов номеров стыков на технологических линиях (п. 6 аудита)
  const duplicateJointIds = useMemo(() => {
    const keyMap = new Map<string, string[]>();
    for (const j of joints) {
      const lineKey = (
        j.uniqueLineId ||
        `${j.rdCode || ''}__${j.lineNumber || ''}`
      ).trim().toLowerCase();
      const numNorm = (j.jointNumber || '').trim().toLowerCase();
      const composite = `${lineKey}:::${numNorm}`;
      const list = keyMap.get(composite) || [];
      list.push(j.id);
      keyMap.set(composite, list);
    }
    const dupIds = new Set<string>();
    for (const ids of keyMap.values()) {
      if (ids.length > 1) {
        for (const id of ids) dupIds.add(id);
      }
    }
    return dupIds;
  }, [joints]);

  const activeTemplate = templates.find((t) => t.id === activeTemplateId);

  return (
    <div className="space-y-3">
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

      {/* Верхняя полоса: Диапазон дат сварки, действия и выбор шаблона таблицы */}
      <RegistryToolbar
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
        onQuickAddSupplementaryJoint={onQuickAddSupplementaryJoint}
        onOpenImportExcel={onOpenImportExcel}
        onOpenCreatePassport={onOpenCreatePassport}
        onOpenSubmitLabRequestModal={() => openSubmitLabRequestModal()}
        canCreateLabRequest={Boolean(onCreateLabRequest)}
        activeTemplateId={activeTemplateId}
        templates={templates}
        onApplyTemplate={onApplyTemplate}
        visibleColumnsCount={visibleColumns.length}
        totalColumnsCount={ALL_COLUMNS.length}
        onOpenColumnsModal={onOpenColumnsModal}
      />

      {/* Полоса активных фильтров (даты сварки + Excel-фильтры) */}
      <RegistryActiveFilterBar
        weldingDateFrom={weldingDateFrom}
        weldingDateTo={weldingDateTo}
        onResetDateRange={onResetDateRange}
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
        filteredAndSortedJoints={filteredAndSortedJoints}
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
        welders={welders}
        duplicateJointIds={duplicateJointIds}
        canCreateLabRequest={Boolean(onCreateLabRequest)}
      />

      {/* Подвал таблицы со статистикой и подсказками */}
      <RegistryFooter
        filteredCount={filteredAndSortedJoints.length}
        totalCount={joints.length}
        activeTemplateName={activeTemplate?.name}
        selectedCount={selectedJointIds.length}
      />

      {/* Модальное окно подачи заявки в Лабораторию НК */}
      {onCreateLabRequest && (
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
