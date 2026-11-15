import React from 'react';
import { UserCheck, X } from 'lucide-react';
import {
  NdtLabControlStage,
  NdtLabRequest,
  NdtMethod,
} from '../../types/welding';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import {
  getActiveLabRequestForJoint,
  NdtDeficitStatementResult,
  NdtLineDeficitRow,
} from '../../utils/laboratoryLogic';
import {
  CONTROL_STAGES_LIST,
  NDT_METHODS_LIST,
  RequestModalState,
} from './types';

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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Формирование заявки на неразрушающий контроль от инженера ПТО"
    >
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 bg-[#1e3799] text-white flex items-center justify-between">
          <div>
            <div className="text-[11px] text-sky-200 font-mono">
              ПЕРЕДАЧА СВАРЕННЫХ СТЫКОВ В ЛАБОРАТОРИЮ НК
            </div>
            <h3
              className="text-base font-bold"
              style={{ fontFamily: '"Jost", sans-serif' }}
            >
              Формирование заявки на проведение неразрушающего контроля (от ПТО)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-white/10 text-sky-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Выбор линии из дефицитной ведомости */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
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
                    {r.rdCode} · Линия {r.lineNumber} (сварено: {r.weldedCount}, дефицит НК:{' '}
                    {r.totalPhysicalDeficit} ст.)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                ФИО инженера ПТО (заявитель)
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

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Этап неразрушающего контроля
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

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Запрашиваемый метод контроля
              </label>
              <select
                value={requestModalState.requestedMethod}
                onChange={(e) =>
                  setRequestModalState((prev) => ({
                    ...prev,
                    requestedMethod: e.target.value as NdtMethod,
                  }))
                }
                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-mono font-bold text-slate-900"
              >
                {NDT_METHODS_LIST.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Справка по нормативу выбранной линии */}
          {requestModalState.lineRow && (
            <div className="p-3 rounded-lg bg-[#f4f8fe] border border-sky-200 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
              <span>
                Линия <strong>{requestModalState.lineRow.lineNumber}</strong> · Контур:{' '}
                <strong>{requestModalState.lineRow.contour}</strong>
              </span>
              <span>
                Норма РК: <strong>{requestModalState.lineRow.rkPlanPct}%</strong> (дефицит{' '}
                <strong>{requestModalState.lineRow.rkDeficit}</strong> ст.) · УЗК:{' '}
                <strong>{requestModalState.lineRow.uzkPlanPct}%</strong> (дефицит{' '}
                <strong>{requestModalState.lineRow.uzkDeficit}</strong> ст.) · ПВК:{' '}
                <strong>{requestModalState.lineRow.pvkPlanPct}%</strong> (дефицит{' '}
                <strong>{requestModalState.lineRow.pvkDeficit}</strong> ст.)
              </span>
            </div>
          )}

          {/* Выбор сваренных стыков линии для включения в заявку */}
          {requestModalState.lineRow && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-800">
                  Выберите сваренные стыки для включения в заявку (выбрано:{' '}
                  {requestModalState.selectedJointIds.length} из{' '}
                  {requestModalState.lineRow.allWeldedJoints.length}):
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const row = requestModalState.lineRow;
                      if (!row) return;
                      const unrequested = row.allWeldedJoints.filter(
                        (j) =>
                          !getActiveLabRequestForJoint(
                            j.id,
                            labRequests,
                            requestModalState.requestedMethod
                          ) &&
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
                    Выбрать все неохваченные ({
                      requestModalState.lineRow.allWeldedJoints.filter(
                        (j) =>
                          !getActiveLabRequestForJoint(
                            j.id,
                            labRequests,
                            requestModalState.requestedMethod
                          ) &&
                          (requestModalState.lineRow?.candidateJoints.some((c) => c.id === j.id) ?? true)
                      ).length
                    })
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => {
                      const row = requestModalState.lineRow;
                      if (!row) return;
                      const available = row.allWeldedJoints.filter(
                        (j) =>
                          !getActiveLabRequestForJoint(
                            j.id,
                            labRequests,
                            requestModalState.requestedMethod
                          )
                      );
                      setRequestModalState((prev) => ({
                        ...prev,
                        selectedJointIds: available.map((j) => j.id),
                      }));
                    }}
                    className="text-[11px] font-semibold text-slate-600 hover:underline cursor-pointer"
                  >
                    Выбрать все доступные ({
                      requestModalState.lineRow.allWeldedJoints.filter(
                        (j) =>
                          !getActiveLabRequestForJoint(
                            j.id,
                            labRequests,
                            requestModalState.requestedMethod
                          )
                      ).length
                    })
                  </button>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {requestModalState.lineRow.allWeldedJoints.map((j) => {
                  const activeReq = getActiveLabRequestForJoint(
                    j.id,
                    labRequests,
                    requestModalState.requestedMethod
                  );
                  const checked = requestModalState.selectedJointIds.includes(j.id);
                  const isDisabled = Boolean(activeReq);

                  return (
                    <label
                      key={j.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2 transition-colors ${
                        isDisabled
                          ? 'bg-amber-50/40 cursor-not-allowed opacity-90'
                          : 'hover:bg-slate-50 cursor-pointer'
                      }`}
                      title={
                        activeReq
                          ? `Стык уже включен в активную заявку №${activeReq.requestNumber} (статус «${activeReq.status}») на метод ${activeReq.requestedMethod}`
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-2.5">
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
                          className="rounded border-slate-300 text-[#1e3799] disabled:bg-slate-200 disabled:text-slate-400"
                        />
                        <span className="font-mono font-bold text-slate-900">
                          Стык № {j.jointNumber}
                        </span>
                        {activeReq && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            В заявке №{activeReq.requestNumber} ({activeReq.status})
                          </span>
                        )}
                        <span className="font-mono text-slate-600">
                          {j.diameterMm}×{j.wallThickness} мм · Сварка{' '}
                          {formatDateDDMMYY(j.weldingDate)} · Клеймо {j.welderStamp}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">
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
              Примечание к заявке для дефектоскопистов ЛНК
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
            onClick={onClose}
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
              Передать заявку в Лабораторию ({requestModalState.selectedJointIds.length} ст.)
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
