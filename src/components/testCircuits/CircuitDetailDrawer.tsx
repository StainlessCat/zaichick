import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Edit3,
  ExternalLink,
  FileText,
  GitBranch,
  Link2,
  Search,
  Unlink,
  X,
} from 'lucide-react';
import type {
  RecordStatus,
  TestCircuitDetail,
  WeldJoint,
} from '../../types/welding';
import { RecordStatusActions, RecordStatusBadge } from '../RecordStatusControls';
import {
  CircuitTestStatusBadge,
  ReadinessMiniBar,
  SriStatusBadge,
} from './CircuitStatusBadges';

export interface CircuitDetailDrawerProps {
  isOpen: boolean;
  detail: TestCircuitDetail | null;
  loading?: boolean;
  canManage: boolean;
  allJoints: WeldJoint[];
  onClose: () => void;
  onEditCircuit: () => void;
  onOpenAssignModal: () => void;
  onChangeStatus: (targetStatus: RecordStatus, reason?: string) => Promise<void>;
  onUnassignJoints: (jointIds: string[]) => Promise<{ ok: boolean; error?: string }>;
  onOpenJointPassport: (joint: WeldJoint) => void;
}

type JointFilterMode = 'all' | 'welded' | 'unwelded' | 'defective';

export const CircuitDetailDrawer: React.FC<CircuitDetailDrawerProps> = ({
  isOpen,
  detail,
  loading = false,
  canManage,
  allJoints,
  onClose,
  onEditCircuit,
  onOpenAssignModal,
  onChangeStatus,
  onUnassignJoints,
  onOpenJointPassport,
}) => {
  const [search, setSearch] = useState('');
  const [jointFilter, setJointFilter] = useState<JointFilterMode>('all');
  const [selectedJointIds, setSelectedJointIds] = useState<string[]>([]);
  const [busyUnassign, setBusyUnassign] = useState(false);
  const [error, setError] = useState('');

  const fullJointMap = useMemo(() => {
    const map = new Map<string, WeldJoint>();
    for (const j of allJoints) map.set(j.id, j);
    return map;
  }, [allJoints]);

  const filteredJoints = useMemo(() => {
    if (!detail) return [];
    const q = search.trim().toLowerCase();
    return detail.joints.filter((j) => {
      if (jointFilter === 'welded' && !j.isWelded) return false;
      if (jointFilter === 'unwelded' && j.isWelded) return false;
      if (jointFilter === 'defective' && !j.hasUnresolvedDefect) return false;
      if (!q) return true;
      return (
        j.jointNumber.toLowerCase().includes(q) ||
        j.uniqueLineId.toLowerCase().includes(q) ||
        j.lineNumber.toLowerCase().includes(q) ||
        String(j.diameterMm).includes(q)
      );
    });
  }, [detail, jointFilter, search]);

  if (!isOpen || !detail) return null;

  const isMutable = detail.recordStatus === 'DRAFT';

  const handleToggleJoint = (id: string) => {
    setSelectedJointIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleUnassign = async (ids: string[]) => {
    if (ids.length === 0) return;
    setBusyUnassign(true);
    setError('');
    try {
      const res = await onUnassignJoints(ids);
      if (!res.ok) {
        setError(res.error || 'Не удалось отвязать стыки от контура.');
      } else {
        setSelectedJointIds((prev) => prev.filter((x) => !ids.includes(x)));
      }
    } finally {
      setBusyUnassign(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Паспорт контура ${detail.name}`}
    >
      <div
        className="fixed inset-0 bg-slate-900/45 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-4xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden">
        {/* Top Navy Header */}
        <div className="px-5 py-4 bg-[#1e3799] text-white shrink-0 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold truncate">{detail.name}</h2>
                <CircuitTestStatusBadge status={detail.testStatus} />
                <SriStatusBadge status={detail.sriStatus} />
                <RecordStatusBadge status={detail.recordStatus} />
              </div>
              <div className="text-xs text-sky-100/85 flex items-center gap-3 flex-wrap">
                <span>{detail.objectName || 'Объект строительства'}</span>
                {detail.sriName && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5 text-sky-200" />
                    <span>СРИ: {detail.sriName}</span>
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть панель контура"
              className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Dates & Act info */}
          <div className="flex items-center gap-4 flex-wrap text-[11px] text-sky-100/90 pt-1 border-t border-white/15">
            <span className="inline-flex items-center gap-1 font-mono">
              <Calendar className="w-3.5 h-3.5 text-sky-200" />
              <span>План: {detail.plannedDate || '—'}</span>
            </span>
            <span className="font-mono">
              Факт испытания: {detail.actualTestDate || '—'}
            </span>
            <span className="font-mono">
              Акт №: {detail.actNumber || '—'}
            </span>
          </div>
        </div>

        {/* Action Bar */}
        {((canManage && isMutable) || detail.recordStatus === 'LOCKED') && (
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap shrink-0">
            <RecordStatusActions
              status={detail.recordStatus}
              recordLabel={`Контур «${detail.name}»`}
              allowedDepartments={['PTO', 'SK']}
              onChangeStatus={onChangeStatus}
            />

            <div className="flex items-center gap-2 ml-auto">
              {canManage && isMutable && (
                <>
                  <button
                    type="button"
                    onClick={onOpenAssignModal}
                    className="h-8 px-3 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>Привязать линии и стыки</span>
                  </button>
                  <button
                    type="button"
                    onClick={onEditCircuit}
                    className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Редактировать</span>
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && (
            <div className="text-xs text-slate-500 font-medium">
              Обновление показателей контура...
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Готовность по стыкам
              </div>
              <ReadinessMiniBar
                percent={detail.weldingJointsPercent}
                primaryText={`${detail.weldedJoints} / ${detail.totalJoints} шт.`}
              />
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Нормативный d-inch
              </div>
              <ReadinessMiniBar
                percent={detail.weldingDInchPercent}
                primaryText={`${detail.weldedDInch.toFixed(1)} / ${detail.totalDInch.toFixed(1)}`}
              />
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Эквивалентный EDI
              </div>
              <ReadinessMiniBar
                percent={detail.weldingEdiPercent}
                primaryText={`${detail.weldedEdi.toFixed(1)} / ${detail.totalEdi.toFixed(1)}`}
              />
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Контроль дефектов
              </div>
              {detail.defectiveJointsCount === 0 ? (
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-sm pt-1">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Брака нет</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-red-700 font-bold text-sm pt-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Брак: {detail.defectiveJointsCount} стык.</span>
                </div>
              )}
              <div className="text-[10px] text-slate-500">
                Линий в составе: {detail.linesSummary.length}
              </div>
            </div>
          </div>

          {/* Lines Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-[#1e3799]" />
                <span>Линии в контуре</span>
              </h3>
              <span className="text-[11px] text-slate-500 font-mono">
                Всего линий: {detail.linesSummary.length}
              </span>
            </div>

            {detail.linesSummary.length === 0 ? (
              <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 text-center text-xs text-slate-500">
                В контур пока не включены стыки. Нажмите «Привязать линии и стыки» для формирования состава.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {detail.linesSummary.map((ls) => (
                  <div
                    key={ls.lineId || ls.uniqueLineId}
                    className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs ${
                      ls.isFullLine
                        ? 'bg-[#f0f5fc] border-[#1e3799]/25 text-[#1e3799]'
                        : 'bg-amber-50 border-amber-300 text-amber-950'
                    }`}
                  >
                    <span className="font-mono font-bold">{ls.uniqueLineId}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-white/80 font-mono tabular-nums">
                      {ls.isFullLine
                        ? `Вся линия · ${ls.assignedJointsCount}`
                        : `Частично · ${ls.assignedJointsCount} из ${ls.lineTotalJointsCount}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Bound Joints Table */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                Состав стыков контура
              </h3>
              {canManage && isMutable && selectedJointIds.length > 0 && (
                <button
                  type="button"
                  disabled={busyUnassign}
                  onClick={() => void handleUnassign(selectedJointIds)}
                  className="h-7 px-3 rounded-lg bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Исключить выбранные: {selectedJointIds.length}</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск стыка по номеру, линии или диаметру..."
                  className="w-full h-8 pl-8 pr-3 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:outline-none focus:bg-white focus:border-[#1e3799]"
                />
              </div>

              <div className="inline-flex rounded-lg border border-slate-300 bg-white overflow-hidden text-[11px] font-semibold">
                {(
                  [
                    ['all', 'Все'],
                    ['welded', 'Сварено'],
                    ['unwelded', 'Не сварено'],
                    ['defective', 'Брак'],
                  ] as [JointFilterMode, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setJointFilter(val)}
                    className={`px-2.5 h-8 transition-colors cursor-pointer ${
                      jointFilter === val
                        ? 'bg-[#1e3799] text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    {canManage && isMutable && (
                      <th className="w-9 px-2.5 py-2 text-center">Выбор</th>
                    )}
                    <th className="px-3 py-2">Линия</th>
                    <th className="px-3 py-2">Стык №</th>
                    <th className="px-3 py-2">Размер, мм</th>
                    <th className="px-3 py-2 text-right">d-inch</th>
                    <th className="px-3 py-2 text-right">EDI</th>
                    <th className="px-3 py-2">Сварка</th>
                    <th className="px-3 py-2">ВИК / НК</th>
                    <th className="px-3 py-2 text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredJoints.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canManage && isMutable ? 9 : 8}
                        className="px-4 py-8 text-center text-xs text-slate-500"
                      >
                        Нет стыков по текущему фильтру.
                      </td>
                    </tr>
                  ) : (
                    filteredJoints.map((j) => {
                      const fullJoint = fullJointMap.get(j.id);
                      const checked = selectedJointIds.includes(j.id);
                      return (
                        <tr
                          key={j.id}
                          className={`transition-colors ${
                            j.hasUnresolvedDefect
                              ? 'bg-red-50/40 hover:bg-red-50/70'
                              : checked
                                ? 'bg-[#f0f5fc]'
                                : 'hover:bg-slate-50'
                          }`}
                        >
                          {canManage && isMutable && (
                            <td className="px-2.5 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => handleToggleJoint(j.id)}
                                className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
                              />
                            </td>
                          )}
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                            {j.uniqueLineId}
                          </td>
                          <td className="px-3 py-2 font-mono font-bold text-slate-900 whitespace-nowrap">
                            {j.jointNumber}
                          </td>
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-600 tabular-nums whitespace-nowrap">
                            Ø{j.diameterMm} × {j.wallThickness}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                            {j.dInch.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                            {j.edi.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]">
                            {j.isWelded ? (
                              <span className="text-emerald-700 font-semibold">
                                {j.weldingDate}
                              </span>
                            ) : (
                              <span className="text-slate-400">Не сварен</span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-[11px]">
                            {j.hasUnresolvedDefect ? (
                              <span className="inline-flex items-center gap-1 text-red-700 font-bold">
                                <AlertTriangle className="w-3 h-3" />
                                <span>Брак</span>
                              </span>
                            ) : (
                              <span className="text-slate-600">
                                {j.vikResult} / {j.ndtResult}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {fullJoint && (
                                <button
                                  type="button"
                                  onClick={() => onOpenJointPassport(fullJoint)}
                                  title="Открыть паспорт стыка"
                                  className="p-1.5 rounded-md text-slate-500 hover:text-[#1e3799] hover:bg-slate-100 cursor-pointer"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canManage && isMutable && (
                                <button
                                  type="button"
                                  disabled={busyUnassign}
                                  onClick={() => void handleUnassign([j.id])}
                                  title="Исключить стык из контура"
                                  className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-40"
                                >
                                  <Unlink className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
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
      </div>
    </div>
  );
};
