import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Filter, Search, Check, RotateCcw, ArrowUpAZ, ArrowDownZA } from 'lucide-react';

export interface TableFilterColumnDef<T> {
  key: string;
  label: string;
  getValue: (row: T, index: number) => string;
}

interface TableColumnFilterHeaderProps<T> {
  columnKey: string;
  label: string;
  rows: T[];
  getValue: (row: T, index: number) => string;
  activeFilters: Record<string, string[]>;
  onApplyFilter: (columnKey: string, selectedValues: string[] | undefined) => void;
  sortConfig?: { key: string; direction: 'asc' | 'desc' } | null;
  onSort?: (columnKey: string, direction: 'asc' | 'desc') => void;
  className?: string;
  align?: 'left' | 'center' | 'right';
  rowSpan?: number;
  colSpan?: number;
  style?: React.CSSProperties;
  title?: string;
  /** Настраиваемая ширина столбца (в px) */
  width?: number;
  /** Минимальная ширина столбца при регулировке */
  minWidth?: number;
  /** Функция начала перетаскивания границы столбца */
  onResizeStart?: (
    e: React.PointerEvent,
    columnKey: string,
    currentWidth: number,
    minWidth?: number
  ) => void;
  /** Функция автоподбора ширины (двойной клик на разделитель) */
  onAutoFit?: (columnKey: string) => void;
}

