import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Filter, Search, Check, RotateCcw, ArrowUpAZ, ArrowDownZA, X } from 'lucide-react';
import {
  normalizeFilterSearchText,
  resolveColumnFilterApplySelection,
} from '../utils/filters';

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
  /** Настраиваемая ширина столбца в px */
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
  /** Функция автоподбора ширины при двойном клике на разделитель */
  onAutoFit?: (columnKey: string) => void;
}

interface PopoverCoords {
  left: number;
  top?: number;
  bottom?: number;
  maxHeight: number;
}

const POPOVER_WIDTH = 288;
const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 4;
const MAX_POPOVER_HEIGHT = 440;
const MIN_POPOVER_HEIGHT = 200;

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
  const [popoverCoords, setPopoverCoords] = useState<PopoverCoords | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerBtnRef = useRef<HTMLButtonElement>(null);
  const thRef = useRef<HTMLTableCellElement>(null);
  const wasOpenRef = useRef(false);

  const selectedValues = activeFilters[columnKey];
  const hasActiveFilter = selectedValues !== undefined;
  const isSortedAsc = sortConfig?.key === columnKey && sortConfig?.direction === 'asc';
  const isSortedDesc = sortConfig?.key === columnKey && sortConfig?.direction === 'desc';

  const uniqueValuesWithCount = useMemo(() => {
    const counts = new Map<string, number>();
    rows.forEach((row, idx) => {
      const val = typeof getValue === 'function' ? String(getValue(row, idx) ?? '').trim() : '';
      counts.set(val, (counts.get(val) || 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value.localeCompare(b.value, 'ru', { numeric: true }));
  }, [rows, getValue]);

  const allValues = useMemo(
    () => uniqueValuesWithCount.map((u) => u.value),
    [uniqueValuesWithCount]
  );

  // Выбор в обычном режиме (без поискового запроса) и в режиме поиска
  const [draftSelection, setDraftSelection] = useState<Set<string>>(new Set());
  const [searchSelection, setSearchSelection] = useState<Set<string>>(new Set());

  const hasSearch = searchQuery.trim().length > 0;

  const filteredOptions = useMemo(() => {
    const q = normalizeFilterSearchText(searchQuery);
    if (!q) return uniqueValuesWithCount;
    return uniqueValuesWithCount.filter((item) => {
      const displayVal = item.value === '' ? 'пустые ячейки' : item.value;
      return normalizeFilterSearchText(displayVal).includes(q);
    });
  }, [uniqueValuesWithCount, searchQuery]);

  // Инициализация состояния строго при переходе закрыто -> открыто (не сбрасываем ввод при фоновых обновлениях)
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      if (selectedValues === undefined) {
        setDraftSelection(new Set(allValues));
      } else {
        setDraftSelection(new Set(selectedValues));
      }
      setSearchQuery('');
      setSearchSelection(new Set());
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 20);
    }
    wasOpenRef.current = isOpen;
  }, [isOpen, selectedValues, allValues]);

  // В режиме поиска автоматически отмечаем все найденные совпадения при изменении запроса
  useEffect(() => {
    if (!isOpen) return;
    if (hasSearch) {
      setSearchSelection(new Set(filteredOptions.map((item) => item.value)));
    }
  }, [isOpen, hasSearch, searchQuery, filteredOptions]);

  // Вычисление координат портала относительно триггера с защитой от обрезки краями экрана
  const updatePosition = useCallback(() => {
    const anchor = triggerBtnRef.current;
    if (!anchor) return;

    const btnRect = anchor.getBoundingClientRect();
    const thRect = thRef.current?.getBoundingClientRect();

    // Если кнопка-триггер полностью ушла за видимую область окна, аккуратно закрываем поповер
    if (
      btnRect.bottom < 0 ||
      btnRect.top > window.innerHeight ||
      btnRect.right < 0 ||
      btnRect.left > window.innerWidth
    ) {
      setIsOpen(false);
      return;
    }

    const preferredLeft = thRect ? thRect.left : btnRect.left;
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN);
    const left = Math.min(Math.max(VIEWPORT_MARGIN, preferredLeft), maxLeft);

    const anchorBottom = thRect ? thRect.bottom : btnRect.bottom;
    const anchorTop = thRect ? thRect.top : btnRect.top;

    const spaceBelow = window.innerHeight - anchorBottom - TRIGGER_GAP - VIEWPORT_MARGIN;
    const spaceAbove = anchorTop - TRIGGER_GAP - VIEWPORT_MARGIN;

    if (spaceBelow >= 260 || spaceBelow >= spaceAbove) {
      setPopoverCoords({
        left,
        top: Math.max(VIEWPORT_MARGIN, anchorBottom + TRIGGER_GAP),
        maxHeight: Math.max(MIN_POPOVER_HEIGHT, Math.min(MAX_POPOVER_HEIGHT, spaceBelow)),
      });
    } else {
      setPopoverCoords({
        left,
        bottom: Math.max(VIEWPORT_MARGIN, window.innerHeight - anchorTop + TRIGGER_GAP),
        maxHeight: Math.max(MIN_POPOVER_HEIGHT, Math.min(MAX_POPOVER_HEIGHT, spaceAbove)),
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setPopoverCoords(null);
      return;
    }
    updatePosition();

    const handleScroll = (e: Event) => {
      // Внутренняя прокрутка списка значений внутри самого окна фильтра не должна пересчитывать или закрывать его
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return;
      }
      updatePosition();
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        (!triggerBtnRef.current || !triggerBtnRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const activeSelection = hasSearch ? searchSelection : draftSelection;

  const allVisibleSelected =
    filteredOptions.length > 0 &&
    filteredOptions.every((item) => activeSelection.has(item.value));

  const selectedVisibleCount = useMemo(
    () => filteredOptions.filter((item) => activeSelection.has(item.value)).length,
    [filteredOptions, activeSelection]
  );

  const toggleAllVisible = () => {
    const updater = (prev: Set<string>) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredOptions.forEach((item) => next.delete(item.value));
      } else {
        filteredOptions.forEach((item) => next.add(item.value));
      }
      return next;
    };
    if (hasSearch) {
      setSearchSelection(updater);
    } else {
      setDraftSelection(updater);
    }
  };

  const toggleValue = (val: string) => {
    const updater = (prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(val)) {
        next.delete(val);
      } else {
        next.add(val);
      }
      return next;
    };
    if (hasSearch) {
      setSearchSelection(updater);
    } else {
      setDraftSelection(updater);
    }
  };

  const canApply = hasSearch ? selectedVisibleCount > 0 : draftSelection.size > 0;

  const handleApply = () => {
    if (!canApply) return;
    const nextValues = resolveColumnFilterApplySelection({
      allValues,
      filteredValues: filteredOptions.map((item) => item.value),
      activeSelection,
      searchQuery,
    });
    onApplyFilter(columnKey, nextValues);
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

  const popoverNode =
    isOpen && popoverCoords ? (
      <div
        ref={popoverRef}
        role="dialog"
        aria-label={`Фильтр столбца ${label}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          left: popoverCoords.left,
          ...(popoverCoords.top !== undefined
            ? { top: popoverCoords.top }
            : { bottom: popoverCoords.bottom }),
          width: POPOVER_WIDTH,
          maxHeight: popoverCoords.maxHeight,
        }}
        className="flex flex-col bg-white border border-slate-300 rounded-lg shadow-2xl z-[120] text-slate-800 font-normal text-left overflow-hidden"
      >
        {/* Заголовок */}
        <div className="px-3 py-2 bg-[#1e3799] text-white flex items-center justify-between gap-2 shrink-0">
          <span className="text-xs font-semibold truncate">Фильтр: {label}</span>
          {hasActiveFilter && (
            <span className="text-[10px] bg-white text-[#1e3799] font-bold px-1.5 py-0.5 rounded shrink-0">
              Активен
            </span>
          )}
        </div>

        {/* Сортировка */}
        {onSort && (
          <div className="p-1.5 border-b border-slate-200 grid grid-cols-2 gap-1 bg-slate-50 shrink-0">
            <button
              type="button"
              onClick={() => {
                onSort(columnKey, 'asc');
                setIsOpen(false);
              }}
              className={`flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
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
              className={`flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] font-medium rounded border transition-colors cursor-pointer ${
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

        {/* Поле поиска */}
        <div className="p-2 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleApply();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsOpen(false);
                }
              }}
              placeholder="Поиск значений..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                aria-label="Очистить поиск"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Строка «Выделить все / найденные» */}
        <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 shrink-0">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              disabled={filteredOptions.length === 0}
              onChange={toggleAllVisible}
              className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799]"
            />
            <span>{hasSearch ? 'Выделить найденные' : 'Выделить все'}</span>
          </label>
          <span className="text-[11px] text-slate-500 font-mono tabular-nums">
            {hasSearch
              ? `${selectedVisibleCount} / ${filteredOptions.length}`
              : `${draftSelection.size} / ${uniqueValuesWithCount.length}`}
          </span>
        </div>

        {/* Прокручиваемый список значений */}
        <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100 p-1">
          {filteredOptions.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">Совпадений не найдено</div>
          ) : (
            filteredOptions.map(({ value, count }) => {
              const isChecked = activeSelection.has(value);
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
                      className="rounded border-slate-300 text-[#1e3799] focus:ring-[#1e3799] shrink-0"
                    />
                    <span
                      title={value === '' ? 'Пустые ячейки' : value}
                      className={`truncate ${
                        value === '' ? 'italic text-slate-400' : 'text-slate-700 font-medium'
                      }`}
                    >
                      {value === '' ? 'Пустые ячейки' : value}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono tabular-nums text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                    {count}
                  </span>
                </label>
              );
            })
          )}
        </div>

        {/* Фиксированная нижняя панель кнопок */}
        <div className="p-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleClear}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Сбросить
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!canApply}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-[#1e3799] hover:bg-blue-800 disabled:opacity-40 rounded shadow-sm transition-colors cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              ОК
            </button>
          </div>
        </div>
      </div>
    ) : null;

  return (
    <th
      ref={thRef}
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
          ref={triggerBtnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          title={`Фильтр по столбцу: ${label}`}
          aria-label={`Фильтр: ${label}`}
          aria-expanded={isOpen}
          className={`p-1 rounded transition-colors shrink-0 cursor-pointer ${
            hasActiveFilter || isSortedAsc || isSortedDesc
              ? 'bg-white text-[#1e3799] shadow-2xs'
              : 'text-sky-200 hover:text-white hover:bg-white/15'
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
          className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize select-none z-10"
        />
      )}

      {popoverNode && typeof document !== 'undefined'
        ? createPortal(popoverNode, document.body)
        : null}
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
