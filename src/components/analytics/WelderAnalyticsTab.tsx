import React, { useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  ExternalLink,
  Search,
  ShieldAlert,
  Users,
  X,
} from 'lucide-react';
import type { ProjectLineItem, WeldJoint, WelderProfile } from '../../types/welding';
import { formatDateDDMMYY } from '../../utils/formatting';
import {
  buildWelderAnalyticsRows,
  type WelderAnalyticsRow,
} from '../../utils/analyticsCharts';

interface WelderAnalyticsTabProps {
  joints: WeldJoint[];
  lines: ProjectLineItem[];
  welders: WelderProfile[];
  onFilterByWelderStamp: (stamp: string) => void;
}

type StatusFilter = 'all' | 'non_compliant' | 'penalty' | 'compliant';
type SortKey =
  | 'stamp'
  | 'fullName'
  | 'totalWelded'
  | 'weldedEdi'
  | 'inspectedCount'
  | 'defectCount'
  | 'defectRatePct'
  | 'actualNdtPct'
  | 'penaltyRequiredJoints';

const STATUS_LABELS: Record<WelderAnalyticsRow['status'], string> = {
  compliant: 'Норма выполнена',
  warning: 'Ниже плана НК',
  penalty_required: 'Штрафной контроль',
  critical: 'Нет контроля НК',
};

const STATUS_STYLES: Record<WelderAnalyticsRow['status'], string> = {
  compliant: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  penalty_required: 'bg-rose-50 text-rose-800 border-rose-200',
  critical: 'bg-rose-100 text-rose-900 border-rose-300',
};

