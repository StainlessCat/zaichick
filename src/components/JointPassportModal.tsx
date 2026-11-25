import React, { useEffect } from 'react';
import { Check, ChevronRight, Lock } from 'lucide-react';
import {
  AuditLogEntry,
  FacilityObject,
  InspectorProfile,
  LRVItem,
  ProjectLineItem,
  RecordStatus,
  TechCardItem,
  UserAccount,
  WelderProfile,
  WeldingMaterialCertificate,
  WeldJoint,
} from '../types/welding';
import { useAppContext } from '../context';
import {
  PassportHeader,
  PassportValidationBanner,
  PassportTabBar,
  PassportRequisitesSidebar,
  PassportWeldingTab,
  PassportElementsTab,
  PassportControlTab,
  PassportRepairTab,
  PassportHistoryTab,
  useJointPassportForm,
} from './passport';

interface JointPassportModalProps {
  isOpen: boolean;
  mode: 'create' | 'edit';
  initialJoint: WeldJoint | null;
  allJoints: WeldJoint[];
  facilities: FacilityObject[];
  projectLineList: ProjectLineItem[];
  lrvCatalog: LRVItem[];
  welders: WelderProfile[];
  techCards: TechCardItem[];
  weldingMaterials?: WeldingMaterialCertificate[];
  weldingMaterialsList?: WeldingMaterialCertificate[];
  inspectors: InspectorProfile[];
  auditLogsForJoint: AuditLogEntry[];
  defaultObjectName?: string;
  defaultRdCode?: string;
  currentUser?: UserAccount;
  onSave: (
    joint: WeldJoint,
    isSupplementary: boolean,
    crossRdAllowed: boolean
  ) => Promise<{ ok: boolean; message?: string } | void> | void;
  onNavigateJoint?: (targetJoint: WeldJoint) => void;
  onDeleteJoint?: (joint: WeldJoint) => void;
  onChangeJointStatus?: (
    joint: WeldJoint,
    targetStatus: RecordStatus,
    reason?: string
  ) => Promise<{ ok: boolean; message?: string }>;
  onOpenFacilityLocation?: (objectName: string) => void;
  onClose: () => void;
}

