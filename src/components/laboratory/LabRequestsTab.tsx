import React from 'react';
import {
  ClipboardCheck,
  ExternalLink,
  FilePlus2,
  Play,
  Trash2,
} from 'lucide-react';
import {
  InspectorProfile,
  NdtLabRequest,
  NdtLabRequestStatus,
  WeldJoint,
} from '../../types/welding';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import { isJointConclusionCompletedForRequest } from '../../utils/laboratoryLogic';

interface LabRequestsTabProps {
  filteredRequests: NdtLabRequest[];
  requestCounts: {
    total: number;
    submitted: number;
    inWork: number;
    completed: number;
  };
  requestStatusFilter: 'ALL' | NdtLabRequestStatus;
  setRequestStatusFilter: (val: 'ALL' | NdtLabRequestStatus) => void;
  selectedInspectorForAccept: string;
  setSelectedInspectorForAccept: (val: string) => void;
  inspectors: InspectorProfile[];
  jointsById: Map<string, WeldJoint>;
  canDeleteRequest?: boolean;
  onOpenCreateRequestModal: () => void;
  onAcceptRequestClick: (req: NdtLabRequest) => void;
  onDeleteRequestClick?: (req: NdtLabRequest) => void;
  onOpenRequestInConclusions: (req: NdtLabRequest) => void;
  onOpenJointPassport: (joint: WeldJoint) => void;
}