export function TableColumnFilterHeader<T>({
  columnKey,
  label,
  rows,
  getValue,
  activeFilters,
  onApplyFilter,
  sortConfig,
  onSort,
  className = '',
  align = 'left',
  rowSpan,
  colSpan,
  style,
  title,
  width,
  minWidth,
  onResizeStart,
  onAutoFit,
}: TableColumnFilterHeaderProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const selectedValues = activeFilters[columnKey];
  const hasActiveFilter = selectedValues !== undefined;
  const isSortedAsc = sortConfig?.key === columnKey && sortConfig?.direction === 'asc';
  const isSortedDesc = sortConfig?.key === columnKey && sortConfig?.direction === 'desc';

  const uniqueValuesWithCount = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row, idx) => {
      const val = String(getValue(row, idx) ?? '').trim();
      counts.set(val, (counts.get(val) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value, 'ru', { numeric: true }));
  }, [rows, getValue]);

  const [draftSelection, setDraftSelection] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      if (selectedValues === undefined) {
        setDraftSelection(new Set(uniqueValuesWithCount.map((u) => u.value)));
      } else {
        setDraftSelection(new Set(selectedValues));
      }
      setSearchQuery('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 20);
    }
  }, [isOpen, selectedValues, uniqueValuesWithCount]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return uniqueValuesWithCount;
    const q = searchQuery.toLowerCase();
    return uniqueValuesWithCount.filter((item) => {
      const displayVal = item.value === '' ? '(пустые)' : item.value.toLowerCase();
      return displayVal.includes(q);
    });
  }, [uniqueValuesWithCount, searchQuery]);

  const allFilteredSelected =
    filteredOptions.length > 0 && filteredOptions.every((item) => draftSelection.has(item.value));

  const toggleAllFiltered = () => {
    const next = new Set(draftSelection);
    if (allFilteredSelected) {
      filteredOptions.forEach((item) => next.delete(item.value));
    } else {
      filteredOptions.forEach((item) => next.add(item.value));
    }
    setDraftSelection(next);
  };

  const toggleValue = (val: string) => {
    const next = new Set(draftSelection);
    if (next.has(val)) {
      next.delete(val);
    } else {
      next.add(val);
    }
    setDraftSelection(next);
  };

  const handleApply = () => {
    if (draftSelection.size === uniqueValuesWithCount.length) {
      onApplyFilter(columnKey, undefined);
    } else {
      onApplyFilter(columnKey, Array.from(draftSelection));
    }
    setIsOpen(false);
  };

  const handleClear = () => {
    onApplyFilter(columnKey, undefined);
    setIsOpen(false);
  };

  const colWidth = width ?? (typeof style?.width === 'number' ? style.width : undefined);
  const colMinWidth = minWidth ?? (typeof style?.minWidth === 'number' ? style.minWidth : 60);

  const mergedStyle: React.CSSProperties = {
    ...style,
    ...(colWidth ? { width: colWidth, minWidth: colWidth } : {}),
  };

  return (
    <th
      rowSpan={rowSpan}
      colSpan={colSpan}
      style={mergedStyle}
      title={title}
      className={`px-2.5 py-2.5 font-semibold border-r border-[#162a78] relative select-none group ${className}`}
    >
      <div
        className={`flex items-center justify-between gap-1.5 ${
          align === 'center' ? 'justify-center' : align === 'right' ? 'justify-end' : 'justify-between'
        }`}
      >
        <span
          onClick={() => {
            if (onSort) {
              onSort(columnKey, isSortedAsc ? 'desc' : 'asc');
            }
          }}
          className={`leading-tight ${onSort ? 'cursor-pointer hover:underline' : ''}`}
        >
          {label}
        </span>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          title={`Фильтр по столбцу: ${label}`}
          aria-label={`Фильтр: ${label}`}
          className={`p-1 rounded transition-colors shrink-0 ${
            hasActiveFilter || isSortedAsc || isSortedDesc
              ? 'bg-amber-400 text-slate-950 shadow-sm'
              : 'text-blue-200 hover:text-white hover:bg-white/15'
          }`}
        >
          <Filter className="w-3 h-3" />
        </button>
      </div>

      {/* Интерактивная ручка изменения ширины столбца */}
      {onResizeStart && (
        <div
          onPointerDown={(e) => {
            const currentW =
              colWidth ??
              (e.currentTarget.parentElement?.getBoundingClientRect().width || 120);
            onResizeStart(e, columnKey, currentW, colMinWidth);
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (onAutoFit) {
              onAutoFit(columnKey);
            }
          }}
          title="Потяните для изменения ширины. Двойной клик — автоподбор"
          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize select-none z-10 hover:bg-sky-400/50 transition-colors"
        />
      )}

      {isOpen && (
        <div
          ref={popoverRef}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full mt-1 w-72 bg-white border border-slate-300 rounded-md shadow-2xl z-50 text-slate-800 font-normal text-left"
        >
          <div className="px-3 py-2 bg-[#1e3799] text-white rounded-t-md flex items-center justify-between">
            <span className="text-xs font-semibold truncate">Фильтр: {label}</span>
            {hasActiveFilter && (
              <span className="text-[10px] bg-amber-400 text-slate-950 font-bold px-1.5 py-0.5 rounded">
                Активен
              </span>
            )}
          </div>

          {onSort && (
            <div className="p-1.5 border-b border-slate-200 grid grid-cols-2 gap-1 bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  onSort(columnKey, 'asc');
                  setIsOpen(false);
                }}
                className={`flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
                  isSortedAsc
                    ? 'bg-blue-50 border-[#1e3799] text-[#1e3799] font-semibold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ArrowUpAZ className="w-3.5 h-3.5" />
                От А до Я
              </button>
              <button
                type="button"
                onClick={() => {
                  onSort(columnKey, 'desc');
                  setIsOpen(false);
                }}
                className={`flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded border transition-colors ${
                  isSortedDesc
                    ? 'bg-blue-50 border-[#1e3799] text-[#1e3799] font-semibold'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <ArrowDownZA className="w-3.5 h-3.5" />
                От Я до А
              </button>
            </div>
          )}

          <div className="p-2 border-b border-slate-200 bg-slate-50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleApply();
                  if (e.key === 'Escape') setIsOpen(false);
                }}
                placeholder="Поиск (курсор активен)..."
                className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
              />
            </div>
          </div>

          <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAllFiltered}
                className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
              />
              <span>(Выделить все)</span>
            </label>
            <span className="text-[11px] text-slate-400 font-mono">
              {draftSelection.size} / {uniqueValuesWithCount.length}
            </span>
          </div>

          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">Совпадений не найдено</div>
            ) : (
              filteredOptions.map(({ value, count }) => {
                const isChecked = draftSelection.has(value);
                return (
                  <label
                    key={value || '__empty__'}
                    className="flex items-center justify-between px-2 py-1.5 text-xs hover:bg-blue-50/60 rounded cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleValue(value)}
                        className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
                      />
                      <span
                        className={`truncate ${
                          value === '' ? 'italic text-slate-400' : 'text-slate-700 font-medium'
                        }`}
                      >
                        {value === '' ? '(Пустые ячейки)' : value}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                      {count}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <div className="p-2 bg-slate-50 border-t border-slate-200 rounded-b-md flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Сбросить
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded transition-colors"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleApply}
                disabled={draftSelection.size === 0}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#1e3799] hover:bg-blue-800 disabled:opacity-40 rounded shadow-sm transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                ОК
              </button>
            </div>
          </div>
        </div>
      )}
    </th>
  );
}

export function applyTableColumnFiltersAndSort<T>(
  rows: T[],
  activeFilters: Record<string, string[]>,
  valueGetters: Record<string, (row: T, index: number) => string>,
  sortConfig?: { key: string; direction: 'asc' | 'desc' } | null
): T[] {
  const filterEntries = Object.entries(activeFilters);
  let result = rows.filter((row, idx) => {
    for (const [colKey, allowedValues] of filterEntries) {
      const getter = valueGetters[colKey];
      if (!getter) continue;
      const val = String(getter(row, idx) ?? '').trim();
      if (!allowedValues.includes(val)) {
        return false;
      }
    }
    return true;
  });

  if (sortConfig && valueGetters[sortConfig.key]) {
    const getter = valueGetters[sortConfig.key];
    result = [...result].sort((a, b) => {
      const valA = String(getter(a, 0) ?? '').trim();
      const valB = String(getter(b, 0) ?? '').trim();
      const cmp = valA.localeCompare(valB, 'ru', { numeric: true });
      return sortConfig.direction === 'asc' ? cmp : -cmp;
    });
  }

  return result;
}