export const JointPassportModal: React.FC<JointPassportModalProps> = ({
  isOpen,
  mode,
  initialJoint,
  allJoints,
  facilities,
  projectLineList,
  lrvCatalog,
  welders,
  techCards,
  weldingMaterials,
  weldingMaterialsList: weldingMaterialsListProp,
  inspectors,
  auditLogsForJoint,
  defaultObjectName,
  defaultRdCode,
  currentUser,
  onSave,
  onNavigateJoint,
  onDeleteJoint,
  onChangeJointStatus,
  onOpenFacilityLocation,
  onClose,
}) => {
  const { testCircuits } = useAppContext();
  const weldingMaterialsList = weldingMaterials || weldingMaterialsListProp || [];

  const {
    form,
    setForm,
    activeTab,
    setActiveTab,
    validationError,
    isSupplementaryMode,
    setIsSupplementaryMode,
    allowCrossRdLrv,
    setAllowCrossRdLrv,
    filterLrvBySameDiameter,
    setFilterLrvBySameDiameter,
    confirmDeleteStep,
    setConfirmDeleteStep,
    elem1Diam,
    elem2Diam,
    currentFacility,
    currentWeatherStationName,
    personalWelders,
    brigadeProfiles,
    availableLrvItems,
    baseLrvOptionsForElem2,
    elem1AvailableSizes,
    elem2AvailableSizes,
    filteredLrvOptionsElem1,
    filteredLrvOptionsElem2,
    elem1AutoSelectedCode,
    elem2AutoSelectedCode,
    selectedLrv1Item,
    selectedLrv2Item,
    selectedTechCard,
    diameterValidation,
    weldingTypeValidation,
    preheatValidation,
    comprehensiveValidation,
    lineJoints,
    copyableLineJoints,
    defaultDonorJointId,
    currentLineIndex,
    prevJoint,
    nextJoint,
    welder1Stamp,
    setWelder1Stamp,
    welder2Stamp,
    setWelder2Stamp,
    brigadeStamp,
    setBrigadeStamp,
    elem1SearchQuery,
    setElem1SearchQuery,
    elem1TypeFilter,
    setElem1TypeFilter,
    elem1SizeFilter,
    setElem1SizeFilter,
    elem2SearchQuery,
    setElem2SearchQuery,
    elem2TypeFilter,
    setElem2TypeFilter,
    elem2SizeFilter,
    setElem2SizeFilter,
    availableLinesForRd,
    existingNumbersInLine,
    duplicateJointOnLine,
    baseJointForSupp,
    recordEditCheck,
    effectiveRbac,
    canSaveAnyField,
    handleSelectLrv1,
    handleSelectLrv2,
    handleClearElem1,
    handleClearElem2,
    handleCopyElementsFromJoint,
    handleCopyElem1ToElem2,
    handleSwapElements,
    handleWelder1Change,
    handleWelder2Change,
    handleBrigadeStampChange,
    handleSelectTechCard,
    handleRdCodeChangeInCreate,
    handleSubmit,
    handleSafeClose,
  } = useJointPassportForm({
    isOpen,
    mode,
    initialJoint,
    allJoints,
    facilities,
    projectLineList,
    lrvCatalog,
    welders,
    techCards,
    weldingMaterialsList,
    defaultObjectName,
    defaultRdCode,
    currentUser,
    onSave: (joint) => {
      onSave(joint, isSupplementaryMode, allowCrossRdLrv);
    },
    onClose,
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        e.preventDefault();
        handleSafeClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleSafeClose]);

  if (!isOpen) return null;

  const handleNavigateToJoint = (targetJoint: WeldJoint) => {
    if (canSaveAnyField) {
      onSave(form, isSupplementaryMode, allowCrossRdLrv);
    }
    if (onNavigateJoint) {
      onNavigateJoint(targetJoint);
    }
  };

  const formatLrvOptionLabel = (item: LRVItem) => {
    const dims = item.diameterMm2
      ? `Ø1: ${item.diameterMm}×${item.wallThickness} / Ø2: ${item.diameterMm2}×${item.wallThickness2 ?? item.wallThickness}`
      : `Ø${item.diameterMm}×${item.wallThickness}`;
    const mfg = item.manufacturer ? ` · ${item.manufacturer}` : '';
    const ntd = item.ntd ? ` [${item.ntd}]` : '';
    const statusNote =
      item.status === 'superseded' || item.status === 'archived'
        ? ` [АННУЛИРОВАНА: ${item.replacementLetter || 'заменена'}]`
        : '';
    return `${item.shortName} · ст.${item.material}${mfg} · ${dims}${ntd}${statusNote} (ЛРВ: ${item.lrvCode})`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={
        mode === 'create'
          ? 'Добавление нового сварного стыка'
          : 'Паспорт сварного стыка'
      }
    >
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={handleSafeClose}
      />

      <div className="relative z-10 w-full max-w-6xl bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden">
        <PassportHeader
          mode={mode}
          form={form}
          lineJoints={lineJoints}
          currentLineIndex={currentLineIndex}
          prevJoint={prevJoint}
          nextJoint={nextJoint}
          onNavigateToJoint={handleNavigateToJoint}
          onChangeJointStatus={onChangeJointStatus}
          onClose={handleSafeClose}
        />

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {mode === 'edit' && !recordEditCheck.allowed && recordEditCheck.reason && (
              <div className="p-3 rounded-lg bg-slate-100 border border-slate-300 text-slate-800 text-xs font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-600 shrink-0" />
                <span>{recordEditCheck.reason}</span>
              </div>
            )}

            <PassportValidationBanner
              validationError={validationError}
              comprehensiveValidation={comprehensiveValidation}
            />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <PassportRequisitesSidebar
                mode={mode}
                form={form}
                setForm={setForm}
                rbac={effectiveRbac}
                facilities={facilities}
                currentFacility={currentFacility}
                projectLineList={projectLineList}
                availableLinesForRd={availableLinesForRd}
                testCircuits={testCircuits}
                currentWeatherStationName={currentWeatherStationName}
                elem1Diam={elem1Diam}
                isSupplementaryMode={isSupplementaryMode}
                setIsSupplementaryMode={setIsSupplementaryMode}
                confirmDeleteStep={confirmDeleteStep}
                setConfirmDeleteStep={setConfirmDeleteStep}
                duplicateJointOnLine={duplicateJointOnLine}
                existingNumbersInLine={existingNumbersInLine}
                baseJointForSupp={baseJointForSupp}
                onOpenFacilityLocation={onOpenFacilityLocation}
                onDeleteJoint={onDeleteJoint}
                onClose={handleSafeClose}
                handleRdCodeChangeInCreate={handleRdCodeChangeInCreate}
              />

              <div className="lg:col-span-9 space-y-4">
                <PassportTabBar
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  form={form}
                  mode={mode}
                  rbac={effectiveRbac}
                  auditLogsCount={auditLogsForJoint.length}
                />

                {activeTab === 'welding' && (
                  <PassportWeldingTab
                    form={form}
                    setForm={setForm}
                    rbac={effectiveRbac}
                    techCards={techCards}
                    weldingMaterialsList={weldingMaterialsList}
                    welder1Stamp={welder1Stamp}
                    setWelder1Stamp={setWelder1Stamp}
                    welder2Stamp={welder2Stamp}
                    setWelder2Stamp={setWelder2Stamp}
                    brigadeStamp={brigadeStamp}
                    setBrigadeStamp={setBrigadeStamp}
                    personalWelders={personalWelders}
                    brigadeProfiles={brigadeProfiles}
                    currentWeatherStationName={currentWeatherStationName}
                    archivedStationTemp={
                      form.weldingDate
                        ? currentFacility.weatherArchive?.[form.weldingDate]
                        : undefined
                    }
                    selectedTechCard={selectedTechCard}
                    weldingTypeValidation={weldingTypeValidation}
                    preheatValidation={preheatValidation}
                    handleSelectTechCard={handleSelectTechCard}
                    handleWelder1Change={handleWelder1Change}
                    handleWelder2Change={handleWelder2Change}
                    handleBrigadeStampChange={handleBrigadeStampChange}
                  />
                )}

                {activeTab === 'elements' && (
                  <PassportElementsTab
                    form={form}
                    setForm={setForm}
                    allJoints={allJoints}
                    copyableLineJoints={copyableLineJoints}
                    defaultDonorJointId={defaultDonorJointId}
                    rbac={effectiveRbac}
                    filterLrvBySameDiameter={filterLrvBySameDiameter}
                    setFilterLrvBySameDiameter={setFilterLrvBySameDiameter}
                    allowCrossRdLrv={allowCrossRdLrv}
                    setAllowCrossRdLrv={setAllowCrossRdLrv}
                    availableLrvItems={availableLrvItems}
                    baseLrvOptionsForElem2={baseLrvOptionsForElem2}
                    elem1Diam={elem1Diam}
                    elem2Diam={elem2Diam}
                    diameterValidation={diameterValidation}
                    elem1TypeFilter={elem1TypeFilter}
                    setElem1TypeFilter={setElem1TypeFilter}
                    elem1SizeFilter={elem1SizeFilter}
                    setElem1SizeFilter={setElem1SizeFilter}
                    elem1AvailableSizes={elem1AvailableSizes}
                    elem1SearchQuery={elem1SearchQuery}
                    setElem1SearchQuery={setElem1SearchQuery}
                    elem1AutoSelectedCode={elem1AutoSelectedCode}
                    elem2TypeFilter={elem2TypeFilter}
                    setElem2TypeFilter={setElem2TypeFilter}
                    elem2SizeFilter={elem2SizeFilter}
                    setElem2SizeFilter={setElem2SizeFilter}
                    elem2AvailableSizes={elem2AvailableSizes}
                    elem2SearchQuery={elem2SearchQuery}
                    setElem2SearchQuery={setElem2SearchQuery}
                    elem2AutoSelectedCode={elem2AutoSelectedCode}
                    filteredLrvOptionsElem1={filteredLrvOptionsElem1}
                    filteredLrvOptionsElem2={filteredLrvOptionsElem2}
                    selectedLrv1Item={selectedLrv1Item}
                    selectedLrv2Item={selectedLrv2Item}
                    handleSelectLrv1={handleSelectLrv1}
                    handleSelectLrv2={handleSelectLrv2}
                    handleClearElem1={handleClearElem1}
                    handleClearElem2={handleClearElem2}
                    handleCopyElementsFromJoint={handleCopyElementsFromJoint}
                    handleCopyElem1ToElem2={handleCopyElem1ToElem2}
                    handleSwapElements={handleSwapElements}
                    formatLrvOptionLabel={formatLrvOptionLabel}
                  />
                )}

                {activeTab === 'control' && (
                  <PassportControlTab
                    form={form}
                    setForm={setForm}
                    rbac={effectiveRbac}
                    currentUser={currentUser}
                    inspectors={inspectors}
                  />
                )}

                {activeTab === 'repair' && (
                  <PassportRepairTab
                    form={form}
                    setForm={setForm}
                    rbac={effectiveRbac}
                    inspectors={inspectors}
                    welders={welders}
                    techCards={techCards}
                  />
                )}

                {activeTab === 'history' &&
                  mode === 'edit' &&
                  effectiveRbac.category === 'admin' && (
                    <PassportHistoryTab
                      jointNumber={form.jointNumber}
                      auditLogsForJoint={auditLogsForJoint}
                    />
                  )}
              </div>
            </div>
          </div>

          <div className="shrink-0 bg-white border-t border-slate-200 px-6 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] z-20 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              <span>Все изменения фиксируются в журнале аудита с указанием автора и времени</span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleSafeClose}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Отмена
              </button>
              {mode === 'edit' && nextJoint && (
                <button
                  type="button"
                  onClick={() => handleNavigateToJoint(nextJoint)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#1e3799] bg-[#e8f1fc] text-[#1e3799] text-xs font-semibold hover:bg-sky-100 transition-colors cursor-pointer"
                  title={`Сохранить текущий стык и сразу перейти к следующему стыку № ${nextJoint.jointNumber}`}
                >
                  <span>Сохранить и перейти далее</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                disabled={!canSaveAnyField || Boolean(duplicateJointOnLine)}
                title={
                  Boolean(duplicateJointOnLine)
                    ? `Сохранение заблокировано: номер стыка «${form.jointNumber}» уже занят на этой линии`
                    : undefined
                }
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-[#1e3799] text-white text-xs font-semibold hover:bg-[#15276e] disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed shadow-xs cursor-pointer transition-colors"
              >
                {canSaveAnyField ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Lock className="w-4 h-4" />
                )}
                <span>
                  {!canSaveAnyField
                    ? form.recordStatus === 'LOCKED'
                      ? 'Запись закрыта'
                      : 'Только чтение'
                    : mode === 'create'
                    ? 'Добавить стык в реестр'
                    : 'Сохранить паспорт стыка'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
