import React, { useMemo } from 'react';
import {
  AlertTriangle,
  Clock,
  FileWarning,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import type { ReadinessSummaryRow } from '../../types/welding';
import {
  matchesContourQuickFilter,
  type ContourQuickFilterId,
} from '../../utils/analyticsCharts';

interface ContourBlockersBarProps {
  rows: ReadinessSummaryRow[];
  activeFilter: ContourQuickFilterId;
  onChangeFilter: (next: ContourQuickFilterId) => void;
}

export const ContourBlockersBar: React.FC<ContourBlockersBarProps> = ({
  rows,
  activeFilter,
  onChangeFilter,
}) => {
  const counts = useMemo(() => {
    return {
      all: rows.length,
      allowed: rows.filter((r) => matchesContourQuickFilter(r, 'allowed')).length,
      welding_done_id_pending: rows.filter((r) =>
        matchesContourQuickFilter(r, 'welding_done_id_pending')
      ).length,
      has_repairs: rows.filter((r) => matchesContourQuickFilter(r, 'has_repairs')).length,
      in_work: rows.filter((r) => matchesContourQuickFilter(r, 'in_work')).length,
    };
  }, [rows]);

  const items: {
    id: ContourQuickFilterId;
    label: string;
    count: number;
    icon: React.ReactNode;
    activeClass: string;
    idleClass: string;
  }[] = [
    {
      id: 'all',
      label: 'Все контуры',
      count: counts.all,
      icon: null,
      activeClass: 'bg-[#1e3799] text-white border-[#1e3799]',
      idleClass: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
    },
    {
      id: 'allowed',
      label: 'Допущены к испытаниям',
      count: counts.allowed,
      icon: <ShieldCheck className="w-3.5 h-3.5" />,
      activeClass: 'bg-emerald-700 text-white border-emerald-700',
      idleClass: 'bg-emerald-50/70 text-emerald-800 border-emerald-200 hover:bg-emerald-100/70',
    },
    {
      id: 'welding_done_id_pending',
      label: 'Сварка готова — ждёт ИД',
      count: counts.welding_done_id_pending,
      icon: <FileWarning className="w-3.5 h-3.5" />,
      activeClass: 'bg-amber-600 text-white border-amber-600',
      idleClass: 'bg-amber-50/80 text-amber-900 border-amber-200 hover:bg-amber-100/80',
    },
    {
      id: 'has_repairs',
      label: 'Есть ремонты',
      count: counts.has_repairs,
      icon: <Wrench className="w-3.5 h-3.5" />,
      activeClass: 'bg-rose-700 text-white border-rose-700',
      idleClass: 'bg-rose-50/80 text-rose-800 border-rose-200 hover:bg-rose-100/80',
    },
    {
      id: 'in_work',
      label: 'В работе',
      count: counts.in_work,
      icon: <Clock className="w-3.5 h-3.5" />,
      activeClass: 'bg-slate-800 text-white border-slate-800',
      idleClass: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100',
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-2xs flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((item) => {
          const isActive = activeFilter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChangeFilter(item.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                isActive ? item.activeClass : item.idleClass
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
              <span
                className={`px-1.5 py-0 rounded text-[10px] font-bold tabular-nums ${
                  isActive ? 'bg-white/20 text-white' : 'bg-black/5 text-current'
                }`}
              >
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {counts.welding_done_id_pending > 0 && (
        <div className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-800">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>
            Контуров с готовой сваркой, ожидающих подписание ИД:{' '}
            <strong>{counts.welding_done_id_pending}</strong>
          </span>
        </div>
      )}
    </div>
  );
};
