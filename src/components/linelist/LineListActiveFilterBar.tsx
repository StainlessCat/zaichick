import React from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import { LineListColumnKey } from '../../types/welding';

interface LineListActiveFilterBarProps {
  selectedLineIdsCount: number;
  activeFilterKeys: LineListColumnKey[];
  columnFilters: Partial<Record<LineListColumnKey, string[]>>;
  columnLabelMap: Record<string, string>;
  onRemoveColumnFilter: (key: LineListColumnKey) => void;
  onClearSelection: () => void;
  onResetAllFilters: () => void;
}

export const LineListActiveFilterBar: React.FC<LineListActiveFilterBarProps> = ({
  selectedLineIdsCount,
  activeFilterKeys,
  columnFilters,
  columnLabelMap,
  onRemoveColumnFilter,
  onClearSelection,
  onResetAllFilters,
}) => {
  if (activeFilterKeys.length === 0 && selectedLineIdsCount === 0) {
    return null;
  }

  return (
    <div className="bg-[#e8f1fc] rounded-xl border border-sky-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {selectedLineIdsCount > 0 && (
          <span className="font-bold text-[#1e3799]">
            Выделено строк лайнлиста: {selectedLineIdsCount} шт.
          </span>
        )}
        {activeFilterKeys.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white border border-sky-300 text-[#1e3799] font-medium"
          >
            <Filter className="w-3 h-3" />
            <span>
              {columnLabelMap[k]}: {columnFilters[k]?.length} знач.
            </span>
            <button
              type="button"
              onClick={() => onRemoveColumnFilter(k)}
              className="text-slate-400 hover:text-red-600 font-bold cursor-pointer"
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {selectedLineIdsCount > 0 && (
          <button
            type="button"
            onClick={onClearSelection}
            className="text-slate-600 hover:text-slate-900 underline font-medium cursor-pointer"
          >
            Снять выделение
          </button>
        )}
        {activeFilterKeys.length > 0 && (
          <button
            type="button"
            onClick={onResetAllFilters}
            className="inline-flex items-center gap-1 text-[#1e3799] hover:underline font-semibold cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сбросить все фильтры</span>
          </button>
        )}
      </div>
    </div>
  );
};
