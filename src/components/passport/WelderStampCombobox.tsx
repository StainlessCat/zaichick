import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Search,
  Users,
  X,
} from 'lucide-react';
import { WelderProfile } from '../../types/welding';
import {
  checkNaksCertStatus,
  findWelderByStamp,
  formatDateDDMMYY,
  normalizeStampString,
  searchWeldersByStampOrName,
} from '../../utils/weldingLogic';

export interface WelderStampComboboxProps {
  label: string;
  ariaLabel: string;
  placeholder: string;
  emptyOptionLabel: string;
  value: string;
  options: WelderProfile[];
  excludeStamps?: string[];
  isPrimary?: boolean;
  isBrigade?: boolean;
  referenceDate?: string;
  onChange: (newStamp: string) => void;
}

export const WelderStampCombobox: React.FC<WelderStampComboboxProps> = ({
  label,
  ariaLabel,
  placeholder,
  emptyOptionLabel,
  value,
  options,
  excludeStamps = [],
  isPrimary = false,
  isBrigade = false,
  referenceDate,
  onChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputText(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(ev.target as Node)
      ) {
        setIsOpen(false);
        const matched = findWelderByStamp(options, inputText, isBrigade);
        if (matched) {
          setInputText(matched.stamp);
          if (matched.stamp !== value) {
            onChange(matched.stamp);
          }
        } else if (!inputText.trim()) {
          setInputText('');
          if (value) onChange('');
        } else {
          setInputText(value);
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [inputText, value, options, isBrigade, onChange]);

  const filteredOptions = useMemo(() => {
    const exactCurrent =
      value &&
      normalizeStampString(inputText) === normalizeStampString(value) &&
      options.some(
        (o) => normalizeStampString(o.stamp) === normalizeStampString(value)
      );
    const queryToUse = exactCurrent ? '' : inputText;
    return searchWeldersByStampOrName(options, queryToUse, excludeStamps);
  }, [options, inputText, value, excludeStamps]);

  const matchedProfile = useMemo(
    () => findWelderByStamp(options, inputText || value, isBrigade),
    [options, value, inputText, isBrigade]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = e.target.value;
    setInputText(nextVal);
    setIsOpen(true);

    const trimmed = nextVal.trim();
    if (!trimmed) {
      onChange('');
      return;
    }

    const exactMatch = findWelderByStamp(options, trimmed, isBrigade);
    if (exactMatch) {
      onChange(exactMatch.stamp);
    }
  };

  const handleSelectOption = (stamp: string) => {
    setInputText(stamp);
    onChange(stamp);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && isOpen) {
      e.preventDefault();
      if (filteredOptions.length > 0) {
        handleSelectOption(filteredOptions[0].stamp);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    } else if (e.key === 'ArrowDown' && !isOpen) {
      setIsOpen(true);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="flex items-center justify-between gap-1.5 text-xs font-bold text-slate-800 mb-1">
        <span className="inline-flex items-center gap-1.5">
          <Users
            className={`w-3.5 h-3.5 ${
              isPrimary ? 'text-[#1e3799]' : 'text-slate-600'
            }`}
          />
          <span>{label}</span>
        </span>
        {matchedProfile && (
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
              {matchedProfile.stamp}
            </span>
            {matchedProfile.certExpiryDate && (() => {
              const status = checkNaksCertStatus(matchedProfile.certExpiryDate, referenceDate);
              if (status.badgeVariant === 'expired') {
                return (
                  <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-300 px-1.5 py-0.5 rounded animate-pulse">
                    НАКС просрочен!
                  </span>
                );
              }
              if (status.badgeVariant === 'expiring') {
                return (
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded">
                    НАКС ≤{status.daysRemaining}дн
                  </span>
                );
              }
              return (
                <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                  НАКС ок
                </span>
              );
            })()}
          </div>
        )}
      </label>

      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 pointer-events-none" />
        <input
          type="text"
          value={inputText}
          onFocus={() => setIsOpen(true)}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={ariaLabel}
          autoComplete="off"
          className={`w-full pl-8 pr-14 py-2 bg-white border rounded-lg text-xs font-mono font-bold transition-colors ${
            matchedProfile
              ? 'border-[#1e3799] text-[#1e3799]'
              : inputText.trim()
              ? 'border-amber-400 text-slate-900'
              : isPrimary
              ? 'border-[#1e3799]/70 text-slate-900'
              : 'border-slate-300 text-slate-800'
          }`}
        />

        <div className="absolute right-1.5 flex items-center gap-0.5">
          {inputText && (
            <button
              type="button"
              onClick={() => handleSelectOption('')}
              aria-label={`Очистить ${ariaLabel}`}
              title="Очистить клеймо"
              className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-label={`Открыть список: ${ariaLabel}`}
            title="Показать список клейм"
            className="p-1 rounded text-slate-500 hover:text-[#1e3799] hover:bg-sky-50"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-1 min-h-[16px] text-[10px] truncate">
        {matchedProfile ? (
          <span className="text-slate-600 font-medium">
            {isBrigade
              ? `Состав бригады: ${(matchedProfile.brigadeMembers || []).join(', ')}`
              : `${matchedProfile.fullName} · ${matchedProfile.certNumber}`}
          </span>
        ) : inputText.trim() ? (
          <span className="text-amber-700 font-medium">
            Поиск клейма «{inputText.trim()}» (совпадений: {filteredOptions.length})
          </span>
        ) : null}
      </div>

      {isOpen && (
        <div
          role="listbox"
          aria-label={`Результаты поиска: ${ariaLabel}`}
          className="absolute z-30 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded-lg bg-white border border-slate-200 shadow-xl divide-y divide-slate-100"
        >
          <button
            type="button"
            onClick={() => handleSelectOption('')}
            className="w-full px-3 py-1.5 text-left text-[11px] text-slate-500 hover:bg-slate-50 flex items-center justify-between"
          >
            <span>{emptyOptionLabel}</span>
            {!value && <Check className="w-3.5 h-3.5 text-[#1e3799]" />}
          </button>

          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-slate-500">
              Клеймо «{inputText}» не найдено в справочнике сварщиков
            </div>
          ) : (
            filteredOptions.map((item) => {
              const isSelected =
                normalizeStampString(item.stamp) ===
                normalizeStampString(value);
              return (
                <button
                  key={item.stamp}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelectOption(item.stamp)}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-start justify-between gap-2 ${
                    isSelected
                      ? 'bg-[#e8f1fc] text-[#1e3799]'
                      : 'hover:bg-sky-50/70 text-slate-800'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-[#1e3799] text-white font-mono text-[11px] font-bold shrink-0">
                        {item.stamp}
                      </span>
                      <span className="font-semibold truncate">
                        {item.isBrigade
                          ? `Бригада (${(item.brigadeMembers || []).join(', ')})`
                          : item.fullName}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-0.5 truncate flex items-center gap-1.5 flex-wrap">
                      <span>НАКС: {item.certNumber || '—'}</span>
                      {item.certExpiryDate && (() => {
                        const status = checkNaksCertStatus(item.certExpiryDate, referenceDate);
                        if (status.badgeVariant === 'expired') {
                          return (
                            <span className="font-bold text-rose-600">
                              (просрочен: {formatDateDDMMYY(item.certExpiryDate)})
                            </span>
                          );
                        }
                        if (status.badgeVariant === 'expiring') {
                          return (
                            <span className="font-bold text-amber-600">
                              (истекает: {formatDateDDMMYY(item.certExpiryDate)})
                            </span>
                          );
                        }
                        return (
                          <span className="text-emerald-700">
                            (до {formatDateDDMMYY(item.certExpiryDate)})
                          </span>
                        );
                      })()}
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-[#1e3799] shrink-0 mt-1" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
