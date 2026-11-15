import React from 'react';
import {
  AuditLogEntry,
  ColumnTemplate,
  FacilityObject,
  InspectorProfile,
  LRVItem,
  OptimisticLockConflictPayload,
  ProjectLineItem,
  ServerDbMetadata,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
  WeldJointFieldKey,
} from '../../types/welding';
import { ColumnTemplatesModal } from '../ColumnTemplatesModal';
import { BulkEditModal } from '../BulkEditModal';
import { JointPassportModal } from '../JointPassportModal';
import { ImportJointsExcelModal } from '../ImportJointsExcelModal';
import { FacilityLocationModal } from '../FacilityLocationModal';
import { LoginModal, LoginModalMode } from '../LoginModal';
import {
  BackupAndResetModal,
  FullSystemBackupPayload,
} from '../BackupAndResetModal';
import { ServerDbStatusModal } from '../ServerDbStatusModal';
import { OptimisticConflictModal } from '../OptimisticConflictModal';
import { EMPTY_FACILITY_FALLBACK } from '../../hooks';
import { FACILITY_LOCATION_PRESETS } from '../../data/seedData';
import type { FacilityGeoOverride } from '../../hooks/useServerSync';
import { useAuth, useAppContext } from '../../context';

export interface AppModalsContainerProps {
  // Column Templates Modal
  isColumnsModalOpen: boolean;
  onCloseColumnsModal: () => void;
  columnOrder: WeldJointFieldKey[];
  visibleColumns: WeldJointFieldKey[];
  onSetColumnOrder: React.Dispatch<React.SetStateAction<WeldJointFieldKey[]>>;
  onSetVisibleColumns: React.Dispatch<React.SetStateAction<WeldJointFieldKey[]>>;
  templates: ColumnTemplate[];
  activeTemplateId: string;
  onApplyTemplate: (tpl: ColumnTemplate) => void;
  onSaveNewTemplate: (name: string, description: string) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onResetColumnWidths: () => void;

  // Bulk Edit Modal
  isBulkEditOpen: boolean;
  onCloseBulkEdit: () => void;
  selectedJoints: WeldJoint[];
  welders?: WelderProfile[];
  dynamicInspectors: InspectorProfile[];
  currentFacility: FacilityObject;
  currentUser?: UserAccount;
  onApplyBulkUpdate: (patch: Partial<WeldJoint>) => void;

  // Joint Passport Modal
  passportModal: {
    isOpen: boolean;
    mode: 'create' | 'edit';
    joint: WeldJoint | null;
  };
  onClosePassportModal: () => void;
  allJoints?: WeldJoint[];
  derivedFacilities?: FacilityObject[];
  projectLineList?: ProjectLineItem[];
  lrvCatalog?: LRVItem[];
  techCards?: TechCardItem[];
  weldingMaterials?: WeldingMaterialCertificate[];
  auditLogs?: AuditLogEntry[];
  selectedObjectName?: string;
  selectedRdCode?: string;
  onSaveJointFromPassport: (
    savedJoint: WeldJoint,
    isSupplementary: boolean,
    usedCrossRdLrv: boolean
  ) => void | Promise<void>;
  onNavigateJoint: (target: WeldJoint) => void;
  onDeleteJointFromPassport: (joint: WeldJoint) => void | Promise<void>;
  onOpenFacilityLocation: (objName: string) => void;

  // Import Excel Modal
  isImportExcelOpen: boolean;
  onCloseImportExcel: () => void;
  onImportJoints: (
    newJoints: WeldJoint[],
    sourceFileName: string
  ) => void | Promise<void>;

  // Facility Location Modal
  locationModalFacilityName: string | null;
  onCloseLocationModal: () => void;
  activeLocationFacility: FacilityObject | null;
  onSaveFacilityLocation: (
    facilityName: string,
    loc: FacilityGeoOverride
  ) => Promise<void>;
  onBulkUpdateJointsTemperaturesFromStation: (
    facilityName: string,
    confirm: boolean
  ) => { updatedCount: number; message: string };

  // Login Modal
  isLoginModalOpen?: boolean;
  onCloseLoginModal?: () => void;
  userAccounts?: UserAccount[];
  loginModalInitialMode?: LoginModalMode;
  isAuthenticated: boolean;
  onChangeAdminPassword: (
    adminLogin: string,
    cur: string,
    next: string
  ) => Promise<{ ok: boolean; message: string }>;
  onToggleAdminRights: (
    login: string,
    grant: boolean
  ) => Promise<{ ok: boolean; message: string }>;
  onRegisterAccount: (newAcc: UserAccount) => void;
  onDeleteAccount: (login: string) => Promise<void>;
  onAuthenticate: (acc: UserAccount) => void;

  // Backup and Reset Modal
  backupModalState: {
    isOpen: boolean;
    initialTab: 'backup' | 'author_reset';
  };
  onCloseBackupModal: () => void;
  currentPayload: FullSystemBackupPayload['data'];
  onRestoreBackup: (payload: FullSystemBackupPayload) => void;
  onAuthorZeroReset: (backupConfirm: boolean) => Promise<boolean>;
  onAuthorRestoreDemoSeed: () => Promise<boolean>;
  onLoadKharasaveyDemo: () => Promise<void>;