export const LabRequestsTab: React.FC<LabRequestsTabProps> = ({
  filteredRequests,
  requestCounts,
  requestStatusFilter,
  setRequestStatusFilter,
  selectedInspectorForAccept,
  setSelectedInspectorForAccept,
  inspectors,
  jointsById,
  canDeleteRequest,
  onOpenCreateRequestModal,
  onAcceptRequestClick,
  onDeleteRequestClick,
  onOpenRequestInConclusions,
  onOpenJointPassport,
}) => {
  return (
    <div className="space-y-3">
      {/* Панель фильтрации заявок и выбора дежурного дефектоскописта */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: `Все заявки (${requestCounts.total})` },
              { id: 'Подана ПТО', label: `Новые от ПТО (${requestCounts.submitted})` },
              { id: 'В работе ЛНК', label: `В работе ЛНК (${requestCounts.inWork})` },
              { id: 'Выполнена', label: `Выполнены (${requestCounts.completed})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRequestStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                requestStatusFilter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-600">
            Дефектоскопист при приёмке в работу:
          </span>
          <select
            value={selectedInspectorForAccept}
            onChange={(e) => setSelectedInspectorForAccept(e.target.value)}
            aria-label="Дефектоскопист, принимающий заявку в работу"
            className="px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#1e3799]"
          >
            {inspectors.map((insp) => (
              <option key={insp.fullName} value={insp.fullName}>
                {insp.fullName} ({insp.certLevel})
              </option>
            ))}
          </select>
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
          <div className="text-sm font-semibold text-slate-700">
            Заявки на неразрушающий контроль по выбранному фильтру отсутствуют
          </div>
          <button
            type="button"
            onClick={onOpenCreateRequestModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4" />
            <span>Создать заявку на НК от инженера ПТО</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => {
            const reqJoints = req.jointIds
              .map((id) => jointsById.get(id))
              .filter((j): j is WeldJoint => Boolean(j));
            const completedCount = reqJoints.filter((j) =>
              isJointConclusionCompletedForRequest(j, req.controlStage)
            ).length;

            return (
              <div
                key={req.id}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden"
              >
                {/* Верхняя строка карточки заявки */}
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-sm text-[#1e3799]">
                        {req.requestNumber}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold text-slate-800">
                        Статус: {req.status}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono text-slate-700">
                        Метод: <strong>{req.requestedMethod}</strong> ({req.controlStage})
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono text-slate-700">
                        Шифр РД: <strong>{req.rdCode}</strong> / Линия{' '}
                        <strong>{req.lineNumber}</strong>
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Подал: <strong>{req.createdBy}</strong> ({req.createdAt})
                      {req.acceptedBy && (
                        <>
                          {' '}
                          · Принял в работу ЛНК: <strong>{req.acceptedBy}</strong> (
                          {req.acceptedAt})
                        </>
                      )}
                      {req.notes && <> · Примечание: {req.notes}</>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono tabular-nums text-slate-700 mr-1">
                      Оформлено заключений:{' '}
                      <strong>
                        {completedCount}/{reqJoints.length}
                      </strong>
                    </span>

                    {req.status === 'Подана ПТО' && (
                      <button
                        type="button"
                        onClick={() => onAcceptRequestClick(req)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Принять заявку в работу ЛНК</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenRequestInConclusions(req)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <ClipboardCheck className="w-3.5 h-3.5" />
                      <span>
                        {req.status === 'Выполнена'
                          ? 'Просмотреть заключения ведомости'
                          : 'Оформить заключения по стыкам'}
                      </span>
                    </button>

                    {canDeleteRequest && onDeleteRequestClick && (
                      <button
                        type="button"
                        onClick={() => onDeleteRequestClick(req)}
                        title="Удалить заявку"
                        className="inline-flex items-center justify-center p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Таблица стыков внутри заявки */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-mono text-[11px] border-b border-slate-200">
                        <th className="py-2 px-3">№ стыка</th>
                        <th className="py-2 px-3">Линия</th>
                        <th className="py-2 px-3">Типоразмер D×S</th>
                        <th className="py-2 px-3">Дата сварки</th>
                        <th className="py-2 px-3">Клеймо сварщика</th>
                        <th className="py-2 px-3">Свариваемые элементы (ЛРВ)</th>
                        <th className="py-2 px-3">Акт ВИК</th>
                        <th className="py-2 px-3">Заключение НК ({req.requestedMethod})</th>
                        <th className="py-2 px-3">Дефектоскопист</th>
                        <th className="py-2 px-3 text-right">Паспорт</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reqJoints.map((j) => {
                        const isDone = isJointConclusionCompletedForRequest(
                          j,
                          req.controlStage
                        );
                        return (
                          <tr key={j.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono font-bold text-[#1e3799]">
                              {j.jointNumber}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-800">
                              {j.lineNumber}
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-slate-700">
                              {j.diameterMm}×{j.wallThickness} мм
                            </td>
                            <td className="py-2 px-3 font-mono tabular-nums text-slate-700">
                              {formatDateDDMMYY(j.weldingDate)}
                            </td>
                            <td className="py-2 px-3 font-mono text-slate-800">
                              {j.welderStamp}
                            </td>
                            <td className="py-2 px-3 text-slate-600 truncate max-w-[240px]">
                              {j.elem1Name || j.lrv1Code} + {j.elem2Name || j.lrv2Code}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px]">
                              <span className="font-semibold">{j.vikResult}</span>
                              {j.vikReportNumber && (
                                <span className="text-slate-500 ml-1">
                                  (№ {j.vikReportNumber} от {formatDateDDMMYY(j.vikDate)})
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px]">
                              <span
                                className={
                                  isDone
                                    ? j.ndtResult === 'Годен'
                                      ? 'text-emerald-700 font-bold'
                                      : 'text-rose-700 font-bold'
                                    : j.ndtResult === 'В работе'
                                    ? 'text-amber-700 font-semibold'
                                    : 'text-slate-500'
                                }
                              >
                                {j.ndtType}: {j.ndtResult}
                              </span>
                              {j.ndtReportNumber && (
                                <span className="text-slate-600 ml-1">
                                  · № {j.ndtReportNumber} от {formatDateDDMMYY(j.ndtDate)}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-slate-700">
                              {j.ndtInspector || j.vikInspector || '—'}
                            </td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => onOpenJointPassport(j)}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1e3799] hover:underline cursor-pointer"
                              >
                                <span>Паспорт</span>
                                <ExternalLink className="w-3 h-3" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
