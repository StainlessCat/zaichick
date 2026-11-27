import React, { useEffect, useState } from 'react';
import { Check, LayoutGrid, Palette, RotateCcw, Settings, Type, X } from 'lucide-react';
import { useModalDismiss } from '../hooks/useModalDismiss';
import {
  applyUiPreferences,
  DEFAULT_UI_PREFERENCES,
  FONT_FAMILY_OPTIONS,
  FONT_SCALE_OPTIONS,
  FONT_SMOOTHING_OPTIONS,
  loadUiPreferences,
  resetUiPreferences,
  saveUiPreferences,
  SURFACE_TONE_OPTIONS,
  THEME_PRESET_OPTIONS,
  UiPreferences,
} from '../utils/uiPreferences';

export interface AppSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppSettingsModal: React.FC<AppSettingsModalProps> = ({ isOpen, onClose }) => {
  const [prefs, setPrefs] = useState<UiPreferences>(() => loadUiPreferences());

  useEffect(() => {
    if (isOpen) {
      setPrefs(loadUiPreferences());
    }
  }, [isOpen]);

  const { handleRequestClose } = useModalDismiss({
    isOpen,
    isDirty: false,
    onClose,
  });

  if (!isOpen) return null;

  const updatePref = <K extends keyof UiPreferences>(key: K, value: UiPreferences[K]) => {
    const next: UiPreferences = { ...prefs, [key]: value };
    setPrefs(next);
    saveUiPreferences(next);
    applyUiPreferences(next);
  };

  const handleReset = () => {
    const defaults = resetUiPreferences();
    setPrefs(defaults);
  };

