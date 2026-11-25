import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

export interface SmartAutocompleteOption<T = unknown> {
  key: string;
  value: string;
  label: string;
  meta?: string;
  accentLabel?: string;
  data?: T;
}

export interface SmartAutocompleteInputProps<T = unknown> {
  value: string;
  onChangeText: (nextText: string) => void;
  onSelectOption: (option: SmartAutocompleteOption<T>) => void;
  onClear?: () => void;
  options: SmartAutocompleteOption<T>[];
  selectedKey?: string;
  placeholder?: string;
  ariaLabel: string;
  emptyText?: string;
  inputClassName?: string;
  dropdownClassName?: string;
  dropdownAlign?: 'left' | 'right';
  showChevron?: boolean;
  clearable?: boolean;
  disabled?: boolean;
  openOnFocus?: boolean;
  onBlurWithoutSelect?: () => void;
}

export function SmartAutocompleteInput<T = unknown>({
  value,
  onChangeText,
  onSelectOption,
  onClear,
  options,
  selectedKey,
  placeholder,
  ariaLabel,
  emptyText = 'Совпадений не найдено',
  inputClassName = '',
  dropdownClassName = '',
  dropdownAlign = 'left',
  showChevron = false,
  clearable = true,
  disabled = false,
  openOnFocus = true,
  onBlurWithoutSelect,
}: SmartAutocompleteInputProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(ev.target as Node)
      ) {
        if (isOpen) {
          setIsOpen(false);
          setActiveIndex(-1);
          onBlurWithoutSelect?.();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onBlurWithoutSelect]);

  useEffect(() => {
    if (!isOpen) return;
    if (options.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex((prev) => {
      if (prev >= 0 && prev < options.length) return prev;
      return 0;
    });
  }, [isOpen, options.length]);

  useEffect(() => {
    if (!isOpen || activeIndex < 0 || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(
      `[data-option-index="${activeIndex}"]`
    );
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, isOpen]);

  const handleSelect = (opt: SmartAutocompleteOption<T>) => {
    onSelectOption(opt);
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(options.length > 0 ? 0 : -1);
      } else if (options.length > 0) {
        setActiveIndex((prev) => (prev + 1) % options.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(options.length > 0 ? options.length - 1 : -1);
      } else if (options.length > 0) {
        setActiveIndex((prev) => (prev <= 0 ? options.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter' && isOpen) {
      if (activeIndex >= 0 && activeIndex < options.length) {
        e.preventDefault();
        handleSelect(options[activeIndex]);
      } else {
        setIsOpen(false);
      }
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      setActiveIndex(-1);
    } else if (e.key === 'Tab' && isOpen) {
      setIsOpen(false);
      setActiveIndex(-1);
      onBlurWithoutSelect?.();
    }
  };

  const hasRightControls = (clearable && Boolean(value)) || showChevron;

  return (
    <div ref={containerRef} className="relative">
      <div className="relative flex items-center">
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          autoComplete="off"
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onFocus={() => {
            if (openOnFocus && !disabled) {
              setIsOpen(true);
            }
          }}
          onChange={(e) => {
            onChangeText(e.target.value);
            if (!isOpen && !disabled) {
              setIsOpen(true);
            }
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
          className={`w-full transition-colors focus:outline-none focus:ring-1 focus:ring-[#1e3799] focus:border-[#1e3799] ${
            hasRightControls ? (showChevron && clearable && value ? 'pr-11' : 'pr-6') : ''
          } ${inputClassName}`}
        />

        {hasRightControls && !disabled && (
          <div className="absolute right-1 flex items-center gap-0.5">
            {clearable && value && (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (onClear) {
                    onClear();
                  } else {
                    onChangeText('');
                  }
                  setActiveIndex(-1);
                }}
                aria-label={`Очистить: ${ariaLabel}`}
                title="Очистить"
                className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            )}
            {showChevron && (
              <button
                type="button"
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setIsOpen((prev) => !prev)}
                aria-label={`Показать варианты: ${ariaLabel}`}
                className="p-0.5 rounded text-slate-400 hover:text-[#1e3799] hover:bg-sky-50 cursor-pointer"
              >
                <ChevronDown
                  className={`w-3 h-3 transition-transform duration-150 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
            )}
          </div>
        )}
      </div>

      {isOpen && !disabled && (
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-label={`Подсказки: ${ariaLabel}`}
          className={`absolute top-full z-40 mt-1 max-h-56 overflow-y-auto rounded-lg bg-white border border-slate-200 shadow-lg divide-y divide-slate-100 ${
            dropdownAlign === 'right' ? 'right-0' : 'left-0'
          } ${dropdownClassName || 'min-w-full'}`}
        >
          {options.length === 0 ? (
            <div className="px-2.5 py-2 text-[11px] text-slate-500">
              {emptyText}
            </div>
          ) : (
            options.map((opt, idx) => {
              const isSelected =
                selectedKey !== undefined
                  ? opt.key === selectedKey
                  : opt.value === value && value !== '';
              const isHighlighted = idx === activeIndex;

              return (
                <button
                  key={opt.key}
                  type="button"
                  role="option"
                  data-option-index={idx}
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(opt);
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full px-2.5 py-1.5 text-left transition-colors flex items-start justify-between gap-2 cursor-pointer ${
                    isSelected
                      ? 'bg-[#e8f1fc] text-[#1e3799]'
                      : isHighlighted
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="font-mono tabular-nums text-[11px] font-semibold truncate">
                        {opt.label}
                      </span>
                      {opt.accentLabel && (
                        <span className="text-[10px] font-medium text-[#1e3799] shrink-0">
                          {opt.accentLabel}
                        </span>
                      )}
                    </div>
                    {opt.meta && (
                      <div className="text-[10px] text-slate-500 truncate mt-0.5">
                        {opt.meta}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-[#1e3799] shrink-0 mt-0.5" />
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
