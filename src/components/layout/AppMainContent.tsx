import React from 'react';
import { HardDriveDownload } from 'lucide-react';
import {
  AppSection,
  AuditLogEntry,
  ColumnDefinition,
  ColumnTemplate,
  FacilityObject,
  InspectorProfile,
  LRVItem,
  NdtLabRequest,
  ProjectLineItem,
  ReadinessGroupCondition,
  RecordStatus,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
  WeldJointFieldKey,
} from '../../types/welding';
import { RolePermissions } from '../../utils/rbac';
import { JointsRegistryView } from '../JointsRegistryView';
import { LaboratoryView } from '../LaboratoryView';
import { ProjectLineListView } from '../ProjectLineListView';
import { WeldingTechView } from '../WeldingTechView';
import { WeldingJournalsView } from '../WeldingJournalsView';
import { ReadinessReportView } from '../ReadinessReportView';
import { LrvCatalogView } from '../LrvCatalogView';
import { AuditHistoryView } from '../AuditHistoryView';
import { UserGuideBookletView } from '../UserGuideBookletView';
import { TestCircuitsView } from '../TestCircuitsView';
import type { useTestCircuitActions } from '../../hooks/useTestCircuitActions';
import { useAuth, useAppContext } from '../../context';

export interface AppMainContentProps {
  activeSection?: AppSection;
  setActiveSection?: (sec: AppSection) => void;
  selectedObjectName?: string;
  setSelectedObjectName?: (name: string) => void;
  selectedRdCode?: string;
  setSelectedRdCode?: (code: string) => void;
  joints?: WeldJoint[];
  scopedJoints: WeldJoint[];
  filteredAndSortedJoints: WeldJoint[];
  projectLineList?: ProjectLineItem[];
  lrvCatalog?: LRVItem[];
  welders?: WelderProfile[];
  techCards?: TechCardItem[];
  weldingMaterials?: WeldingMaterialCertificate[];
  derivedFacilities?: FacilityObject[];
  auditLogs?: AuditLogEntry[];
  labRequests?: NdtLabRequest[];
  currentUser?: UserAccount;
  userPermissions?: RolePermissions;
  dynamicInspectors: InspectorProfile[];
  isDbConnected?: boolean;
  pendingSyncCount?: number;
  isLoadingDemoDataset: boolean;
  onLoadKharasaveyDemo: () => Promise<void>;
  // Реестр стыков
  selectedJointIds: string[];
  onToggleSelectRow: (id: string) => void;
  onToggleSelectAll: () => void;
  onClearSelection: () => void;
  weldingDateFrom: string;
  weldingDateTo: string;
  onWeldingDateFromChange: (v: string) => void;
  onWeldingDateToChange: (v: string) => void;
  onResetDateRange: () => void;
  confirmBulkDeleteJoints: boolean;
  onSetConfirmBulkDeleteJoints: (val: boolean) => void;
  onBulkDeleteSelectedJoints: () => Promise<void>;
  onOpenBulkEdit: () => void;
  onQuickAddSupplementaryJoint: () => void;
  onOpenImportExcel: () => void;
  onOpenCreatePassport: () => void;
  onOpenEditPassport: (j: WeldJoint) => void;
  activeTemplateId: string;
  templates: ColumnTemplate[];
  onApplyTemplate: (tpl: ColumnTemplate) => void;
  visibleColumns: WeldJointFieldKey[];
  activeColumnDefs: ColumnDefinition[];
  columnWidths: Record<string, number>;
  onOpenColumnsModal: () => void;
  columnFilters: Partial<Record<WeldJointFieldKey, string[]>>;
  activeFilterKeys: WeldJointFieldKey[];
  onSetColumnFilter: (key: WeldJointFieldKey, values: string[] | undefined) => void;
  onResetAllFilters: () => void;
  sortConfig: { key: WeldJointFieldKey; direction: 'asc' | 'desc' } | null;
  onSetSortConfig: React.Dispatch<
    React.SetStateAction<{ key: WeldJointFieldKey; direction: 'asc' | 'desc' } | null>
  >;
  openFilterColumnKey: WeldJointFieldKey | null;
  onSetOpenFilterColumnKey: (k: WeldJointFieldKey | null) => void;
  getUniqueValuesForColumn: (colKey: WeldJointFieldKey) => { value: string; count: number }[];
  onColumnResizeStart: (
    e: React.PointerEvent,
    colKey: WeldJointFieldKey,
    currentWidth: number
  ) => void;
  onColumnAutoFit: (colKey: WeldJointFieldKey) => void;
  onMoveColumnInline: (key: WeldJointFieldKey, dir: 'left' | 'right') => void;
  onHideColumnInline: (key: WeldJointFieldKey) => void;
  setColumnFilters: React.Dispatch<
    React.SetStateAction<Partial<Record<WeldJointFieldKey, string[]>>>
  >;
  // Лаборатория НК
  onCreateLabRequest: (req: NdtLabRequest) => Promise<boolean> | void;
  onAcceptLabRequest: (
    requestId: string,
    defectoscopistName: string,
    jointUpdates: Array<{ jointId: string; patch: Partial<WeldJoint> }>
  ) => Promise<boolean> | void;
  onSaveLabConclusions: (
    jointUpdates: Array<{ jointId: string; patch: Partial<WeldJoint> }>,
    actionSummary: string,
    relatedRequestId?: string
  ) => Promise<boolean>;
  onDeleteLabRequest: (requestId: string) => Promise<boolean>;
  // Действия справочников и модалок
  onOpenFacilityLocation: (objName: string) => void;
  onOpenAdminPasswordModal: () => void;
  onEditJointInPassport: (j: WeldJoint) => void;
  onChangeJointStatus?: (
    joint: WeldJoint,
    targetStatus: RecordStatus,
    reason?: string
  ) => Promise<{ ok: boolean; message?: string }>;
  onChangeLineStatus?: (
    line: ProjectLineItem,
    targetStatus: RecordStatus,
    reason?: string
  ) => Promise<{ ok: boolean; message?: string }>;
  dirActions: {
    handleAddLineItems: (items: ProjectLineItem[]) => Promise<void>;
    handleUpdateLineItem: (
      updated: ProjectLineItem,
      previousItem?: ProjectLineItem,
      cascadeRename?: boolean
    ) => Promise<void>;
    handleBulkUpdateLineItems: (
      selectedIds: string[],
      patch: Partial<ProjectLineItem>
    ) => Promise<void>;
    handleDeleteLineItems: (lineIds: string[]) => Promise<void>;
    handleDeleteObject: (objectName: string) => Promise<void>;
    handleDeleteRdCode: (rdCode: string, objectName?: string) => Promise<void>;
    handleCreateStandaloneObject: (objectName: string) => Promise<void>;
    handleSaveWelder: (w: WelderProfile) => Promise<void>;
    handleDeleteWelder: (stamp: string) => Promise<void>;
    handleSaveTechCard: (tc: TechCardItem) => Promise<void>;
    handleDeleteTechCard: (id: string) => Promise<void>;
    handleSaveMaterial: (mat: WeldingMaterialCertificate) => Promise<void>;
    handleDeleteWeldingMaterial: (id: string) => Promise<void>;
    handleAddLrvItems: (items: LRVItem[]) => Promise<void>;
    handleUpdateLrvItem: (item: LRVItem) => Promise<void>;
    handleDeleteLrvItems: (ids: string[]) => Promise<void>;
    handleClearAuditLogs: () => void;
  };
  testCircuitActions: ReturnType<typeof useTestCircuitActions>;
}

