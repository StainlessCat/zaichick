import React from 'react';
import {
  AlertTriangle,
  Check,
  FileCheck2,
  Filter,
  Lock,
  Sparkles,
} from 'lucide-react';
import {
  ControlResult,
  InspectorProfile,
  LabConclusionMethodKey,
  NdtLabControlStage,
  NdtLabRequest,
  NdtMethod,
  WeldJoint,
} from '../../types/welding';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import { buildJointLabMarking, buildLabConclusionNumber } from '../../utils/labMarking';
import {
  CANONICAL_LAB_METHODS,
  getRequestMethodsList,
  isJointConclusionCompletedForRequest,
  NdtLineDeficitRow,
  resolveLineLabMethodAvailability,
} from '../../utils/laboratoryLogic';
import {
  CONCLUSION_RESULTS_LIST,
  CONTROL_STAGE_LABELS,
  CONTROL_STAGES_LIST,
  LabJointDraftRow,
  LabMethodDraft,
} from './types';
import { LabMarkingCell } from './LabMarkingCell';

export interface BatchPresetState {
  stage: NdtLabControlStage;
  ndtMethod: NdtMethod;
  selectedMethods: LabConclusionMethodKey[];
  baseReportNumber: string;
  autoIncrementNumber: boolean;
  ndtDate: string;
  ndtResult: ControlResult;
  inspectorName: string;
}

interface LabConclusionsTabProps {
  activeRequestIdForConclusions: string;
  setActiveRequestIdForConclusions: (val: string) => void;
  conclusionLineFilter: string;
  setConclusionLineFilter: (val: string) => void;
  conclusionStateFilter: 'ALL' | 'PENDING' | 'COMPLETED';
  setConclusionStateFilter: (val: 'ALL' | 'PENDING' | 'COMPLETED') => void;
  labRequests: NdtLabRequest[];
  deficitAllLineRows: NdtLineDeficitRow[];
  dirtyJointsCount: number;
  onSaveAllDirtyRows: () => void;
  batchPreset: BatchPresetState;
  setBatchPreset: React.Dispatch<React.SetStateAction<BatchPresetState>>;
  onApplyBatchConclusions: () => void;
  conclusionTargetJoints: WeldJoint[];
  selectedConclusionJointIds: string[];
  setSelectedConclusionJointIds: React.Dispatch<React.SetStateAction<string[]>>;
  getRowDraft: (joint: WeldJoint) => LabJointDraftRow;
  updateRowDraft: (joint: WeldJoint, patch: Partial<LabJointDraftRow>) => void;
  updateMethodDraft: (
    joint: WeldJoint,
    method: LabConclusionMethodKey,
    patch: Partial<LabMethodDraft>
  ) => void;
  onCommitSingleJointConclusion: (joint: WeldJoint) => void;
  onOpenJointPassport: (joint: WeldJoint) => void;
  inspectors: InspectorProfile[];
  joints: WeldJoint[];
  canProcessNdt?: boolean;
}

