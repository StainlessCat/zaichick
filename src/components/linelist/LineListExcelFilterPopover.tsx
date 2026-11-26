import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownAZ, ArrowUpAZ, Check, Search, X } from 'lucide-react';
import { formatDateDDMMYY } from '../../utils/weldingLogic';
import { LineListExcelFilterPopoverProps } from './types';

export const LineListExcelFilterPopover: React.FC<LineListExcelFilterPopoverProps> = ({
  column,
  uniqueValues,
  selectedValues,
  onApplyFilter,
  sortConfig,
  onSort,
  onClose,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [searchText, setSearchText] = useState('');
  const allPossibleValues = useMemo(
    () => uniqueValues.map((u) => u.value),
    [uniqueValues]
  );

  const [checkedSet, setCheckedSet] = useState<Set<string>>(() => {
    if (!selectedValues) return new Set(allPossibleValues);
    return new Set(selectedValues);
  });

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
        searchInputRef.current.select();
      }
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [onClose]);

  const formatOptionLabel = (val: string) => {
    if (val === '') return 'Пустые ячейки';
    if (column.key === 'testDate') return formatDateDDMMYY(val) || val;
    if (
      column.key === 'rkPercent' ||
      column.key === 'uzkPercent' ||
      column.key === 'pvkPercent'
    ) {
      return `${val}%`;
    }
    return val;
  };

  const filteredOptions = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return uniqueValues;
    return uniqueValues.filter((item) => {
      const display = formatOptionLabel(item.value);
      return (
        display.toLowerCase().includes(q) || item.value.toLowerCase().includes(q)
      );
    });
  }, [uniqueValues, searchText, column.key]);

  const areAllFilteredChecked =
    filteredOptions.length > 0 &&
    filteredOptions.every((opt) => checkedSet.has(opt.value));

  const toggleAllFiltered = () => {
    const next = new Set(checkedSet);
    if (areAllFilteredChecked) {
      for (const opt of filteredOptions) next.delete(opt.value);
    } else {
      for (const opt of filteredOptions) next.add(opt.value);
    }
    setCheckedSet(next);
  };

  const toggleSingleValue = (val: string) => {
    const next = new Set(checkedSet);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    setCheckedSet(next);
  };

  const handleApply = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchText.trim() !== '' && checkedSet.size === allPossibleValues.length) {
      onApplyFilter(
        column.key,
        filteredOptions.map((o) => o.value)
      );
      onClose();
      return;
    }
    if (checkedSet.size === allPossibleValues.length) {
      onApplyFilter(column.key, undefined);
    } else {
      onApplyFilter(column.key, Array.from(checkedSet));
    }
    onClose();
  };

  const isSortedAsc =
    sortConfig?.key === column.key && sortConfig?.direction === 'asc';
  const isSortedDesc =
    sortConfig?.key === column.key && sortConfig?.direction === 'desc';

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={`Фильтр столбца ${column.label}`}
      onClick={(e) => e.stopPropagation()}
      className="absolute left-0 top-full mt-1 w-72 bg-white text-slate-800 rounded-lg shadow-xl border border-slate-300 z-40 font-normal text-xs select-none"
    >
      <div className="flex items-center justify-between px-3 py-2 bg-[#f0f5fc] border-b border-slate-200 rounded-t-lg">
        <span className="font-semibold text-[#1e3799] truncate" title={column.label}>
          {column.label}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть фильтр"
          className="p-0.5 text-slate-400 hover:text-slate-700 rounded"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-1.5 border-b border-slate-200">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => {
              onSort(column.key, 'asc');
              onClose();
            }}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-left transition-colors ${
              isSortedAsc
                ? 'bg-[#1e3799] text-white font-medium'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <ArrowUpAZ className="w-3.5 h-3.5 shrink-0" />
            <span>По возрастанию</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onSort(column.key, 'desc');
              onClose();
            }}
            className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-left transition-colors ${
              isSortedDesc
                ? 'bg-[#1e3799] text-white font-medium'
                : 'hover:bg-slate-100 text-slate-700'
            }`}
          >
            <ArrowDownAZ className="w-3.5 h-3.5 shrink-0" />
            <span>По убыванию</span>
          </button>
        </div>
      </div>

      <form onSubmit={handleApply} className="p-2.5 space-y-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-[#1e3799] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            autoFocus
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Поиск значений..."
            aria-label={`Поиск значений в столбце ${column.label}`}
            className="w-full pl-8 pr-7 py-1.5 bg-sky-50/60 border border-[#1e3799]/40 rounded text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1e3799] focus:bg-white"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="max-h-44 overflow-y-auto border border-slate-200 rounded bg-slate-50/50 divide-y divide-slate-100">
          <label className="flex items-center justify-between px-2.5 py-1.5 hover:bg-sky-50 cursor-pointer font-semibold text-slate-800 bg-white sticky top-0 z-10 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={areAllFilteredChecked}
                onChange={toggleAllFiltered}
                className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
              />
              <span>Выделить все</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">
              {filteredOptions.length}
            </span>
          </label>

          {filteredOptions.length === 0 ? (
            <div className="p-3 text-center text-slate-400">
              Совпадений не найдено
            </div>
          ) : (
            filteredOptions.map((item) => {
              const checked = checkedSet.has(item.value);
              const label = formatOptionLabel(item.value);
              return (
                <label
                  key={item.value || '__empty__'}
                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 hover:bg-sky-50/80 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSingleValue(item.value)}
                      className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799] shrink-0"
                    />
                    <span
                      className={`truncate ${
                        item.value === '' ? 'italic text-slate-400' : 'text-slate-700'
                      }`}
                      title={label}
                    >
                      {label}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 shrink-0">
                    {item.count}
                  </span>
                </label>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              onApplyFilter(column.key, undefined);
              onClose();
            }}
            className="px-2.5 py-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Сбросить
          </button>
          <button
            type="submit"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded bg-[#1e3799] text-white font-semibold hover:bg-[#15276e] transition-colors"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Применить</span>
          </button>
        </div>
      </form>
    </div>
  );
};