export const AppMainContent: React.FC<AppMainContentProps> = (props) => {
  const auth = useAuth();
  const app = useAppContext();

  const activeSection = props.activeSection ?? app.activeSection;
  const setActiveSection = props.setActiveSection ?? app.setActiveSection;
  const selectedObjectName = props.selectedObjectName ?? app.selectedObjectName;
  const setSelectedObjectName = props.setSelectedObjectName ?? app.setSelectedObjectName;
  const selectedRdCode = props.selectedRdCode ?? app.selectedRdCode;
  const setSelectedRdCode = props.setSelectedRdCode ?? app.setSelectedRdCode;
  const joints = props.joints ?? app.joints;
  const projectLineList = props.projectLineList ?? app.projectLineList;
  const lrvCatalog = props.lrvCatalog ?? app.lrvCatalog;
  const welders = props.welders ?? app.welders;
  const techCards = props.techCards ?? app.techCards;
  const weldingMaterials = props.weldingMaterials ?? app.weldingMaterials;
  const derivedFacilities = props.derivedFacilities ?? app.derivedFacilities;
  const auditLogs = props.auditLogs ?? app.auditLogs;
  const labRequests = props.labRequests ?? app.labRequests;
  const currentUser = props.currentUser ?? auth.currentUser;
  const userPermissions = props.userPermissions ?? auth.userPermissions;
  const isDbConnected = props.isDbConnected ?? app.isDbConnected;
  const pendingSyncCount = props.pendingSyncCount ?? app.pendingSyncCount;

  const {
    scopedJoints,
    filteredAndSortedJoints,
    dynamicInspectors,
    isLoadingDemoDataset,
    onLoadKharasaveyDemo,
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
    setColumnFilters,
    onCreateLabRequest,
    onAcceptLabRequest,
    onSaveLabConclusions,
    onDeleteLabRequest,
    onOpenFacilityLocation,
    onOpenAdminPasswordModal,
    onEditJointInPassport,
    onChangeJointStatus,
    onChangeLineStatus,
    dirActions,
    testCircuitActions,
  } = props;
  return (
    <main className="flex-1 max-w-[1920px] w-full mx-auto p-3 sm:p-4 space-y-3">
      {selectedObjectName === 'УКПГ-1С Харасавэйское ГКМ' &&
        joints.filter((j) => j.objectName === 'УКПГ-1С Харасавэйское ГКМ').length ===
          0 && (
          <div className="p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-sky-50 via-indigo-50 to-blue-50 border border-sky-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#1e3799] text-white flex items-center justify-center font-bold text-sm shadow-2xs shrink-0">
                1С
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">
                  Демонстрационный массив «УКПГ-1С Харасавэйское ГКМ» (1271 стык)
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Датасет вынесен в отдельный асинхронный модуль и готов к загрузке: 4 шифра РД, 30 линий проекта, 1271 стык.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={isLoadingDemoDataset}
              onClick={onLoadKharasaveyDemo}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:bg-slate-400"
            >
              {isLoadingDemoDataset ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Загрузка данных...</span>
                </>
              ) : (
                <>
                  <HardDriveDownload className="w-4 h-4" />
                  <span>Загрузить 1271 стык (Харасавэй)</span>
                </>
              )}
            </button>
          </div>
        )}

      {activeSection === 'registry' && (
        <JointsRegistryView
          filteredAndSortedJoints={filteredAndSortedJoints}
          onCreateLabRequest={onCreateLabRequest}
          selectedJointIds={selectedJointIds}
          onToggleSelectRow={onToggleSelectRow}
          onToggleSelectAll={onToggleSelectAll}
          onClearSelection={onClearSelection}
          weldingDateFrom={weldingDateFrom}
          weldingDateTo={weldingDateTo}
          onWeldingDateFromChange={onWeldingDateFromChange}
          onWeldingDateToChange={onWeldingDateToChange}
          onResetDateRange={onResetDateRange}
          confirmBulkDeleteJoints={confirmBulkDeleteJoints}
          onSetConfirmBulkDeleteJoints={onSetConfirmBulkDeleteJoints}
          onBulkDeleteSelectedJoints={onBulkDeleteSelectedJoints}
          onOpenBulkEdit={onOpenBulkEdit}
          onQuickAddSupplementaryJoint={onQuickAddSupplementaryJoint}
          onOpenImportExcel={onOpenImportExcel}
          onOpenCreatePassport={onOpenCreatePassport}
          onOpenEditPassport={onOpenEditPassport}
          activeTemplateId={activeTemplateId}
          templates={templates}
          onApplyTemplate={onApplyTemplate}
          visibleColumns={visibleColumns}
          activeColumnDefs={activeColumnDefs}
          columnWidths={columnWidths}
          onOpenColumnsModal={onOpenColumnsModal}
          columnFilters={columnFilters}
          activeFilterKeys={activeFilterKeys}
          onSetColumnFilter={onSetColumnFilter}
          onResetAllFilters={onResetAllFilters}
          sortConfig={sortConfig}
          onSetSortConfig={onSetSortConfig}
          openFilterColumnKey={openFilterColumnKey}
          onSetOpenFilterColumnKey={onSetOpenFilterColumnKey}
          getUniqueValuesForColumn={getUniqueValuesForColumn}
          onColumnResizeStart={onColumnResizeStart}
          onColumnAutoFit={onColumnAutoFit}
          onMoveColumnInline={onMoveColumnInline}
          onHideColumnInline={onHideColumnInline}
          onChangeJointStatus={onChangeJointStatus}
        />
      )}

      {activeSection === 'laboratory' && (
        <LaboratoryView
          inspectors={dynamicInspectors}
          onCreateLabRequest={onCreateLabRequest}
          onAcceptLabRequest={onAcceptLabRequest}
          onSaveLabConclusions={onSaveLabConclusions}
          onDeleteLabRequest={onDeleteLabRequest}
          onOpenJointPassport={onOpenEditPassport}
        />
      )}

      {activeSection === 'testing_circuits' && (
        <TestCircuitsView
          onLoadCircuitDetail={testCircuitActions.handleLoadCircuitDetail}
          onCreateCircuit={testCircuitActions.handleCreateCircuit}
          onUpdateCircuit={testCircuitActions.handleUpdateCircuit}
          onChangeCircuitStatus={testCircuitActions.handleChangeCircuitStatus}
          onDeleteCircuit={testCircuitActions.handleDeleteCircuit}
          onAssignLinesToCircuit={testCircuitActions.handleAssignLinesToCircuit}
          onAssignJointsToCircuit={testCircuitActions.handleAssignJointsToCircuit}
          onUnassignJointsFromCircuit={testCircuitActions.handleUnassignJointsFromCircuit}
          onOpenJointPassport={onOpenEditPassport}
        />
      )}

      {activeSection === 'project_linelist' && (
        <ProjectLineListView
          selectedObjectName={selectedObjectName}
          onSelectObjectName={setSelectedObjectName}
          selectedRdCode={selectedRdCode}
          onSelectRdCode={setSelectedRdCode}
          onAddLineItems={dirActions.handleAddLineItems}
          onUpdateLineItem={dirActions.handleUpdateLineItem}
          onBulkUpdateLineItems={dirActions.handleBulkUpdateLineItems}
          onOpenLineInRegistry={(uniqueLineId) => {
            setSelectedObjectName('ALL');
            setSelectedRdCode('ALL');
            setColumnFilters({ uniqueLineId: [uniqueLineId] });
            setActiveSection('registry');
          }}
          onOpenFacilityLocation={onOpenFacilityLocation}
          onDeleteLineItems={dirActions.handleDeleteLineItems}
          onDeleteObject={dirActions.handleDeleteObject}
          onDeleteRdCode={dirActions.handleDeleteRdCode}
          onChangeLineStatus={onChangeLineStatus}
          onAssignLinesToCircuit={testCircuitActions.handleAssignLinesToCircuit}
          onOpenTestingCircuits={() => setActiveSection('testing_circuits')}
        />
      )}

      {activeSection === 'welding_tech' && (
        <WeldingTechView
          onSaveWelder={dirActions.handleSaveWelder}
          onDeleteWelder={dirActions.handleDeleteWelder}
          onSaveTechCard={dirActions.handleSaveTechCard}
          onDeleteTechCard={dirActions.handleDeleteTechCard}
          onSaveMaterial={dirActions.handleSaveMaterial}
          onDeleteMaterial={dirActions.handleDeleteWeldingMaterial}
        />
      )}

      {activeSection === 'journals' && (
        <WeldingJournalsView
          onEditJoint={onEditJointInPassport}
          onChangeJointStatus={onChangeJointStatus}
        />
      )}

      {activeSection === 'readiness' && (
        <ReadinessReportView
          joints={scopedJoints}
          onFilterRegistryByCondition={(cond: ReadinessGroupCondition, val: string) => {
            if (cond === 'objectName') {
              setSelectedObjectName(val);
              setSelectedRdCode('ALL');
            } else if (cond === 'rdCode') {
              setSelectedRdCode(val);
            } else {
              setColumnFilters({ [cond]: [val] });
            }
            setActiveSection('registry');
          }}
        />
      )}

      {activeSection === 'lrv_catalog' && (
        <LrvCatalogView
          onAddLrvItems={dirActions.handleAddLrvItems}
          onUpdateLrvItem={dirActions.handleUpdateLrvItem}
          onDeleteLrvItems={dirActions.handleDeleteLrvItems}
        />
      )}

      {activeSection === 'audit_log' &&
        (auth.isAuthenticated && userPermissions.canViewAuditLogs ? (
          <AuditHistoryView
            onClearAuditLog={dirActions.handleClearAuditLogs}
            onOpenAdminPasswordModal={onOpenAdminPasswordModal}
          />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center shadow-2xs space-y-2">
            <h2 className="text-sm font-bold text-slate-900">
              Раздел «Аудит» доступен только администраторам
            </h2>
            <p className="text-xs text-slate-500">
              Для просмотра журнала операций обратитесь к администратору отдела или суперадмину.
            </p>
          </div>
        ))}

      {activeSection === 'user_guide' && <UserGuideBookletView />}
    </main>
  );
};