  // Server DB Status Modal
  isServerDbModalOpen: boolean;
  onCloseServerDbModal: () => void;
  serverDbMeta?: ServerDbMetadata | null;
  isDbConnected?: boolean;
  isDbSyncing?: boolean;
  pendingSyncCount?: number;
  lastSyncError?: string | null;
  onRetrySync?: () => Promise<boolean>;
  scopedJoints: WeldJoint[];
  onRefreshFromServer: () => Promise<void>;
  onTriggerSimulatedConflict: (jointId: string) => Promise<void>;

  // Optimistic Conflict Modal
  activeConflict: OptimisticLockConflictPayload | null;
  onCloseConflictModal: () => void;
  onAcceptServerVersion: (serverJoint: WeldJoint) => void;
  onApplyAutoMerge: (mergedJoint: WeldJoint, serverVersion: number) => void;
  onForceClientOverwrite: (clientJoint: WeldJoint, serverVersion: number) => void;
}

export const AppModalsContainer: React.FC<AppModalsContainerProps> = (props) => {
  const auth = useAuth();
  const app = useAppContext();

  const currentUser = props.currentUser ?? auth.currentUser;
  const userAccounts = props.userAccounts ?? auth.userAccounts;
  const isLoginModalOpen = props.isLoginModalOpen ?? auth.isLoginModalOpen;
  const onCloseLoginModal =
    props.onCloseLoginModal ?? (() => auth.setIsLoginModalOpen(false));
  const loginModalInitialMode =
    props.loginModalInitialMode ?? auth.loginModalInitialMode;

  const welders = props.welders ?? app.welders;
  const allJoints = props.allJoints ?? app.joints;
  const derivedFacilities = props.derivedFacilities ?? app.derivedFacilities;
  const projectLineList = props.projectLineList ?? app.projectLineList;
  const lrvCatalog = props.lrvCatalog ?? app.lrvCatalog;
  const techCards = props.techCards ?? app.techCards;
  const weldingMaterials = props.weldingMaterials ?? app.weldingMaterials;
  const auditLogs = props.auditLogs ?? app.auditLogs;
  const selectedObjectName = props.selectedObjectName ?? app.selectedObjectName;
  const selectedRdCode = props.selectedRdCode ?? app.selectedRdCode;
  const serverDbMeta = props.serverDbMeta ?? app.serverDbMeta;
  const isDbConnected = props.isDbConnected ?? app.isDbConnected;
  const isDbSyncing = props.isDbSyncing ?? app.isDbSyncing;
  const pendingSyncCount = props.pendingSyncCount ?? app.pendingSyncCount;
  const lastSyncError = props.lastSyncError ?? app.lastSyncError;
  const onRetrySync = props.onRetrySync ?? app.onTriggerSync;

  const {
    isColumnsModalOpen,
    onCloseColumnsModal,
    columnOrder,
    visibleColumns,
    onSetColumnOrder,
    onSetVisibleColumns,
    templates,
    activeTemplateId,
    onApplyTemplate,
    onSaveNewTemplate,
    onDeleteTemplate,
    onResetColumnWidths,
    isBulkEditOpen,
    onCloseBulkEdit,
    selectedJoints,
    dynamicInspectors,
    currentFacility,
    onApplyBulkUpdate,
    passportModal,
    onClosePassportModal,
    onSaveJointFromPassport,
    onNavigateJoint,
    onDeleteJointFromPassport,
    onOpenFacilityLocation,
    isImportExcelOpen,
    onCloseImportExcel,
    onImportJoints,
    locationModalFacilityName,
    onCloseLocationModal,
    activeLocationFacility,
    onSaveFacilityLocation,
    onBulkUpdateJointsTemperaturesFromStation,
    isAuthenticated,
    onChangeAdminPassword,
    onToggleAdminRights,
    onRegisterAccount,
    onDeleteAccount,
    onAuthenticate,
    backupModalState,
    onCloseBackupModal,
    currentPayload,
    onRestoreBackup,
    onAuthorZeroReset,
    onAuthorRestoreDemoSeed,
    onLoadKharasaveyDemo,
    isServerDbModalOpen,
    onCloseServerDbModal,
    scopedJoints,
    onRefreshFromServer,
    onTriggerSimulatedConflict,
    activeConflict,
    onCloseConflictModal,
    onAcceptServerVersion,
    onApplyAutoMerge,
    onForceClientOverwrite,
  } = props;
  return (
    <>
      <ColumnTemplatesModal
        isOpen={isColumnsModalOpen}
        onClose={onCloseColumnsModal}
        columnOrder={columnOrder}
        visibleColumns={visibleColumns}
        onChangeColumns={(order, vis) => {
          onSetColumnOrder(order);
          onSetVisibleColumns(vis);
        }}
        templates={templates}
        activeTemplateId={activeTemplateId}
        onApplyTemplate={onApplyTemplate}
        onSaveNewTemplate={onSaveNewTemplate}
        onDeleteTemplate={onDeleteTemplate}
        onResetColumnWidths={onResetColumnWidths}
      />

      <BulkEditModal
        isOpen={isBulkEditOpen}
        onClose={onCloseBulkEdit}
        selectedJoints={selectedJoints}
        welders={welders}
        inspectors={dynamicInspectors}
        facilityCoords={{
          latitude: currentFacility.latitude,
          longitude: currentFacility.longitude,
          weatherArchive: currentFacility.weatherArchive,
          weatherStation: currentFacility.weatherStation,
        }}
        currentUser={currentUser}
        onApplyBulkUpdate={onApplyBulkUpdate}
      />

      <JointPassportModal
        isOpen={passportModal.isOpen}
        mode={passportModal.mode}
        initialJoint={passportModal.joint}
        allJoints={allJoints}
        facilities={derivedFacilities}
        projectLineList={projectLineList}
        lrvCatalog={lrvCatalog}
        welders={welders}
        techCards={techCards}
        weldingMaterials={weldingMaterials}
        inspectors={dynamicInspectors}
        currentUser={currentUser}
        auditLogsForJoint={
          passportModal.joint
            ? auditLogs.filter((a) => a.jointId === passportModal.joint?.id)
            : []
        }
        defaultObjectName={
          selectedObjectName === 'ALL'
            ? derivedFacilities[0]?.name || EMPTY_FACILITY_FALLBACK.name
            : selectedObjectName
        }
        defaultRdCode={
          selectedRdCode === 'ALL'
            ? currentFacility.rdCodes[0]?.code ||
              EMPTY_FACILITY_FALLBACK.rdCodes[0].code
            : selectedRdCode
        }
        onSave={onSaveJointFromPassport}
        onNavigateJoint={onNavigateJoint}
        onDeleteJoint={onDeleteJointFromPassport}
        onOpenFacilityLocation={onOpenFacilityLocation}
        onClose={onClosePassportModal}
      />

      <ImportJointsExcelModal
        isOpen={isImportExcelOpen}
        onClose={onCloseImportExcel}
        projectLineList={projectLineList}
        lrvCatalog={lrvCatalog}
        techCards={techCards}
        existingJoints={allJoints}
        defaultObjectName={
          selectedObjectName === 'ALL'
            ? derivedFacilities[0]?.name || EMPTY_FACILITY_FALLBACK.name
            : selectedObjectName
        }
        defaultRdCode={
          selectedRdCode === 'ALL'
            ? currentFacility.rdCodes[0]?.code ||
              EMPTY_FACILITY_FALLBACK.rdCodes[0].code
            : selectedRdCode
        }
        onImportJoints={onImportJoints}
      />

      <FacilityLocationModal
        isOpen={Boolean(locationModalFacilityName)}
        facility={activeLocationFacility}
        facilities={derivedFacilities}
        presets={FACILITY_LOCATION_PRESETS}
        joints={allJoints}
        customStations={activeLocationFacility?.customWeatherStations}
        onSaveLocation={onSaveFacilityLocation}
        onBulkUpdateJoints={onBulkUpdateJointsTemperaturesFromStation}
        onClose={onCloseLocationModal}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={onCloseLoginModal}
        currentUser={currentUser}
        accounts={userAccounts}
        initialMode={loginModalInitialMode}
        isAuthenticated={isAuthenticated}
        onChangeAdminPassword={onChangeAdminPassword}
        onToggleAdminRights={onToggleAdminRights}
        onRegisterAccount={onRegisterAccount}
        onDeleteAccount={onDeleteAccount}
        onAuthenticate={onAuthenticate}
      />

      <BackupAndResetModal
        isOpen={backupModalState.isOpen}
        initialMode={backupModalState.initialTab}
        onClose={onCloseBackupModal}
        currentUser={currentUser}
        currentPayload={currentPayload}
        onRestoreBackup={onRestoreBackup}
        onAuthorZeroReset={onAuthorZeroReset}
        onAuthorRestoreDemoSeed={onAuthorRestoreDemoSeed}
        onLoadKharasaveyDemo={onLoadKharasaveyDemo}
      />

      <ServerDbStatusModal
        isOpen={isServerDbModalOpen}
        onClose={onCloseServerDbModal}
        dbMeta={serverDbMeta}
        isConnected={isDbConnected}
        isSyncing={isDbSyncing}
        pendingSyncCount={pendingSyncCount}
        lastSyncError={lastSyncError}
        onRetrySync={onRetrySync}
        joints={scopedJoints.length > 0 ? scopedJoints : allJoints}
        onRefreshFromServer={onRefreshFromServer}
        onTriggerSimulatedConflict={onTriggerSimulatedConflict}
      />

      <OptimisticConflictModal
        conflict={activeConflict}
        onClose={onCloseConflictModal}
        onAcceptServerVersion={onAcceptServerVersion}
        onApplyAutoMerge={onApplyAutoMerge}
        onForceClientOverwrite={onForceClientOverwrite}
      />
    </>
  );
};
