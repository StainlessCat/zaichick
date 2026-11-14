import React from 'react';
import {
  Check,
  FileCheck2,
  Filter,
  Sparkles,
} from 'lucide-react';
import {
  ControlResult,
  InspectorProfile,
  NdtLabControlStage,
  NdtLabRequest,
  NdtMethod,
  WeldJoint,
} from '../../types/welding';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import {
  isJointConclusionCompletedForRequest,
  NdtLineDeficitRow,
  suggestNextConclusionNumber,
} from '../../utils/laboratoryLogic';
import {
  CONCLUSION_RESULTS_LIST,
  CONTROL_STAGES_LIST,
  LabJointDraftRow,
  NDT_METHODS_LIST,
} from './types';

export interface BatchPresetState {
  stage: NdtLabControlStage;
  ndtMethod: NdtMethod;
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
  onCommitSingleJointConclusion: (joint: WeldJoint) => void;
  onOpenJointPassport: (joint: WeldJoint) => void;
  inspectors: InspectorProfile[];
  joints: WeldJoint[];
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
  updateRowDraft,
  onCommitSingleJointConclusion,
  onOpenJointPassport,
  inspectors,
  joints,
}) => {
  return (
    <div className="space-y-3">
      {/* Фильтр рабочей ведомости по Заявке / Линии / Статусу */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-[#1e3799]" />
            <span className="text-xs font-bold text-slate-800">
              Выборка ведомости контроля:
            </span>

            <select
              value={activeRequestIdForConclusions}
              onChange={(e) => setActiveRequestIdForConclusions(e.target.value)}
              aria-label="Выбор заявки на НК для оформления заключений"
              className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1e3799]"
            >
              <option value="ALL">
                Все сваренные стыки контура (без фильтра по заявке)
              </option>
              {labRequests.map((r) => (
                <option key={r.id} value={r.id}>
                  Заявка {r.requestNumber} · Линия {r.lineNumber} ({r.requestedMethod},{' '}
                  {r.jointIds.length} ст. — {r.status})
                </option>
              ))}
            </select>

            {activeRequestIdForConclusions === 'ALL' && (
              <select
                value={conclusionLineFilter}
                onChange={(e) => setConclusionLineFilter(e.target.value)}
                aria-label="Фильтр ведомости по линии"
                className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1e3799]"
              >
                <option value="ALL">Все линии ({deficitAllLineRows.length})</option>
                {deficitAllLineRows.map((l) => (
                  <option key={l.uniqueLineId} value={l.uniqueLineId}>
                    Линия {l.lineNumber} ({l.rdCode}) — сварено {l.weldedCount} ст.
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {(
                [
                  { id: 'ALL', label: 'Все стыки' },
                  { id: 'PENDING', label: 'Ожидают заключения / В работе' },
                  { id: 'COMPLETED', label: 'Заключения оформлены' },
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
              onClick={onSaveAllDirtyRows}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Check className="w-4 h-4" />
              <span>
                Сохранить все изменённые заключения в ведомости ({dirtyJointsCount} ст.)
              </span>
            </button>
          )}
        </div>

        {/* Панель быстрого пакетного присвоения номера заключения, даты и результата */}
        <div className="p-3 rounded-lg bg-[#f4f8fe] border border-sky-200/90 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold text-slate-900">
              Пакетное оформление заключения НК и ВИК{' '}
              <span className="font-normal text-slate-600">
                (для отмеченных галочкой стыков:{' '}
                <strong className="font-mono">
                  {selectedConclusionJointIds.length > 0
                    ? selectedConclusionJointIds.length
                    : conclusionTargetJoints.length}
                </strong>{' '}
                шт.)
              </span>
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={batchPreset.autoIncrementNumber}
                onChange={(e) =>
                  setBatchPreset((p) => ({
                    ...p,
                    autoIncrementNumber: e.target.checked,
                  }))
                }
                className="rounded border-slate-300 text-[#1e3799]"
              />
              <span>Автонумерация заключений по порядку (+1 для каждого стыка)</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 items-end">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Этап контроля
              </label>
              <select
                value={batchPreset.stage}
                onChange={(e) =>
                  setBatchPreset((p) => ({
                    ...p,
                    stage: e.target.value as NdtLabControlStage,
                  }))
                }
                className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-medium"
              >
                {CONTROL_STAGES_LIST.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Метод НК
              </label>
              <select
                value={batchPreset.ndtMethod}
                onChange={(e) =>
                  setBatchPreset((p) => ({
                    ...p,
                    ndtMethod: e.target.value as NdtMethod,
                  }))
                }
                className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-mono font-semibold"
              >
                {NDT_METHODS_LIST.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                № заключения НК (стартовый или общий)
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={batchPreset.baseReportNumber}
                  onChange={(e) =>
                    setBatchPreset((p) => ({
                      ...p,
                      baseReportNumber: e.target.value,
                    }))
                  }
                  placeholder={suggestNextConclusionNumber(
                    joints,
                    batchPreset.ndtMethod
                  )}
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() =>
                    setBatchPreset((p) => ({
                      ...p,
                      baseReportNumber: suggestNextConclusionNumber(
                        joints,
                        p.ndtMethod
                      ),
                    }))
                  }
                  title="Сгенерировать следующий свободный номер заключения"
                  className="px-2 py-1.5 rounded bg-white border border-slate-300 hover:border-[#1e3799] text-[#1e3799] text-[11px] font-semibold cursor-pointer shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Дата заключения
              </label>
              <input
                type="date"
                value={batchPreset.ndtDate}
                onChange={(e) =>
                  setBatchPreset((p) => ({ ...p, ndtDate: e.target.value }))
                }
                className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Результат контроля
              </label>
              <select
                value={batchPreset.ndtResult}
                onChange={(e) =>
                  setBatchPreset((p) => ({
                    ...p,
                    ndtResult: e.target.value as ControlResult,
                  }))
                }
                className="w-full px-2.5 py-1.5 rounded bg-white border border-slate-300 text-xs font-bold"
              >
                {CONCLUSION_RESULTS_LIST.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <button
                type="button"
                onClick={onApplyBatchConclusions}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
              >
                <FileCheck2 className="w-3.5 h-3.5" />
                <span>Внести в ведомость</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Рабочая таблица-ведомость выдачи заключений на каждый стык */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-900 text-white font-mono text-[11px]">
                <th className="py-2.5 px-2.5 w-8 text-center">
                  <input
                    type="checkbox"
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
                    className="rounded border-slate-400"
                  />
                </th>
                <th className="py-2.5 px-2.5">Линия / № стыка</th>
                <th className="py-2.5 px-2.5">D×S / Сварка</th>
                <th className="py-2.5 px-2.5">Акт ВИК (№, дата, итог)</th>
                <th className="py-2.5 px-2.5">Метод НК</th>
                <th className="py-2.5 px-2.5">№ заключения НК</th>
                <th className="py-2.5 px-2.5">Дата заключения</th>
                <th className="py-2.5 px-2.5">Результат НК</th>
                <th className="py-2.5 px-2.5">Дефектоскопист ЛНК</th>
                <th className="py-2.5 px-3 text-right">Действие</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {conclusionTargetJoints.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-500">
                    Нет сваренных стыков для отображения в ведомости по текущему фильтру.
                  </td>
                </tr>
              ) : (
                conclusionTargetJoints.map((joint) => {
                  const row = getRowDraft(joint);
                  const isSelected = selectedConclusionJointIds.includes(joint.id);
                  const isCompleted = isJointConclusionCompletedForRequest(
                    joint,
                    row.stage
                  );

                  return (
                    <tr
                      key={joint.id}
                      className={
                        row.isDirty
                          ? 'bg-sky-50/70'
                          : isCompleted
                          ? 'bg-emerald-50/25 hover:bg-slate-50'
                          : 'bg-white hover:bg-slate-50'
                      }
                    >
                      <td className="py-2 px-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() =>
                            setSelectedConclusionJointIds((prev) =>
                              prev.includes(joint.id)
                                ? prev.filter((id) => id !== joint.id)
                                : [...prev, joint.id]
                            )
                          }
                          aria-label={`Выбрать стык ${joint.jointNumber}`}
                          className="rounded border-slate-300 text-[#1e3799]"
                        />
                      </td>

                      {/* Линия и номер стыка */}
                      <td className="py-2 px-2.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenJointPassport(joint)}
                            className="font-mono font-bold text-[#1e3799] hover:underline cursor-pointer"
                            title="Открыть полный паспорт стыка"
                          >
                            Стык № {joint.jointNumber}
                          </button>
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {joint.lineNumber} · {joint.rdCode}
                        </div>
                      </td>

                      {/* D x S, дата сварки, клеймо */}
                      <td className="py-2 px-2.5 font-mono tabular-nums text-[11px]">
                        <div className="font-semibold text-slate-900">
                          {joint.diameterMm}×{joint.wallThickness} мм ({joint.weldingType})
                        </div>
                        <div className="text-slate-500">
                          Сварка: {formatDateDDMMYY(joint.weldingDate)} · Клеймо{' '}
                          <strong className="text-slate-800">{joint.welderStamp}</strong>
                        </div>
                      </td>

                      {/* Блок ВИК */}
                      <td className="py-2 px-2.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={row.includeVik}
                            onChange={(e) =>
                              updateRowDraft(joint, {
                                includeVik: e.target.checked,
                              })
                            }
                            title="Оформить одновременно акт ВИК"
                            className="rounded border-slate-300 text-[#1e3799]"
                          />
                          <input
                            type="text"
                            value={row.vikReportNumber}
                            onChange={(e) =>
                              updateRowDraft(joint, {
                                vikReportNumber: e.target.value,
                                includeVik: true,
                              })
                            }
                            placeholder="№ акта ВИК"
                            className="w-24 px-2 py-1 rounded bg-white border border-slate-300 text-[11px] font-mono"
                          />
                          <select
                            value={row.vikResult}
                            onChange={(e) =>
                              updateRowDraft(joint, {
                                vikResult: e.target.value as ControlResult,
                                includeVik: true,
                              })
                            }
                            className="px-1.5 py-1 rounded bg-white border border-slate-300 text-[11px] font-semibold"
                          >
                            {CONCLUSION_RESULTS_LIST.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>

                      {/* Метод НК */}
                      <td className="py-2 px-2.5">
                        <select
                          value={row.ndtMethod}
                          onChange={(e) =>
                            updateRowDraft(joint, {
                              ndtMethod: e.target.value as NdtMethod,
                            })
                          }
                          aria-label={`Метод НК для стыка ${joint.jointNumber}`}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900"
                        >
                          {NDT_METHODS_LIST.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* № заключения НК */}
                      <td className="py-2 px-2.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={row.ndtReportNumber}
                            onChange={(e) =>
                              updateRowDraft(joint, {
                                ndtReportNumber: e.target.value,
                              })
                            }
                            placeholder={suggestNextConclusionNumber(
                              joints,
                              row.ndtMethod
                            )}
                            aria-label={`Номер заключения НК для стыка ${joint.jointNumber}`}
                            className="w-32 px-2 py-1 rounded bg-white border border-slate-300 text-xs font-mono font-semibold text-slate-900 focus:border-[#1e3799] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateRowDraft(joint, {
                                ndtReportNumber: suggestNextConclusionNumber(
                                  joints,
                                  row.ndtMethod
                                ),
                              })
                            }
                            title="Присвоить следующий номер заключения автоматически"
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-[#1e3799] cursor-pointer"
                          >
                            <Sparkles className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      {/* Дата заключения НК */}
                      <td className="py-2 px-2.5">
                        <input
                          type="date"
                          value={row.ndtDate}
                          min={joint.weldingDate || undefined}
                          onChange={(e) =>
                            updateRowDraft(joint, { ndtDate: e.target.value })
                          }
                          aria-label={`Дата заключения НК для стыка ${joint.jointNumber}`}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-xs font-mono tabular-nums text-slate-900"
                        />
                      </td>

                      {/* Результат НК */}
                      <td className="py-2 px-2.5">
                        <select
                          value={row.ndtResult}
                          onChange={(e) =>
                            updateRowDraft(joint, {
                              ndtResult: e.target.value as ControlResult,
                            })
                          }
                          aria-label={`Результат НК для стыка ${joint.jointNumber}`}
                          className={`px-2 py-1 rounded border text-xs font-bold ${
                            row.ndtResult === 'Годен'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : row.ndtResult === 'Ремонт' ||
                                row.ndtResult === 'Вырезать'
                              ? 'bg-rose-50 border-rose-300 text-rose-800'
                              : 'bg-amber-50 border-amber-300 text-amber-800'
                          }`}
                        >
                          {CONCLUSION_RESULTS_LIST.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Дефектоскопист */}
                      <td className="py-2 px-2.5">
                        <select
                          value={row.ndtInspector}
                          onChange={(e) =>
                            updateRowDraft(joint, {
                              ndtInspector: e.target.value,
                            })
                          }
                          aria-label={`Дефектоскопист для стыка ${joint.jointNumber}`}
                          className="px-2 py-1 rounded bg-white border border-slate-300 text-xs text-slate-800 max-w-[140px]"
                        >
                          {inspectors.map((insp) => (
                            <option key={insp.fullName} value={insp.fullName}>
                              {insp.fullName}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Кнопка сохранения заключения по стыку */}
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => onCommitSingleJointConclusion(joint)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                            isCompleted && !row.isDirty
                              ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                              : 'bg-[#1e3799] hover:bg-[#15276e] text-white'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {isCompleted && !row.isDirty
                              ? 'Обновить заключение'
                              : 'Выдать заключение'}
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
