import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, FolderKanban, Search, X } from 'lucide-react';
import { extractRdSuffix } from '../../utils/weldingLogic';
import { JournalLineOption } from './types';

interface JournalLineSelectorProps {
  selectedLineKey: string;
  activeLineDisplayLabel: string;
  availableLines: JournalLineOption[];
  currentRdCode: string;
  selectedObjectName: string;
  relevantJointsCount: number;
  onSelectLine: (lineKey: string) => void;
}

export const JournalLineSelector: React.FC<JournalLineSelectorProps> = ({
  selectedLineKey,
  activeLineDisplayLabel,
  availableLines,
  currentRdCode,
  selectedObjectName,
  relevantJointsCount,
  onSelectLine,
}) => {
  const [isLineOpen, setIsLineOpen] = useState(false);
  const [lineDropdownSearch, setLineDropdownSearch] = useState('');
  const [lineHighlightIndex, setLineHighlightIndex] = useState(0);

  const lineTriggerRef = useRef<HTMLButtonElement>(null);
  const lineInputRef = useRef<HTMLInputElement>(null);
  const lineDropdownRef = useRef<HTMLDivElement>(null);

  // Переключение фокуса в поле поиска при открытии списка линий
  useEffect(() => {
    if (isLineOpen) {
      setLineDropdownSearch('');
      setLineHighlightIndex(0);
      const timer = setTimeout(() => {
        lineInputRef.current?.focus();
        lineInputRef.current?.select();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isLineOpen]);

  // Закрытие выпадающего списка при клике вне его области
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        isLineOpen &&
        lineDropdownRef.current &&
        !lineDropdownRef.current.contains(target) &&
        !lineTriggerRef.current?.contains(target)
      ) {
        setIsLineOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isLineOpen]);

  const filteredLineOptions = useMemo(() => {
    const allOption: JournalLineOption = {
      id: 'ALL',
      lineNumber: 'Все линии',
      uniqueLineId: '',
      lineName:
        currentRdCode === 'ALL'
          ? (selectedObjectName === 'ALL'
              ? 'Сводный перечень по всем объектам и шифрам РД'
              : `Все линии объекта «${selectedObjectName}»`)
          : `Все линии шифра РД «${extractRdSuffix(currentRdCode) || currentRdCode}»`,
      product: '',
      objectName: selectedObjectName,
      rdCode: currentRdCode,
      pipelineCategory: '',
      qualityLevel: '',
      jointsCount: relevantJointsCount,
    };

    const list = [allOption, ...availableLines];
    if (!lineDropdownSearch.trim()) return list;

    const q = lineDropdownSearch.trim().toLowerCase();
    return list.filter((l) => {
      if (l.id === 'ALL') return 'все линии'.includes(q);
      return (
        l.lineNumber.toLowerCase().includes(q) ||
        l.uniqueLineId.toLowerCase().includes(q) ||
        l.lineName.toLowerCase().includes(q) ||
        l.product.toLowerCase().includes(q) ||
        l.pipelineCategory.toLowerCase().includes(q)
      );
    });
  }, [availableLines, lineDropdownSearch, currentRdCode, relevantJointsCount, selectedObjectName]);

  const handleSelect = (lineKey: string) => {
    onSelectLine(lineKey);
    setIsLineOpen(false);
    lineTriggerRef.current?.focus();
  };

  const handleLineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsLineOpen(false);
      lineTriggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setLineHighlightIndex((prev) =>
        prev < filteredLineOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setLineHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : filteredLineOptions.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredLineOptions[lineHighlightIndex];
      if (item) {
        handleSelect(item.id);
      }
    }
  };

  return (
    <div className="relative">
      <button
        ref={lineTriggerRef}
        type="button"
        onClick={() => setIsLineOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isLineOpen}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer select-none ${
          selectedLineKey !== 'ALL'
            ? 'border-[#1e3799] bg-[#e8f1fc] text-[#1e3799] font-semibold shadow-2xs'
            : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900'
        }`}
        title="Выбор линии технологического трубопровода"
      >
        <FolderKanban
          className={`w-4 h-4 shrink-0 ${
            selectedLineKey !== 'ALL' ? 'text-[#1e3799]' : 'text-slate-500'
          }`}
        />
        <span className="max-w-[150px] sm:max-w-[200px] truncate">
          {selectedLineKey === 'ALL' ? 'Все линии' : activeLineDisplayLabel}
        </span>
        {selectedLineKey !== 'ALL' && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              handleSelect('ALL');
            }}
            className="hover:bg-[#1e3799]/15 rounded p-0.5 text-[#1e3799]"
            title="Сбросить фильтр по линии (показать все линии)"
          >
            <X className="w-3 h-3" />
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
            isLineOpen ? 'rotate-180 text-[#1e3799]' : ''
          }`}
        />
      </button>

      {isLineOpen && (
        <div
          ref={lineDropdownRef}
          className="absolute left-0 top-full mt-1.5 z-40 w-84 sm:w-[440px] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col"
          onKeyDown={handleLineKeyDown}
        >
          <div className="p-2 border-b border-slate-100 bg-[#f8fafd] flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={lineInputRef}
                type="text"
                value={lineDropdownSearch}
                onChange={(e) => {
                  setLineDropdownSearch(e.target.value);
                  setLineHighlightIndex(0);
                }}
                placeholder="Поиск линии (номер, шифр, продукт, контур)..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
              />
              {lineDropdownSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setLineDropdownSearch('');
                    lineInputRef.current?.focus();
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="px-3 py-1 bg-slate-50 border-b border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="truncate">
              {currentRdCode === 'ALL'
                ? (selectedObjectName === 'ALL'
                    ? 'Все линии всех объектов'
                    : `Линии объекта «${selectedObjectName}»`)
                : `Шифр: ${extractRdSuffix(currentRdCode) || currentRdCode}`}
            </span>
            <span className="font-mono text-slate-400 shrink-0">
              Найдено: {filteredLineOptions.length}
            </span>
          </div>

          <div
            role="listbox"
            className="max-h-72 overflow-y-auto p-1.5 space-y-0.5"
          >
            {filteredLineOptions.map((opt, idx) => {
              const isSelected = selectedLineKey === opt.id;
              const isHighlighted = lineHighlightIndex === idx;
              return (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.id)}
                  onMouseEnter={() => setLineHighlightIndex(idx)}
                  ref={(el) => {
                    if (isHighlighted && el) {
                      el.scrollIntoView({ block: 'nearest' });
                    }
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[#e8f1fc] text-[#1e3799] font-semibold'
                      : isHighlighted
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono font-bold text-slate-900">
                        {opt.lineNumber}
                      </span>
                      {opt.uniqueLineId && opt.uniqueLineId !== opt.lineNumber && (
                        <span className="font-mono text-[10px] text-slate-500 px-1 py-0.2 rounded bg-slate-100 truncate">
                          {opt.uniqueLineId}
                        </span>
                      )}
                      {opt.id === 'ALL' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-600 font-sans">
                          все
                        </span>
                      )}
                    </div>
                    {(opt.lineName || opt.product || opt.jointsCount !== undefined) && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 truncate">
                        <span className="font-medium text-[#1e3799]">
                          {opt.jointsCount}{' '}
                          {opt.jointsCount === 1
                            ? 'стык'
                            : opt.jointsCount > 1 && opt.jointsCount < 5
                            ? 'стыка'
                            : 'стыков'}
                        </span>
                        {opt.lineName && (
                          <>
                            <span>·</span>
                            <span className="truncate">{opt.lineName}</span>
                          </>
                        )}
                        {opt.product && (
                          <>
                            <span>·</span>
                            <span className="text-slate-400 truncate">{opt.product}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[#1e3799] shrink-0" />}
                </button>
              );
            })}
            {filteredLineOptions.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-slate-400">
                Линии не найдены
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
