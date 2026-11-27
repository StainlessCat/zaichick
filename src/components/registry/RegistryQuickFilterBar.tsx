import React from 'react';
import {
  AlertTriangle,
  Copy,
  Flame,
  Layers,
  Send,
  Wrench,
} from 'lucide-react';
import {
  RegistryQuickFilter,
  RegistryQuickFilterCounts,
} from '../../utils/filters';

export interface RegistryQuickFilterBarProps {
  quickFilter: RegistryQuickFilter;
  onQuickFilterChange: (next: RegistryQuickFilter) => void;
  counts: RegistryQuickFilterCounts;
}

interface QuickFilterTabItem {
  id: RegistryQuickFilter;
  label: string;
  count: number;
  icon: React.ReactNode;
  accent?: 'default' | 'amber' | 'rose' | 'sky';
}

export const RegistryQuickFilterBar: React.FC<RegistryQuickFilterBarProps> = ({
  quickFilter,
  onQuickFilterChange,
  counts,
}) => {
  const items: QuickFilterTabItem[] = [
    {
      id: 'all',
      label: 'Все',
      count: counts.all,
      icon: <Layers className="w-3.5 h-3.5 shrink-0" />,
      accent: 'default',
    },
    {
      id: 'unwelded',
      label: 'Не сварены',
      count: counts.unwelded,
      icon: <Flame className="w-3.5 h-3.5 shrink-0" />,
      accent: 'default',
    },
    {
      id: 'ready_for_lab',
      label: 'Готовы к ЛНК',
      count: counts.ready_for_lab,
      icon: <Send className="w-3.5 h-3.5 shrink-0" />,
      accent: 'sky',
    },
    {
      id: 'incomplete',
      label: 'Неполный паспорт',
      count: counts.incomplete,
      icon: <AlertTriangle className="w-3.5 h-3.5 shrink-0" />,
      accent: 'amber',
    },
    {
      id: 'in_repair',
      label: 'В ремонте',
      count: counts.in_repair,
      icon: <Wrench className="w-3.5 h-3.5 shrink-0" />,
      accent: 'amber',
    },
    {
      id: 'duplicates',
      label: 'Дубли',
      count: counts.duplicates,
      icon: <Copy className="w-3.5 h-3.5 shrink-0" />,
      accent: 'rose',
    },
  ];

  return (
    <div
      role="tablist"
      aria-label="Быстрые фильтры реестра стыков"
      className="bg-white rounded-xl border border-slate-200 px-2.5 py-1.5 shadow-2xs flex flex-wrap items-center gap-1.5"
    >
      {items.map((item) => {
        const isActive = quickFilter === item.id;
        const hasAlertCount =
          item.count > 0 && (item.id === 'duplicates' || item.id === 'in_repair');

        let activeClass = 'bg-[#1e3799] text-white border-[#1e3799] shadow-2xs';
        let inactiveClass =
          'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:text-slate-900';
        let countClass = isActive
          ? 'bg-white/20 text-white'
          : 'bg-white text-slate-600 border border-slate-200';

        if (!isActive && item.accent === 'rose' && item.count > 0) {
          inactiveClass =
            'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100';
          countClass = 'bg-rose-100 text-rose-900 border border-rose-300';
        } else if (!isActive && item.accent === 'amber' && hasAlertCount) {
          inactiveClass =
            'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100';
          countClass = 'bg-amber-100 text-amber-950 border border-amber-300';
        } else if (!isActive && item.accent === 'sky' && item.count > 0) {
          inactiveClass =
            'bg-sky-50/70 text-[#1e3799] border-sky-200 hover:bg-sky-100/80';
          countClass = 'bg-white text-[#1e3799] border border-sky-200';
        }

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onQuickFilterChange(item.id)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
              isActive ? activeClass : inactiveClass
            }`}
          >
            {item.icon}
            <span>{item.label}</span>
            <span
              className={`ml-0.5 px-1.5 py-0.2 rounded text-[11px] font-mono tabular-nums font-bold ${countClass}`}
            >
              {item.count}
            </span>
          </button>
        );
      })}
    </div>
  );
};
