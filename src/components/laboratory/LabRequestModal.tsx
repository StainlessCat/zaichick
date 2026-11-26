import React from 'react';
import { AlertTriangle, UserCheck, X } from 'lucide-react';
import { useModalDismiss } from '../../hooks/useModalDismiss';
import {
  LabConclusionMethodKey,
  NdtLabControlStage,
  NdtLabRequest,
  NdtMethod,
} from '../../types/welding';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import {
  CANONICAL_LAB_METHODS,
  getRequestMethodsList,
  NdtDeficitStatementResult,
  NdtLineDeficitRow,
  resolveLineLabMethodAvailability,
} from '../../utils/laboratoryLogic';
import { CONTROL_STAGES_LIST, RequestModalState } from './types';
import { LabMarkingCell } from './LabMarkingCell';

interface LabRequestModalProps {
  isOpen: boolean;
  requestModalState: RequestModalState;
  setRequestModalState: React.Dispatch<React.SetStateAction<RequestModalState>>;
  deficitStatement: NdtDeficitStatementResult;
  labRequests: NdtLabRequest[];
  onOpenCreateRequestModal: (lineRow: NdtLineDeficitRow) => void;
  onSubmitNewRequest: () => void;
  onClose: () => void;
}

function findOverlappingActiveRequest(
  jointId: string,
  labRequests: NdtLabRequest[],
  selectedMethods: LabConclusionMethodKey[]
): NdtLabRequest | undefined {
  const selectedSet = new Set(selectedMethods);
  return labRequests.find((req) => {
    if (req.status !== 'Подана ПТО' && req.status !== 'В работе ЛНК') {
      return false;
    }
    if (!req.jointIds.includes(jointId)) return false;
    const reqMethods = getRequestMethodsList(req);
    return reqMethods.some((m) => selectedSet.has(m));
  });
}

