import React from 'react';
import {
  ClipboardCheck,
  ExternalLink,
  FilePlus2,
  Play,
  Trash2,
} from 'lucide-react';
import {
  NdtLabRequest,
  NdtLabRequestStatus,
  WeldJoint,
} from '../../types/welding';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import {
  getRequestMethodsList,
  isJointConclusionCompletedForRequest,
} from '../../utils/laboratoryLogic';
import { LabMarkingCell } from './LabMarkingCell';

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
  jointsById: Map<string, WeldJoint>;
  canDeleteRequest?: boolean;
  canAcceptRequest?: boolean;
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
  jointsById,
  canDeleteRequest,
  canAcceptRequest = true,
  onOpenCreateRequestModal,
  onAcceptRequestClick,
  onDeleteRequestClick,
  onOpenRequestInConclusions,
  onOpenJointPassport,
}) => {
  return (
    <div className="space-y-3">
      {/* Панель фильтрации заявок */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'ALL', label: 'Все заявки', count: requestCounts.total },
              { id: 'Подана ПТО', label: 'Новые от ПТО', count: requestCounts.submitted },
              { id: 'В работе ЛНК', label: 'В работе ЛНК', count: requestCounts.inWork },
              { id: 'Выполнена', label: 'Выполнены', count: requestCounts.completed },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setRequestStatusFilter(tab.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                requestStatusFilter === tab.id
                  ? 'bg-[#1e3799] text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded font-mono text-[10px] ${
                  requestStatusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {filteredRequests.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
          <div className="text-sm font-semibold text-slate-700">
            Заявки в ЛНК по выбранному фильтру отсутствуют
          </div>
          <button
            type="button"
            onClick={onOpenCreateRequestModal}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1e3799] text-white text-xs font-semibold cursor-pointer"
          >
            <FilePlus2 className="w-4 h-4" />
            <span>Создать заявку в ЛНК</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map((req) => {
            const reqMethods = getRequestMethodsList(req);
            const reqJoints = req.jointIds
              .map((id) => jointsById.get(id))
              .filter((j): j is WeldJoint => Boolean(j));
            const completedCount = reqJoints.filter((j) =>
              isJointConclusionCompletedForRequest(j, req.controlStage, reqMethods)
            ).length;

            return (
              <div
                key={req.id}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden"
              >
                {/* Верхняя строка карточки пакетной заявки */}
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-sm text-[#1e3799]">
                        {req.requestNumber}
                      </span>
                      <span className="text-slate-400">·</span>
                      <span className="font-semibold text-slate-800">
                        {req.status}
                      </span>
                      <span className="text-slate-400">·</span>
                      <div className="inline-flex flex-wrap items-center gap-1">
                        {reqMethods.map((m) => (
                          <span
                            key={m}
                            className="px-1.5 py-0.5 rounded bg-blue-50 border border-sky-200 font-mono text-[10px] font-bold text-[#1e3799]"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                      <span className="text-slate-500 text-[11px]">{req.controlStage}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono text-slate-700">
                        {req.rdCode} / {req.lineNumber}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Подал: <strong>{req.createdBy}</strong> · {req.createdAt}
                      {req.acceptedBy && (
                        <>
                          {' '}
                          · Принял: <strong>{req.acceptedBy}</strong> · {req.acceptedAt}
                        </>
                      )}
                      {req.notes && <> · {req.notes}</>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono tabular-nums text-slate-700 mr-1">
                      Заключения:{' '}
                      <strong>
                        {completedCount}/{reqJoints.length}
                      </strong>
                    </span>

                    {req.status === 'Подана ПТО' && (
                      <button
                        type="button"
                        disabled={!canAcceptRequest}
                        onClick={() => onAcceptRequestClick(req)}
                        title={
                          !canAcceptRequest
                            ? 'Для приёмки заявки в работу требуется роль дефектоскописта ЛНК'
                            : undefined
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>Принять в работу</span>
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
                          ? 'Просмотреть заключения'
                          : 'Оформить заключения'}
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

                {/* Таблица стыков внутри пакетной заявки */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#1e3799] text-white select-none text-xs font-semibold shadow-xs">
                        <th className="py-2 px-3 border-r border-white/15">№ стыка</th>
                        <th className="py-2 px-3 border-r border-white/15">Маркировка стыка</th>
                        <th className="py-2 px-3 border-r border-white/15">Линия</th>
                        <th className="py-2 px-3 border-r border-white/15">Типоразмер</th>
                        <th className="py-2 px-3 border-r border-white/15">Дата сварки</th>
                        <th className="py-2 px-3 border-r border-white/15">Клеймо</th>
                        <th className="py-2 px-3 border-r border-white/15">Заключения по методам</th>
                        <th className="py-2 px-3 border-r border-white/15">Дефектоскопист</th>
                        <th className="py-2 px-3 text-right">Паспорт</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reqJoints.map((j) => {
                        return (
                          <tr key={j.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono font-bold text-[#1e3799]">
                              {j.jointNumber}
                            </td>
                            <td className="py-2 px-3">
                              <LabMarkingCell joint={j} compact />
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
                            <td className="py-2 px-3">
                              <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                                {reqMethods.map((m) => {
                                  const lcEntry = j.labConclusions?.[m];
                                  const res =
                                    lcEntry?.result ??
                                    (m === 'ВИК'
                                      ? j.vikResult
                                      : j.ndtType === m
                                      ? j.ndtResult
                                      : 'Не проводился');
                                  const num =
                                    lcEntry?.reportNumber ??
                                    (m === 'ВИК'
                                      ? j.vikReportNumber
                                      : j.ndtType === m
                                      ? j.ndtReportNumber
                                      : '');
                                  const badgeColor =
                                    res === 'Годен'
                                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                      : res === 'Ремонт' || res === 'Вырезать'
                                      ? 'bg-rose-50 border-rose-200 text-rose-800'
                                      : res === 'В работе'
                                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                                      : 'bg-slate-50 border-slate-200 text-slate-500';
                                  return (
                                    <span
                                      key={m}
                                      className={`px-1.5 py-0.5 rounded border ${badgeColor}`}
                                      title={num ? `№ ${num}` : undefined}
                                    >
                                      {m}: {res}
                                      {num ? ` · ${num}` : ''}
                                    </span>
                                  );
                                })}
                              </div>
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
