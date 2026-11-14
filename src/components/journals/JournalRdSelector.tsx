import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, FileCode2, Search, X } from 'lucide-react';
import { JournalRdOption } from './types';

interface JournalRdSelectorProps {
  currentRdCode: string;
  rdOptions: JournalRdOption[];
  selectedObjectName: string;
  onSelectRd: (rdCode: string) => void;
}

export const JournalRdSelector: React.FC<JournalRdSelectorProps> = ({
  currentRdCode,
  rdOptions,
  selectedObjectName,
  onSelectRd,
}) => {
  const [isRdOpen, setIsRdOpen] = useState(false);
  const [rdSearch, setRdSearch] = useState('');
  const [rdHighlightIndex, setRdHighlightIndex] = useState(0);

  const rdTriggerRef = useRef<HTMLButtonElement>(null);
  const rdInputRef = useRef<HTMLInputElement>(null);
  const rdDropdownRef = useRef<HTMLDivElement>(null);

  // Переключение фокуса в поле поиска при открытии списка шифров РД
  useEffect(() => {
    if (isRdOpen) {
      setRdSearch('');
      setRdHighlightIndex(0);
      const timer = setTimeout(() => {
        rdInputRef.current?.focus();
        rdInputRef.current?.select();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isRdOpen]);

  // Закрытие выпадающего списка при клике вне его области
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        isRdOpen &&
        rdDropdownRef.current &&
        !rdDropdownRef.current.contains(target) &&
        !rdTriggerRef.current?.contains(target)
      ) {
        setIsRdOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isRdOpen]);

  const filteredRdOptions = useMemo(() => {
    if (!rdSearch.trim()) return rdOptions;
    const q = rdSearch.trim().toLowerCase();
    return rdOptions.filter((opt) => {
      if (opt.rdCode === 'ALL') return 'все шифры рд сводный'.includes(q);
      return (
        opt.rdCode.toLowerCase().includes(q) ||
        opt.suffix.toLowerCase().includes(q)
      );
    });
  }, [rdOptions, rdSearch]);

  const handleSelect = (rd: string) => {
    onSelectRd(rd);
    setIsRdOpen(false);
    rdTriggerRef.current?.focus();
  };

  const handleRdKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsRdOpen(false);
      rdTriggerRef.current?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setRdHighlightIndex((prev) =>
        prev < filteredRdOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setRdHighlightIndex((prev) =>
        prev > 0 ? prev - 1 : filteredRdOptions.length - 1
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredRdOptions[rdHighlightIndex];
      if (item) {
        handleSelect(item.rdCode);
      }
    }
  };

  return (
    <div className="relative">
      <button
        ref={rdTriggerRef}
        type="button"
        onClick={() => setIsRdOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isRdOpen}
        className={`inline-flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer select-none min-w-[280px] sm:min-w-[420px] max-w-[92vw] sm:max-w-[480px] ${
          currentRdCode !== 'ALL'
            ? 'border-[#1e3799] bg-[#e8f1fc] text-[#1e3799] font-semibold shadow-2xs'
            : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900'
        }`}
        title={
          currentRdCode === 'ALL'
            ? 'Выбор комплекта рабочей документации (шифра РД)'
            : `Выбран шифр РД: ${currentRdCode}`
        }
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileCode2
            className={`w-4 h-4 shrink-0 ${
              currentRdCode !== 'ALL' ? 'text-[#1e3799]' : 'text-slate-500'
            }`}
          />
          <span className="font-mono text-xs whitespace-nowrap overflow-x-hidden text-ellipsis flex-1 text-left tracking-tight">
            {currentRdCode === 'ALL' ? 'Все шифры РД' : currentRdCode}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {currentRdCode !== 'ALL' && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect('ALL');
              }}
              className="hover:bg-[#1e3799]/15 rounded p-0.5 text-[#1e3799]"
              title="Сбросить фильтр по шифру РД (показать все шифры РД)"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isRdOpen ? 'rotate-180 text-[#1e3799]' : ''
            }`}
          />
        </div>
      </button>

      {isRdOpen && (
        <div
          ref={rdDropdownRef}
          className="absolute left-0 top-full mt-1.5 z-40 w-[92vw] sm:w-[580px] max-w-[620px] bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col"
          onKeyDown={handleRdKeyDown}
        >
          <div className="p-2 border-b border-slate-100 bg-[#f8fafd] flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={rdInputRef}
                type="text"
                value={rdSearch}
                onChange={(e) => {
                  setRdSearch(e.target.value);
                  setRdHighlightIndex(0);
                }}
                placeholder="Поиск шифра РД (номер до 40 символов, суффикс)..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1e3799] focus:ring-1 focus:ring-[#1e3799]"
              />
              {rdSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setRdSearch('');
                    rdInputRef.current?.focus();
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
              {selectedObjectName === 'ALL'
                ? 'Шифры РД всех объектов'
                : `Объект: ${selectedObjectName}`}
            </span>
            <span className="font-mono text-slate-400 shrink-0">
              Найдено: {filteredRdOptions.length}
            </span>
          </div>

          <div
            role="listbox"
            className="max-h-72 overflow-y-auto p-1.5 space-y-0.5"
          >
            {filteredRdOptions.map((opt, idx) => {
              const isSelected = currentRdCode === opt.rdCode;
              const isHighlighted = rdHighlightIndex === idx;
              return (
                <button
                  key={opt.rdCode}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.rdCode)}
                  onMouseEnter={() => setRdHighlightIndex(idx)}
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-slate-900 select-all whitespace-normal sm:whitespace-nowrap break-all sm:break-normal">
                        {opt.rdCode === 'ALL' ? 'Все шифры РД' : opt.rdCode}
                      </span>
                      {opt.suffix && (
                        <span className="font-mono text-[10px] text-[#1e3799] font-semibold px-1.5 py-0.2 rounded bg-sky-100 shrink-0">
                          {opt.suffix}
                        </span>
                      )}
                      {opt.rdCode === 'ALL' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-600 font-sans shrink-0">
                          сводный
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span>{opt.linesCount} лин.</span>
                      <span>·</span>
                      <span>
                        {opt.jointsCount}{' '}
                        {opt.jointsCount === 1
                          ? 'стык'
                          : opt.jointsCount > 1 && opt.jointsCount < 5
                          ? 'стыка'
                          : 'стыков'}
                      </span>
                    </div>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[#1e3799] shrink-0" />}
                </button>
              );
            })}
            {filteredRdOptions.length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-slate-400">
                Шифры РД не найдены
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