export const WelderAnalyticsTab: React.FC<WelderAnalyticsTabProps> = ({
  joints,
  lines,
  welders,
  onFilterByWelderStamp,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    direction: 'asc' | 'desc';
  }>({ key: 'totalWelded', direction: 'desc' });

  const allRows = useMemo(
    () => buildWelderAnalyticsRows(joints, lines, welders),
    [joints, lines, welders]
  );

  const summary = useMemo(() => {
    const activeWelders = allRows.length;
    const totalWelded = allRows.reduce((acc, r) => acc + r.totalWelded, 0);
    const totalEdi = Math.round(allRows.reduce((acc, r) => acc + r.weldedEdi, 0) * 10) / 10;
    const totalInspected = allRows.reduce((acc, r) => acc + r.inspectedCount, 0);
    const totalDefects = allRows.reduce((acc, r) => acc + r.defectCount, 0);
    const avgDefectPct =
      totalInspected > 0 ? Math.round((totalDefects / totalInspected) * 1000) / 10 : 0;
    const nonCompliantCount = allRows.filter((r) => !r.isCompliant).length;
    const totalPenaltyJoints = allRows.reduce((acc, r) => acc + r.penaltyRequiredJoints, 0);
    return {
      activeWelders,
      totalWelded,
      totalEdi,
      avgDefectPct,
      nonCompliantCount,
      totalPenaltyJoints,
    };
  }, [allRows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = allRows.filter((r) => {
      if (statusFilter === 'non_compliant' && r.isCompliant) return false;
      if (statusFilter === 'penalty' && r.status !== 'penalty_required') return false;
      if (statusFilter === 'compliant' && !r.isCompliant) return false;
      if (q) {
        const hay = `${r.stamp} ${r.fullName} ${r.details}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortConfig.key === 'stamp' || sortConfig.key === 'fullName') {
        return a[sortConfig.key].localeCompare(b[sortConfig.key], 'ru') * dir;
      }
      return (a[sortConfig.key] - b[sortConfig.key]) * dir;
    });
  }, [allRows, searchQuery, statusFilter, sortConfig]);

  const toggleSort = (key: SortKey) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' }
    );
  };

  return (
    <div className="space-y-3">
      {/* Сводные KPI по сварщикам */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-[#1e3799]" />
            <span>Активных сварщиков</span>
          </div>
          <div className="text-xl font-extrabold text-slate-900 mt-1 tabular-nums">
            {summary.activeWelders}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Выработка: {summary.totalWelded} стыков · {summary.totalEdi} EDI
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Средний процент брака</span>
          </div>
          <div
            className={`text-xl font-extrabold mt-1 tabular-nums ${
              summary.avgDefectPct > 5 ? 'text-rose-700' : 'text-slate-900'
            }`}
          >
            {summary.avgDefectPct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            По проконтролированным стыкам
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
            <span>Нарушения квот НК</span>
          </div>
          <div
            className={`text-xl font-extrabold mt-1 tabular-nums ${
              summary.nonCompliantCount > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {summary.nonCompliantCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            По нормативу СТО Газпром 15-1.3-004-2023
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 px-3.5 py-2.5 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 flex items-center gap-1.5">
            <AlertOctagon className="w-3.5 h-3.5 text-amber-700" />
            <span>Штрафной контроль НК</span>
          </div>
          <div
            className={`text-xl font-extrabold mt-1 tabular-nums ${
              summary.totalPenaltyJoints > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            +{summary.totalPenaltyJoints}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            Дополнительных стыков при браке
          </div>
        </div>
      </div>

      {/* Панель поиска и фильтра статуса */}
      <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: 'Все сварщики', count: allRows.length },
              {
                id: 'non_compliant',
                label: 'Нарушения квот',
                count: allRows.filter((r) => !r.isCompliant).length,
              },
              {
                id: 'penalty',
                label: 'Штрафной контроль',
                count: allRows.filter((r) => r.status === 'penalty_required').length,
              },
              {
                id: 'compliant',
                label: 'Норма выполнена',
                count: allRows.filter((r) => r.isCompliant).length,
              },
            ] as { id: StatusFilter; label: string; count: number }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setStatusFilter(f.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                statusFilter === f.id
                  ? 'bg-[#1e3799] text-white border-[#1e3799]'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{f.label}</span>
              <span
                className={`px-1.5 py-0 rounded text-[10px] font-bold ${
                  statusFilter === f.id
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                {f.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative min-w-[210px] max-w-xs flex-1 sm:flex-none">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по клейму или Ф.И.О."
            className="w-full h-8 pl-8 pr-7 rounded-md border border-slate-300 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Очистить поиск"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Таблица выработки и квот НК */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-bold">
              <th className="px-3 py-2.5 text-left whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('stamp')}
                  className="inline-flex items-center gap-1 hover:text-[#1e3799] cursor-pointer"
                >
                  Клеймо <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('fullName')}
                  className="inline-flex items-center gap-1 hover:text-[#1e3799] cursor-pointer"
                >
                  Ф.И.О. сварщика <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('totalWelded')}
                  className="inline-flex items-center gap-1 hover:text-[#1e3799] cursor-pointer"
                >
                  Сварено <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('weldedEdi')}
                  className="inline-flex items-center gap-1 hover:text-[#1e3799] cursor-pointer"
                >
                  Выработка, EDI <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('inspectedCount')}
                  className="inline-flex items-center gap-1 hover:text-[#1e3799] cursor-pointer"
                >
                  Контроль НК <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('defectCount')}
                  className="inline-flex items-center gap-1 hover:text-[#1e3799] cursor-pointer"
                >
                  Брак <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('actualNdtPct')}
                  className="inline-flex items-center gap-1 hover:text-[#1e3799] cursor-pointer"
                >
                  Факт / План НК <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort('penaltyRequiredJoints')}
                  className="inline-flex items-center gap-1 hover:text-[#1e3799] cursor-pointer"
                >
                  Штраф НК <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-3 py-2.5 text-left whitespace-nowrap">Статус квоты</th>
              <th className="px-3 py-2.5 text-right whitespace-nowrap">Реестр</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400">
                  Нет данных по сварщикам для выбранных фильтров.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr
                  key={row.stamp}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="px-3 py-2 font-mono font-bold text-[#1e3799] whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onFilterByWelderStamp(row.stamp)}
                      className="hover:underline cursor-pointer"
                      title="Открыть стыки сварщика в реестре"
                    >
                      {row.stamp}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-slate-800">
                    <div className="font-medium">{row.fullName || 'Не указано'}</div>
                    {row.lastWeldingDate && (
                      <div className="text-[10px] text-slate-400">
                        Последняя сварка: {formatDateDDMMYY(row.lastWeldingDate)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="font-bold text-slate-900">{row.totalWelded}</div>
                    <div className="text-[10px] text-emerald-700">
                      принято: {row.acceptedCount}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-800 tabular-nums">
                    {row.weldedEdi}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="font-semibold text-slate-800">{row.inspectedCount}</div>
                    <div className="text-[10px] text-slate-500">годных: {row.passedCount}</div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.defectCount > 0 ? (
                      <div>
                        <span className="font-bold text-rose-700">{row.defectCount}</span>
                        <div className="text-[10px] text-rose-600">{row.defectRatePct}%</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span
                      className={`font-bold ${
                        row.actualNdtPct < row.requiredNdtPct
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {row.actualNdtPct}%
                    </span>
                    <span className="text-slate-400"> / {row.requiredNdtPct}%</span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.penaltyRequiredJoints > 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-bold">
                        +{row.penaltyRequiredJoints}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-w-[260px]">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-semibold ${STATUS_STYLES[row.status]}`}
                      title={row.details}
                    >
                      {row.status === 'compliant' ? (
                        <CheckCircle2 className="w-3 h-3 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                      )}
                      <span>{STATUS_LABELS[row.status]}</span>
                    </span>
                    {!row.isCompliant && (
                      <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">
                        {row.details}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onFilterByWelderStamp(row.stamp)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-[#1e3799] cursor-pointer"
                    >
                      <span>Стыки</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