export const LabConclusionsTab: React.FC<LabConclusionsTabProps> = ({
  activeRequestIdForConclusions,
  setActiveRequestIdForConclusions,
  conclusionLineFilter,
  setConclusionLineFilter,
  conclusionStateFilter,
  setConclusionStateFilter,
  labRequests,
  deficitAllLineRows,
  dirtyJointsCount,
  onSaveAllDirtyRows,
  batchPreset,
  setBatchPreset,
  onApplyBatchConclusions,
  conclusionTargetJoints,
  selectedConclusionJointIds,
  setSelectedConclusionJointIds,
  getRowDraft,
  updateMethodDraft,
  onCommitSingleJointConclusion,
  onOpenJointPassport,
  inspectors,
  canProcessNdt = true,
}) => {
  const lineByUniqueId = React.useMemo(() => {
    const map = new Map<string, NdtLineDeficitRow>();
    for (const row of deficitAllLineRows) {
      map.set(row.uniqueLineId, row);
    }
    return map;
  }, [deficitAllLineRows]);

  const activeRequest = React.useMemo(
    () =>
      activeRequestIdForConclusions !== 'ALL'
        ? labRequests.find((r) => r.id === activeRequestIdForConclusions)
        : undefined,
    [activeRequestIdForConclusions, labRequests]
  );

  const activeReqMethods = React.useMemo(
    () => (activeRequest ? getRequestMethodsList(activeRequest) : undefined),
    [activeRequest]
  );

  // Сворачиваем столбцы методов, отключённые (0% по Лайнлисту) для всех строк текущей выборки
  const collapsedMethods = React.useMemo(() => {
    const collapsed: Record<LabConclusionMethodKey, boolean> = {
      ВИК: false,
      РК: false,
      УЗК: false,
      ПВК: false,
    };
    if (conclusionTargetJoints.length === 0) return collapsed;
    for (const m of ['РК', 'УЗК', 'ПВК'] as const) {
      collapsed[m] = conclusionTargetJoints.every((joint) => {
        const lineRow = lineByUniqueId.get(joint.uniqueLineId);
        return resolveLineLabMethodAvailability(lineRow, activeReqMethods).methods[m].disabled;
      });
    }
    return collapsed;
  }, [conclusionTargetJoints, lineByUniqueId, activeReqMethods]);

  const toggleBatchMethod = (m: LabConclusionMethodKey) => {
    if (!canProcessNdt) return;
    setBatchPreset((p) => {
      const curr = p.selectedMethods;
      const next = curr.includes(m)
        ? curr.filter((item) => item !== m)
        : CANONICAL_LAB_METHODS.filter((item) => item === m || curr.includes(item));
      return {
        ...p,
        selectedMethods: next.length > 0 ? next : [m],
      };
    });
  };

  return (
    <div className="space-y-3">
      {/* Фильтр рабочей ведомости по Заявке / Линии / Статусу */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-[#1e3799]" />
            <span className="text-xs font-bold text-slate-800">
              Выборка ведомости:
            </span>

            <select
              value={activeRequestIdForConclusions}
              onChange={(e) => setActiveRequestIdForConclusions(e.target.value)}
              aria-label="Выбор заявки на НК для оформления заключений"
              className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1e3799]"
            >
              <option value="ALL">Все сваренные стыки контура</option>
              {labRequests.map((r) => {
                const mLabel = getRequestMethodsList(r).join('+');
                return (
                  <option key={r.id} value={r.id}>
                    {r.requestNumber} · {r.lineNumber} · {mLabel} · {r.status}
                  </option>
                );
              })}
            </select>

            {activeRequestIdForConclusions === 'ALL' && (
              <select
                value={conclusionLineFilter}
                onChange={(e) => setConclusionLineFilter(e.target.value)}
                aria-label="Фильтр ведомости по линии"
                className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1e3799]"
              >
                <option value="ALL">Все линии · {deficitAllLineRows.length}</option>
                {deficitAllLineRows.map((l) => (
                  <option key={l.uniqueLineId} value={l.uniqueLineId}>
                    {l.lineNumber} · {l.rdCode} · {l.weldedCount} ст.
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {(
                [
                  { id: 'ALL', label: 'Все' },
                  { id: 'PENDING', label: 'Ожидают / В работе' },
                  { id: 'COMPLETED', label: 'Оформлены' },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setConclusionStateFilter(st.id)}
                  className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    conclusionStateFilter === st.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {dirtyJointsCount > 0 && (
            <button
              type="button"
              disabled={!canProcessNdt}
              onClick={onSaveAllDirtyRows}
              title={
                !canProcessNdt
                  ? 'Для сохранения заключений требуется роль дефектоскописта ЛНК'
                  : undefined
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-bold shadow-xs cursor-pointer disabled:cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              <span>Сохранить изменения · {dirtyJointsCount}</span>
            </button>
          )}
        </div>

        {/* Панель пакетного заполнения заключений с автонумерацией Метод-Маркировка */}
        <div className="p-3 rounded-xl bg-[#f4f8fe] border border-sky-200 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[#1e3799]">
              <Sparkles className="w-4 h-4" />
              <span>
                Пакетное оформление заключений для выбранных стыков:{' '}
                {selectedConclusionJointIds.length}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 font-mono">
              Автонумерация: Метод-Маркировка
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Этап контроля
              </label>
              <select
                value={batchPreset.stage}
                disabled={!canProcessNdt}
                onChange={(e) =>
                  setBatchPreset((p) => ({
                    ...p,
                    stage: e.target.value as NdtLabControlStage,
                  }))
                }
                className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-semibold disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {CONTROL_STAGES_LIST.map((st) => (
                  <option key={st} value={st}>
                    {CONTROL_STAGE_LABELS[st]}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Методы пакета
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {CANONICAL_LAB_METHODS.map((m) => {
                  const active = batchPreset.selectedMethods.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={!canProcessNdt}
                      onClick={() => toggleBatchMethod(m)}
                      className={`px-2.5 py-1.5 rounded border text-xs font-mono font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                        active
                          ? 'bg-[#1e3799] text-white border-[#1e3799]'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Дата заключения
              </label>
              <input
                type="date"
                value={batchPreset.ndtDate}
                disabled={!canProcessNdt}
                onChange={(e) =>
                  setBatchPreset((p) => ({ ...p, ndtDate: e.target.value }))
                }
                className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-mono disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Результат
              </label>
              <select
                value={batchPreset.ndtResult}
                disabled={!canProcessNdt}
                onChange={(e) =>
                  setBatchPreset((p) => ({
                    ...p,
                    ndtResult: e.target.value as ControlResult,
                  }))
                }
                className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-bold disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {CONCLUSION_RESULTS_LIST.filter((r) => r !== 'Не проводился').map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Дефектоскопист
              </label>
              <select
                value={batchPreset.inspectorName}
                disabled={!canProcessNdt}
                onChange={(e) =>
                  setBatchPreset((p) => ({
                    ...p,
                    inspectorName: e.target.value,
                  }))
                }
                className="w-full px-2 py-1.5 rounded bg-white border border-slate-300 text-xs font-medium text-slate-900 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
              >
                {inspectors.map((insp) => (
                  <option key={insp.fullName} value={insp.fullName}>
                    {insp.fullName}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <button
                type="button"
                disabled={!canProcessNdt || selectedConclusionJointIds.length === 0}
                onClick={onApplyBatchConclusions}
                title={
                  !canProcessNdt
                    ? 'Для оформления заключений требуется роль дефектоскописта ЛНК'
                    : selectedConclusionJointIds.length === 0
                    ? 'Выберите хотя бы один стык в таблице ниже'
                    : undefined
                }
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e3799] hover:bg-[#15276e] disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>Заполнить выбранные</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Рабочая таблица с раздельным вводом по методам ВИК / РК / УЗК / ПВК */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-320px)]">
          <table className="w-full text-left border-separate border-spacing-0 text-xs">
            <thead className="sticky top-0 z-20">
              <tr className="bg-[#1e3799] text-white select-none text-xs font-semibold shadow-xs">
                <th className="sticky left-0 z-30 bg-[#1e3799] py-2.5 px-2.5 w-9 min-w-[36px] text-center border-r border-white/15">
                  <input
                    type="checkbox"
                    disabled={!canProcessNdt || conclusionTargetJoints.length === 0}
                    checked={
                      conclusionTargetJoints.length > 0 &&
                      conclusionTargetJoints.every((j) =>
                        selectedConclusionJointIds.includes(j.id)
                      )
                    }
                    onChange={() => {
                      const allIds = conclusionTargetJoints.map((j) => j.id);
                      const allChecked =
                        allIds.length > 0 &&
                        allIds.every((id) =>
                          selectedConclusionJointIds.includes(id)
                        );
                      setSelectedConclusionJointIds(allChecked ? [] : allIds);
                    }}
                    aria-label="Выбрать все стыки ведомости"
                    className="rounded border-white/40 text-sky-400 focus:ring-sky-300 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  />
                </th>
                <th className="sticky left-9 z-30 bg-[#1e3799] py-2.5 px-2.5 border-r border-white/15 min-w-[160px] shadow-[2px_0_4px_-2px_rgba(15,23,42,0.2)]">
                  Стык и линия
                </th>
                <th className="py-2.5 px-2.5 border-r border-white/15 min-w-[195px]">
                  Маркировка стыка
                </th>
                {CANONICAL_LAB_METHODS.map((method) => (
                  <th
                    key={method}
                    className={`py-2.5 px-2.5 border-r border-white/15 ${
                      collapsedMethods[method]
                        ? 'w-16 min-w-[64px] text-center text-sky-200'
                        : 'min-w-[235px]'
                    }`}
                  >
                    {method}
                  </th>
                ))}
                <th className="py-2.5 px-3 text-right min-w-[105px]">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {conclusionTargetJoints.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Нет сваренных стыков для отображения в ведомости по текущему фильтру.
                  </td>
                </tr>
              ) : (
                conclusionTargetJoints.map((joint) => {
                  const row = getRowDraft(joint);
                  const isSelected = selectedConclusionJointIds.includes(joint.id);
                  const isCompleted = isJointConclusionCompletedForRequest(
                    joint,
                    row.stage,
                    activeReqMethods
                  );
                  const lineRow = lineByUniqueId.get(joint.uniqueLineId);
                  const lineEval = resolveLineLabMethodAvailability(lineRow, activeReqMethods);
                  const markingInfo = buildJointLabMarking(joint);
                  const stageMode: 'primary' | 'repair' | 'duplicate' =
                    row.stage === 'Повторный НК после ремонта'
                      ? 'repair'
                      : row.stage === 'Дублирующий контроль'
                      ? 'duplicate'
                      : 'primary';

                  const stickyRowBg = row.isDirty
                    ? 'bg-sky-50'
                    : isCompleted
                    ? 'bg-emerald-50/40'
                    : 'bg-white';

                  return (
                    <tr
                      key={joint.id}
                      className={
                        row.isDirty
                          ? 'bg-sky-50/70'
                          : isCompleted
                          ? 'bg-emerald-50/20 hover:bg-slate-50'
                          : 'bg-white hover:bg-slate-50'
                      }
                    >
                      <td
                        className={`sticky left-0 z-10 ${stickyRowBg} py-2 px-2.5 text-center align-top border-b border-r border-slate-200`}
                      >
                        <input
                          type="checkbox"
                          disabled={!canProcessNdt}
                          checked={isSelected}
                          onChange={() =>
                            setSelectedConclusionJointIds((prev) =>
                              prev.includes(joint.id)
                                ? prev.filter((id) => id !== joint.id)
                                : [...prev, joint.id]
                            )
                          }
                          aria-label={`Выбрать стык ${joint.jointNumber}`}
                          className="rounded border-slate-300 text-[#1e3799] mt-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                      </td>

                      {/* Стык и линия */}
                      <td
                        className={`sticky left-9 z-10 ${stickyRowBg} py-2 px-2.5 align-top border-b border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]`}
                      >
                        <button
                          type="button"
                          onClick={() => onOpenJointPassport(joint)}
                          className="font-mono font-bold text-[#1e3799] hover:underline cursor-pointer"
                          title="Открыть паспорт стыка"
                        >
                          Стык № {joint.jointNumber}
                        </button>
                        <div className="text-[11px] font-mono text-slate-600 mt-0.5">
                          {joint.lineNumber} · {joint.rdCode}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                          {joint.diameterMm}×{joint.wallThickness} мм · {joint.weldingType}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {formatDateDDMMYY(joint.weldingDate)} · {joint.welderStamp}
                        </div>
                        {lineEval.warningMessage && (
                          <div
                            className="mt-1 inline-flex items-center gap-1 text-[10px] text-amber-700 font-medium"
                            title={lineEval.warningMessage}
                          >
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            <span>Нет норм НК</span>
                          </div>
                        )}
                      </td>

                      {/* Маркировка стыка */}
                      <td className="py-2 px-2.5 align-top border-b border-r border-slate-100">
                        <LabMarkingCell joint={joint} />
                      </td>

                      {/* 4 раздельных блока заключений: ВИК, РК, УЗК, ПВК */}
                      {CANONICAL_LAB_METHODS.map((method) => {
                        const avail = lineEval.methods[method];
                        const mDraft = row.methods[method];
                        const isMethodDisabled = avail.disabled || !canProcessNdt;
                        const autoNum = markingInfo.isComplete
                          ? buildLabConclusionNumber(
                              method,
                              markingInfo.marking,
                              stageMode,
                              (joint.repairCount ?? 0) + 1
                            )
                          : '';

                        return (
                          <td
                            key={method}
                            className={`py-2 px-2 border-b border-r border-slate-100 align-top ${
                              avail.disabled ? 'bg-slate-50/80 opacity-60' : ''
                            } ${collapsedMethods[method] ? 'text-center' : ''}`}
                          >
                            {avail.disabled ? (
                              <div
                                className={`flex items-center ${
                                  collapsedMethods[method] ? 'justify-center' : ''
                                } gap-1 text-[11px] text-slate-400 font-mono py-1`}
                                title="0% по Лайнлисту"
                              >
                                <Lock className="w-3 h-3 shrink-0" />
                                <span>{collapsedMethods[method] ? '0%' : '0% по Лайнлисту'}</span>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1">
                                  <select
                                    value={mDraft.result}
                                    disabled={isMethodDisabled}
                                    onChange={(e) => {
                                      const nextRes = e.target.value as ControlResult;
                                      const shouldAutoFill =
                                        nextRes !== 'Не проводился' &&
                                        !mDraft.reportNumber.trim() &&
                                        Boolean(autoNum);
                                      updateMethodDraft(joint, method, {
                                        result: nextRes,
                                        ...(shouldAutoFill ? { reportNumber: autoNum } : {}),
                                      });
                                    }}
                                    aria-label={`Результат ${method} для стыка ${joint.jointNumber}`}
                                    className={`w-full px-1.5 py-1 rounded border text-[11px] font-bold ${
                                      mDraft.result === 'Годен'
                                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                        : mDraft.result === 'Ремонт' || mDraft.result === 'Вырезать'
                                        ? 'bg-rose-50 border-rose-300 text-rose-800'
                                        : mDraft.result === 'В работе'
                                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                                        : 'bg-white border-slate-300 text-slate-600'
                                    }`}
                                  >
                                    {CONCLUSION_RESULTS_LIST.map((r) => (
                                      <option key={r} value={r}>
                                        {r}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    value={mDraft.reportNumber}
                                    disabled={isMethodDisabled}
                                    onChange={(e) =>
                                      updateMethodDraft(joint, method, {
                                        reportNumber: e.target.value,
                                      })
                                    }
                                    placeholder={autoNum || `${method}-...`}
                                    title={mDraft.reportNumber || undefined}
                                    aria-label={`Номер заключения ${method} для стыка ${joint.jointNumber}`}
                                    className="w-full min-w-0 px-1.5 py-1 rounded bg-white border border-slate-300 text-[11px] font-mono text-slate-900 focus:border-[#1e3799] focus:outline-none"
                                  />
                                  {autoNum && (
                                    <button
                                      type="button"
                                      disabled={isMethodDisabled}
                                      onClick={() =>
                                        updateMethodDraft(joint, method, {
                                          reportNumber: autoNum,
                                        })
                                      }
                                      title={`Подставить ${autoNum}`}
                                      className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-[#1e3799] cursor-pointer shrink-0 disabled:opacity-40"
                                    >
                                      <Sparkles className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-1">
                                  <input
                                    type="date"
                                    value={mDraft.date}
                                    min={joint.weldingDate || undefined}
                                    disabled={isMethodDisabled}
                                    onChange={(e) =>
                                      updateMethodDraft(joint, method, {
                                        date: e.target.value,
                                      })
                                    }
                                    aria-label={`Дата ${method} для стыка ${joint.jointNumber}`}
                                    className="w-full px-1 py-0.5 rounded bg-white border border-slate-300 text-[10px] font-mono text-slate-800"
                                  />
                                  <select
                                    value={mDraft.inspector}
                                    disabled={isMethodDisabled}
                                    onChange={(e) =>
                                      updateMethodDraft(joint, method, {
                                        inspector: e.target.value,
                                      })
                                    }
                                    aria-label={`Дефектоскопист ${method} для стыка ${joint.jointNumber}`}
                                    className="w-full px-1 py-0.5 rounded bg-white border border-slate-300 text-[10px] text-slate-800 truncate"
                                  >
                                    {inspectors.map((insp) => (
                                      <option key={insp.fullName} value={insp.fullName}>
                                        {insp.fullName}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Действие */}
                      <td className="py-2 px-3 text-right align-top border-b border-slate-100">
                        <button
                          type="button"
                          disabled={!canProcessNdt}
                          onClick={() => onCommitSingleJointConclusion(joint)}
                          title={
                            !canProcessNdt
                              ? 'Для оформления заключения требуется роль дефектоскописта ЛНК'
                              : undefined
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 whitespace-nowrap ${
                            isCompleted && !row.isDirty
                              ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                              : 'bg-[#1e3799] hover:bg-[#15276e] text-white'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {isCompleted && !row.isDirty ? 'Обновить' : 'Сохранить'}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
