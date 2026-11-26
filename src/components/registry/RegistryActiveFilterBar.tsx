import React from 'react';
import { AlertTriangle, Calendar, Filter, RotateCcw } from 'lucide-react';
import { FIELD_LABELS_MAP, formatDateDDMMYY } from '../../utils/weldingLogic';
import { WeldJointFieldKey } from '../../types/welding';
import { RegistryActiveFilterBarProps } from './types';

export const RegistryActiveFilterBar: React.FC<RegistryActiveFilterBarProps> = ({
  weldingDateFrom,
  weldingDateTo,
  onResetDateRange,
  onlyActiveRepairs = false,
  onResetActiveRepairs,
  activeFilterKeys,
  columnFilters,
  onSetColumnFilter,
  selectedJointIdsCount,
  onClearSelection,
  onResetAllFilters,
}) => {
  const hasFilters =
    activeFilterKeys.length > 0 ||
    Boolean(weldingDateFrom) ||
    Boolean(weldingDateTo) ||
    onlyActiveRepairs;

  if (!hasFilters && selectedJointIdsCount === 0) {
    return null;
  }

  return (
    <div className="bg-[#f0f5fc] border border-sky-200 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-semibold text-[#1e3799]">
          Активные фильтры:
        </span>
        {onlyActiveRepairs && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-900 font-semibold">
            <AlertTriangle className="w-3 h-3 text-amber-700" />
            <span>Только в ремонте</span>
            {onResetActiveRepairs && (
              <button
                type="button"
                onClick={onResetActiveRepairs}
                aria-label="Сбросить фильтр по ремонту"
                className="text-amber-600 hover:text-red-600 font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </span>
        )}
        {(weldingDateFrom || weldingDateTo) && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white border border-sky-300 text-[#1e3799] font-medium">
            <Calendar className="w-3 h-3" />
            <span>
              Дата сварки:{' '}
              {weldingDateFrom
                ? `с ${formatDateDDMMYY(weldingDateFrom)}`
                : ''}{' '}
              {weldingDateTo
                ? `по ${formatDateDDMMYY(weldingDateTo)}`
                : ''}
            </span>
            <button
              type="button"
              onClick={onResetDateRange}
              aria-label="Сбросить фильтр по дате сварки"
              className="text-slate-400 hover:text-red-600 font-bold cursor-pointer"
            >
              ✕
            </button>
          </span>
        )}
        {activeFilterKeys.map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-white border border-sky-300 text-[#1e3799] font-medium"
          >
            <Filter className="w-3 h-3" />
            <span>
              {FIELD_LABELS_MAP[k] || k}: {columnFilters[k]?.length} знач.
            </span>
            <button
              type="button"
              onClick={() => onSetColumnFilter(k as WeldJointFieldKey, undefined)}
              aria-label={`Сбросить фильтр по колонке ${FIELD_LABELS_MAP[k] || k}`}
              className="text-slate-400 hover:text-red-600 font-bold cursor-pointer"
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <div className="flex items-center gap-3">
        {selectedJointIdsCount > 0 && (
          <button
            type="button"
            onClick={onClearSelection}
            className="text-slate-600 hover:text-slate-900 underline font-medium cursor-pointer"
          >
            Снять выделение ({selectedJointIdsCount})
          </button>
        )}
        {hasFilters && (
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
