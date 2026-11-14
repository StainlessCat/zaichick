import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { RegistryFooterProps } from './types';

export const RegistryFooter: React.FC<RegistryFooterProps> = ({
  filteredCount,
  totalCount,
  activeTemplateName = 'Пользовательский',
  selectedCount,
}) => {
  return (
    <div className="px-4 py-2.5 bg-[#f8fafd] border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <div>
        Отображено стыков:{' '}
        <span className="font-mono font-bold text-slate-800">
          {filteredCount}
        </span>{' '}
        из <span className="font-mono">{totalCount}</span> · Активный шаблон:{' '}
        <span className="font-semibold text-[#1e3799]">
          {activeTemplateName}
        </span>
        {selectedCount > 0 && (
          <span className="ml-2 font-semibold text-slate-800">
            · Выделено: <span className="font-mono">{selectedCount}</span>
          </span>
        )}
      </div>
      <div className="flex items-center gap-4 text-[11px] text-slate-400">
        <span>Клик по номеру — открыть паспорт стыка</span>
        <span>Двойной клик по разделителю — автоширина</span>
        <span className="hidden sm:inline-flex items-center gap-1 text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>СТО Газпром / ГОСТ 32569-2013</span>
        </span>
      </div>
    </div>
  );
};