export const LabRequestModal: React.FC<LabRequestModalProps> = ({
  isOpen,
  requestModalState,
  setRequestModalState,
  deficitStatement,
  labRequests,
  onOpenCreateRequestModal,
  onSubmitNewRequest,
  onClose,
}) => {
  const { handleRequestClose } = useModalDismiss({
    isOpen,
    isDirty: false,
    onClose,
  });

  if (!isOpen) return null;

  const lineEval = resolveLineLabMethodAvailability(requestModalState.lineRow);
  const selectedMethods =
    requestModalState.requestedMethods.length > 0
      ? requestModalState.requestedMethods
      : (['ВИК'] as LabConclusionMethodKey[]);

  const toggleMethod = (m: LabConclusionMethodKey) => {
    if (lineEval.methods[m].disabled) return;
    setRequestModalState((prev) => {
      const current = prev.requestedMethods;
      const next = current.includes(m)
        ? current.filter((item) => item !== m)
        : CANONICAL_LAB_METHODS.filter((item) => item === m || current.includes(item));
      const safeNext: LabConclusionMethodKey[] = next.length > 0 ? next : [m];
      return {
        ...prev,
        requestedMethods: safeNext,
        requestedMethod: (safeNext.join('+') || 'РК') as NdtMethod,
      };
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Формирование пакетной заявки в Лабораторию НК"
    >
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 bg-[#1e3799] text-white flex items-center justify-between">
          <div>
            <div className="text-[11px] text-sky-200 font-mono">
              ПЕРЕДАЧА СВАРЕННЫХ СТЫКОВ В ЛАБОРАТОРИЮ НК
            </div>
            <h3 className="text-base font-bold">
              Формирование пакетной заявки в Лабораторию НК
            </h3>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Закрыть окно"
            className="p-1 rounded-lg hover:bg-white/10 text-sky-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Выбор линии и реквизитов заявки */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Шифр РД и технологическая линия
              </label>
              <select
                value={requestModalState.lineRow?.uniqueLineId || ''}
                onChange={(e) => {
                  const found = deficitStatement.allLineRows.find(
                    (r: NdtLineDeficitRow) => r.uniqueLineId === e.target.value
                  );
                  if (found) {
                    onOpenCreateRequestModal(found);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 font-mono font-semibold text-slate-900"
              >
                {deficitStatement.allLineRows.map((r: NdtLineDeficitRow) => (
                  <option key={r.uniqueLineId} value={r.uniqueLineId}>
                    {r.rdCode} · Линия {r.lineNumber} · сварено {r.weldedCount} · дефицит {r.totalPhysicalDeficit}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Этап контроля
              </label>
              <select
                value={requestModalState.controlStage}
                onChange={(e) =>
                  setRequestModalState((prev) => ({
                    ...prev,
                    controlStage: e.target.value as NdtLabControlStage,
                  }))
                }
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-semibold text-slate-900"
              >
                {CONTROL_STAGES_LIST.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block font-semibold text-slate-700 mb-1">
                Заявитель
              </label>
              <input
                type="text"
                value={requestModalState.ptoEngineerName}
                onChange={(e) =>
                  setRequestModalState((prev) => ({
                    ...prev,
                    ptoEngineerName: e.target.value,
                  }))
                }
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 font-medium"
              />
            </div>
          </div>

          {/* Пакет методов контроля по нормативам Лайнлиста */}
          <div className="p-3 rounded-lg bg-[#f4f8fe] border border-sky-200 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-slate-800">
                Пакет методов контроля по Лайнлисту
              </span>
              {requestModalState.lineRow && (
                <span className="font-mono text-[11px] text-slate-600">
                  РК {requestModalState.lineRow.rkPlanPct}% · УЗК{' '}
                  {requestModalState.lineRow.uzkPlanPct}% · ПВК{' '}
                  {requestModalState.lineRow.pvkPlanPct}%
                </span>
              )}
            </div>

            {lineEval.warningMessage && (
              <div className="px-2.5 py-1.5 rounded bg-amber-50 border border-amber-200 text-amber-900 text-[11px] flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span>{lineEval.warningMessage}</span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CANONICAL_LAB_METHODS.map((m) => {
                const avail = lineEval.methods[m];
                const isChecked = selectedMethods.includes(m);
                return (
                  <label
                    key={m}
                    title={
                      avail.disabled
                        ? 'Не требуется по Лайнлисту'
                        : `Метод ${m}`
                    }
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                      avail.disabled
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        : isChecked
                        ? 'bg-white border-[#1e3799] text-[#1e3799] font-bold shadow-2xs cursor-pointer'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={avail.disabled}
                        onChange={() => toggleMethod(m)}
                        className="rounded border-slate-300 text-[#1e3799] disabled:opacity-40"
                      />
                      <span className="font-mono">{m}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {avail.disabled ? '0%' : m === 'ВИК' ? '100%' : avail.planPct > 0 ? `${avail.planPct}%` : '—'}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Выбор сваренных стыков линии для включения в пакетную заявку */}
          {requestModalState.lineRow && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-800">
                  Стыки линии: выбрано {requestModalState.selectedJointIds.length} из{' '}
                  {requestModalState.lineRow.allWeldedJoints.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const row = requestModalState.lineRow;
                      if (!row) return;
                      const unrequested = row.allWeldedJoints.filter(
                        (j) =>
                          !findOverlappingActiveRequest(j.id, labRequests, selectedMethods) &&
                          (row.candidateJoints.some((c) => c.id === j.id) ||
                            row.candidateJoints.length === 0)
                      );
                      setRequestModalState((prev) => ({
                        ...prev,
                        selectedJointIds: unrequested.map((j) => j.id),
                      }));
                    }}
                    className="text-[11px] font-semibold text-[#1e3799] hover:underline cursor-pointer"
                  >
                    Выбрать неохваченные
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      const row = requestModalState.lineRow;
                      if (!row) return;
                      const available = row.allWeldedJoints.filter(
                        (j) => !findOverlappingActiveRequest(j.id, labRequests, selectedMethods)
                      );
                      setRequestModalState((prev) => ({
                        ...prev,
                        selectedJointIds: available.map((j) => j.id),
                      }));
                    }}
                    className="text-[11px] font-semibold text-slate-600 hover:underline cursor-pointer"
                  >
                    Выбрать все доступные
                  </button>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {requestModalState.lineRow.allWeldedJoints.map((j) => {
                  const activeReq = findOverlappingActiveRequest(
                    j.id,
                    labRequests,
                    selectedMethods
                  );
                  const checked = requestModalState.selectedJointIds.includes(j.id);
                  const isDisabled = Boolean(activeReq);

                  return (
                    <label
                      key={j.id}
                      className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 transition-colors ${
                        isDisabled
                          ? 'bg-amber-50/40 cursor-not-allowed opacity-90'
                          : 'hover:bg-slate-50 cursor-pointer'
                      }`}
                      title={
                        activeReq
                          ? `Пересечение с активной заявкой №${activeReq.requestNumber} по методам ${activeReq.requestedMethod}`
                          : undefined
                      }
                    >
                      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isDisabled}
                          onChange={() => {
                            if (isDisabled) return;
                            setRequestModalState((prev) => ({
                              ...prev,
                              selectedJointIds: prev.selectedJointIds.includes(j.id)
                                ? prev.selectedJointIds.filter((id) => id !== j.id)
                                : [...prev.selectedJointIds, j.id],
                            }));
                          }}
                          className="rounded border-slate-300 text-[#1e3799] disabled:opacity-40"
                        />
                        <span className="font-mono font-bold text-slate-900">
                          № {j.jointNumber}
                        </span>
                        <LabMarkingCell joint={j} compact />
                        {activeReq && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            В заявке №{activeReq.requestNumber}
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-slate-600">
                          {j.diameterMm}×{j.wallThickness} мм · {formatDateDDMMYY(j.weldingDate)} ·{' '}
                          {j.welderStamp}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500 shrink-0">
                        ВИК: {j.vikResult} | НК: {j.ndtResult}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Примечание к заявке
            </label>
            <input
              type="text"
              value={requestModalState.notes}
              onChange={(e) =>
                setRequestModalState((prev) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
              placeholder="Например: срочный контроль под опрессовку контура КИ-1"
              className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900"
            />
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleRequestClose}
            className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onSubmitNewRequest}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-bold cursor-pointer"
          >
            <UserCheck className="w-4 h-4" />
            <span>
              Передать заявку в ЛНК · {requestModalState.selectedJointIds.length} ст.
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