  const isDefault =
    prefs.fontFamily === DEFAULT_UI_PREFERENCES.fontFamily &&
    prefs.fontSmoothing === DEFAULT_UI_PREFERENCES.fontSmoothing &&
    prefs.fontScale === DEFAULT_UI_PREFERENCES.fontScale &&
    prefs.themePreset === DEFAULT_UI_PREFERENCES.themePreset &&
    prefs.surfaceTone === DEFAULT_UI_PREFERENCES.surfaceTone &&
    prefs.showKpiCards === DEFAULT_UI_PREFERENCES.showKpiCards;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-label="Настройки программы"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleRequestClose();
        }
      }}
    >
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Шапка */}
        <div
          className="text-white px-6 py-4 flex items-center justify-between shrink-0"
          style={{ backgroundColor: 'var(--brand-navy, #1e3799)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <Settings className="w-5 h-5 text-white/80 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-bold text-base leading-tight">Настройки программы</h3>
              <p className="text-xs text-white/75 truncate">
                Шрифты, рабочее пространство и оформление интерфейса
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="Закрыть настройки"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Основное содержимое: структурированные блоки */}
        <div className="p-5 overflow-y-auto space-y-4 bg-slate-50/60 text-slate-900">
          {/* Блок 1: Шрифты */}
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <Type className="w-4 h-4 text-[var(--brand-navy,#1e3799)] shrink-0" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Шрифты и чёткость
                </h4>
              </div>
            </div>

            {/* Выбор шрифта */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">Шрифт интерфейса</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FONT_FAMILY_OPTIONS.map((opt) => {
                  const selected = prefs.fontFamily === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updatePref('fontFamily', opt.id)}
                      className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                        selected
                          ? 'border-[var(--brand-navy,#1e3799)] bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div
                          className="text-sm font-semibold text-slate-900"
                          style={{ fontFamily: opt.cssValue }}
                        >
                          {opt.label}
                        </div>
                        <div className="text-[11px] text-slate-500 leading-snug">
                          {opt.description}
                        </div>
                      </div>
                      {selected && (
                        <Check className="w-4 h-4 text-[var(--brand-navy,#1e3799)] shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Режим сглаживания */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">Режим сглаживания</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {FONT_SMOOTHING_OPTIONS.map((opt) => {
                  const selected = prefs.fontSmoothing === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updatePref('fontSmoothing', opt.id)}
                      className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-start justify-between gap-2 ${
                        selected
                          ? 'border-[var(--brand-navy,#1e3799)] bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-xs font-semibold text-slate-900">{opt.label}</div>
                        <div className="text-[11px] text-slate-500 leading-snug">
                          {opt.description}
                        </div>
                      </div>
                      {selected && (
                        <Check className="w-4 h-4 text-[var(--brand-navy,#1e3799)] shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Размер текста + компактный предпросмотр */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-700">Размер текста</div>
                <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200 gap-1">
                  {FONT_SCALE_OPTIONS.map((opt) => {
                    const selected = prefs.fontScale === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => updatePref('fontScale', opt.id)}
                        className={`h-7 px-3.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                          selected
                            ? 'bg-white text-slate-900 shadow-2xs border border-slate-200'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 min-w-[230px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Образец текста
                </div>
                <div className="text-xs font-semibold text-slate-900 truncate mt-0.5">
                  Стык 010 · Труба БШ Ø159×8 · 09Г2С · 100%
                </div>
              </div>
            </div>
          </section>

          {/* Блок 2: Карточки KPI */}
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <LayoutGrid className="w-4 h-4 text-[var(--brand-navy,#1e3799)] shrink-0" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Карточки KPI и рабочее пространство
              </h4>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0 space-y-0.5">
                <div className="text-xs font-semibold text-slate-900">
                  Показывать верхние карточки KPI в рабочих разделах
                </div>
                <p className="text-[11px] text-slate-500 leading-snug">
                  Отключение скрывает сводные KPI-панели в Лайнлисте, Лаборатории НК, Испытаниях,
                  Исполнительной документации и Базе материалов, освобождая место под таблицы.
                  Раздел «Аналитика» при этом остаётся без изменений.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={prefs.showKpiCards}
                aria-label="Показывать верхние карточки KPI в рабочих разделах"
                onClick={() => updatePref('showKpiCards', !prefs.showKpiCards)}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                  prefs.showKpiCards ? 'bg-[var(--brand-navy,#1e3799)]' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
                    prefs.showKpiCards ? 'translate-x-5.5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </section>

          {/* Блок 3: Цветовая схема */}
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-100">
              <Palette className="w-4 h-4 text-[var(--brand-navy,#1e3799)] shrink-0" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Цветовая схема
              </h4>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">
                Акцентный цвет шапки и таблиц
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {THEME_PRESET_OPTIONS.map((opt) => {
                  const selected = prefs.themePreset === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updatePref('themePreset', opt.id)}
                      className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between gap-2.5 ${
                        selected
                          ? 'border-[var(--brand-navy,#1e3799)] bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex items-center rounded overflow-hidden border border-slate-200 shrink-0">
                          <span
                            className="w-4 h-6 block"
                            style={{ backgroundColor: opt.primary }}
                          />
                          <span
                            className="w-2.5 h-6 block"
                            style={{ backgroundColor: opt.navBg }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {opt.label}
                        </span>
                      </div>
                      {selected && (
                        <Check className="w-4 h-4 text-[var(--brand-navy,#1e3799)] shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">Оттенок рабочего фона</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {SURFACE_TONE_OPTIONS.map((opt) => {
                  const selected = prefs.surfaceTone === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updatePref('surfaceTone', opt.id)}
                      className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                        selected
                          ? 'border-[var(--brand-navy,#1e3799)] bg-slate-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-5 h-5 rounded border border-slate-300 shrink-0"
                          style={{ backgroundColor: opt.bgColor }}
                        />
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {opt.label}
                        </span>
                      </div>
                      {selected && (
                        <Check className="w-4 h-4 text-[var(--brand-navy,#1e3799)] shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        {/* Подвал */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleReset}
            disabled={isDefault}
            className="h-9 inline-flex items-center gap-1.5 px-3 rounded-md border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-45 text-slate-700 text-xs font-medium transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Сбросить по умолчанию</span>
          </button>

          <button
            type="button"
            onClick={handleRequestClose}
            className="h-9 px-5 rounded-md text-white text-xs font-semibold transition-colors cursor-pointer"
            style={{ backgroundColor: 'var(--brand-navy, #1e3799)' }}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
