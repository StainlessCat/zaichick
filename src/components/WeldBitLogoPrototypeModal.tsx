import React from 'react';
import { Check, Download, Eye, RotateCcw, X } from 'lucide-react';
import {
  buildWeldBitSvgMarkup,
  WELDBIT_LOGO_VARIANTS,
  WeldBitLogo,
  type WeldBitVariantId,
  type WeldBitWordmarkMode,
} from './WeldBitLogo';
import { ZaychickLogo } from './ZaychickLogo';

export interface WeldBitLogoPrototypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePreviewId: WeldBitVariantId | null;
  activeWordmark: WeldBitWordmarkMode;
  onApplyPreview: (variantId: WeldBitVariantId | null, wordmark: WeldBitWordmarkMode) => void;
  onChangeWordmark: (wordmark: WeldBitWordmarkMode) => void;
}

const WORDMARK_OPTIONS: { id: WeldBitWordmarkMode; label: string }[] = [
  { id: 'weldbit', label: 'weldbit' },
  { id: 'WeldBit', label: 'WeldBit' },
  { id: 'zaychick', label: 'zaychick' },
];

export const WeldBitLogoPrototypeModal: React.FC<WeldBitLogoPrototypeModalProps> = ({
  isOpen,
  onClose,
  activePreviewId,
  activeWordmark,
  onApplyPreview,
  onChangeWordmark,
}) => {
  if (!isOpen) return null;

  const handleDownloadSvg = (variantId: WeldBitVariantId, tone: 'header' | 'light') => {
    const svg = buildWeldBitSvgMarkup(variantId, activeWordmark, tone);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeWordmark.toLowerCase()}-${variantId}-${tone}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-label="Прототип логотипа WeldBit"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] bg-[#f4f7fb] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Шапка окна */}
        <div className="px-6 py-4 bg-[#1e3799] text-white flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="space-y-0.5">
            <h2 className="text-base font-bold tracking-tight">
              Прототип логотипа · переход на weldbit
            </h2>
            <p className="text-xs text-sky-100/85">
              Сохранены палитра, толщина линий, сечение стыка и геометрия знака zaychick
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Переключатель начертания имени */}
            <div className="inline-flex items-center p-0.5 rounded-lg bg-white/10 border border-white/20">
              {WORDMARK_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeWordmark(opt.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    activeWordmark === opt.id
                      ? 'bg-white text-[#1e3799]'
                      : 'text-sky-100 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть окно прототипа логотипа"
              className="p-1.5 rounded-lg text-sky-100 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Основное содержимое */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Эталон сравнения: текущий знак */}
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold text-slate-500">
                Текущий эталон
              </span>
              <div className="px-3.5 py-2 rounded-lg bg-[#1e3799]">
                <ZaychickLogo variant="header" size={30} />
              </div>
              <div className="px-3.5 py-2 rounded-lg bg-[#f4f7fb] border border-slate-200">
                <ZaychickLogo variant="card" size={30} />
              </div>
            </div>

            <div className="flex items-center gap-4 text-[11px] text-slate-600 font-mono">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#1e3799] border border-slate-300" />
                #1E3799
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#005EB8] border border-slate-300" />
                #005EB8
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-[#93c5fd] border border-slate-300" />
                #93C5FD
              </span>
              <span>Manrope · 9px stroke</span>
            </div>
          </div>

          {/* Сетка 4 прототипов */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {WELDBIT_LOGO_VARIANTS.map((variant) => {
              const isApplied = activePreviewId === variant.id;
              return (
                <div
                  key={variant.id}
                  className={`bg-white rounded-xl border transition-colors overflow-hidden flex flex-col ${
                    isApplied
                      ? 'border-[#1e3799] ring-2 ring-[#1e3799]/15'
                      : 'border-slate-200'
                  }`}
                >
                  {/* Заголовок карточки */}
                  <div className="px-4 py-3 border-b border-slate-100 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-slate-900 truncate">
                          {variant.title}
                        </h3>
                        {variant.recommended && (
                          <span className="text-[11px] font-semibold text-[#1e3799]">
                            · базовый
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                        {variant.subtitle}
                      </p>
                    </div>
                  </div>

                  {/* Зона показа: тёмная шапка + светлый фон */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 border-b border-slate-100">
                    <div className="bg-[#1e3799] px-5 py-6 flex items-center justify-center">
                      <WeldBitLogo
                        variantId={variant.id}
                        wordmark={activeWordmark}
                        tone="header"
                        size={38}
                      />
                    </div>
                    <div className="bg-white px-5 py-6 flex items-center justify-center border-t sm:border-t-0 sm:border-l border-slate-100">
                      <WeldBitLogo
                        variantId={variant.id}
                        wordmark={activeWordmark}
                        tone="light"
                        size={38}
                      />
                    </div>
                  </div>

                  {/* Проверка читаемости иконки в масштабе + действия */}
                  <div className="px-4 py-3 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-lg bg-[#1e3799] flex items-center justify-center">
                        <WeldBitLogo variantId={variant.id} tone="header" size={24} iconOnly />
                      </div>
                      <div className="w-7 h-7 rounded-md bg-[#1e3799] flex items-center justify-center">
                        <WeldBitLogo variantId={variant.id} tone="header" size={18} iconOnly />
                      </div>
                      <div className="w-5 h-5 rounded bg-[#1e3799] flex items-center justify-center">
                        <WeldBitLogo variantId={variant.id} tone="header" size={13} iconOnly />
                      </div>
                      <span className="text-[11px] font-mono text-slate-400 ml-1">
                        36 · 28 · 20px
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleDownloadSvg(variant.id, 'header')}
                        className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-[#1e3799]" />
                        <span>SVG</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          onApplyPreview(isApplied ? null : variant.id, activeWordmark)
                        }
                        className={`h-8 px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                          isApplied
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'bg-[#1e3799] hover:bg-[#15276e] text-white'
                        }`}
                      >
                        {isApplied ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>В шапке</span>
                          </>
                        ) : (
                          <>
                            <Eye className="w-3.5 h-3.5" />
                            <span>Примерить</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Нижняя панель */}
        <div className="px-6 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600">
            {activePreviewId
              ? 'Активна временная примерка в шапке программы. Исходное название проекта не изменено.'
              : 'Выберите вариант для живой примерки в шапке программы или выгрузите векторный SVG.'}
          </div>

          <div className="flex items-center gap-2">
            {activePreviewId && (
              <button
                type="button"
                onClick={() => onApplyPreview(null, activeWordmark)}
                className="h-8 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Вернуть zaychick</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="h-8 px-4 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white text-xs font-semibold cursor-pointer"
            >
              Готово
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
