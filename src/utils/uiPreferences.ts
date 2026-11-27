export type UiFontFamily = 'inter' | 'system' | 'ibm-plex' | 'manrope';
export type UiFontSmoothing = 'subpixel' | 'antialiased';
export type UiFontScale = 'compact' | 'normal' | 'large';
export type UiThemePreset = 'navy' | 'graphite' | 'petrol' | 'emerald';
export type UiSurfaceTone = 'cool' | 'neutral' | 'warm';

export interface UiPreferences {
  fontFamily: UiFontFamily;
  fontSmoothing: UiFontSmoothing;
  fontScale: UiFontScale;
  themePreset: UiThemePreset;
  surfaceTone: UiSurfaceTone;
  showKpiCards: boolean;
}

export const UI_PREFERENCES_STORAGE_KEY = 'zaychick_ui_preferences_v1';

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  fontFamily: 'inter',
  fontSmoothing: 'subpixel',
  fontScale: 'normal',
  themePreset: 'navy',
  surfaceTone: 'cool',
  showKpiCards: true,
};

export interface UiFontOption {
  id: UiFontFamily;
  label: string;
  description: string;
  cssValue: string;
  featureSettings: string;
}

export const FONT_FAMILY_OPTIONS: UiFontOption[] = [
  {
    id: 'inter',
    label: 'Inter',
    description: 'Чёткий экранный гротеск для таблиц и технической кириллицы',
    cssValue: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    featureSettings: '"cv02", "cv03", "cv04", "cv11"',
  },
  {
    id: 'system',
    label: 'Системный шрифт ОС',
    description: 'Максимальная резкость на Windows и macOS через нативный хинтинг',
    cssValue: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    featureSettings: 'normal',
  },
  {
    id: 'ibm-plex',
    label: 'IBM Plex Sans',
    description: 'Инженерный шрифт с высокой различимостью цифр и кодов',
    cssValue: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
    featureSettings: 'normal',
  },
  {
    id: 'manrope',
    label: 'Manrope',
    description: 'Геометрический гротеск, оптимален для экранов высокой плотности',
    cssValue: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
    featureSettings: 'normal',
  },
];

export const FONT_SMOOTHING_OPTIONS: {
  id: UiFontSmoothing;
  label: string;
  description: string;
}[] = [
  {
    id: 'subpixel',
    label: 'Чёткое системное',
    description: 'Использует нативное сглаживание системы без размытия мелких шрифтов',
  },
  {
    id: 'antialiased',
    label: 'Мягкое сглаживание',
    description: 'Более тонкие штрихи, подходит для экранов Retina с масштабом 200%',
  },
];

export const FONT_SCALE_OPTIONS: {
  id: UiFontScale;
  label: string;
  pxValue: string;
}[] = [
  { id: 'compact', label: 'Компактный', pxValue: '15px' },
  { id: 'normal', label: 'Стандартный', pxValue: '16px' },
  { id: 'large', label: 'Крупный', pxValue: '17px' },
];

export interface UiThemePresetOption {
  id: UiThemePreset;
  label: string;
  primary: string;
  primaryHover: string;
  navBg: string;
  skyTint: string;
}

export const THEME_PRESET_OPTIONS: UiThemePresetOption[] = [
  {
    id: 'navy',
    label: 'Корпоративный синий',
    primary: '#1e3799',
    primaryHover: '#15276e',
    navBg: '#162a75',
    skyTint: '#e8f1fc',
  },
  {
    id: 'graphite',
    label: 'Графитовый стальной',
    primary: '#1e293b',
    primaryHover: '#0f172a',
    navBg: '#0f172a',
    skyTint: '#eef2f6',
  },
  {
    id: 'petrol',
    label: 'Глубокий бирюзовый',
    primary: '#0f4c5c',
    primaryHover: '#0a3642',
    navBg: '#0b3b49',
    skyTint: '#e6f4f7',
  },
  {
    id: 'emerald',
    label: 'Инженерный изумруд',
    primary: '#14532d',
    primaryHover: '#0d3b20',
    navBg: '#0f4224',
    skyTint: '#e8f5ee',
  },
];

export const SURFACE_TONE_OPTIONS: {
  id: UiSurfaceTone;
  label: string;
  bgColor: string;
}[] = [
  { id: 'cool', label: 'Холодный светлый', bgColor: '#f4f7fb' },
  { id: 'neutral', label: 'Нейтральный белый', bgColor: '#f8fafc' },
  { id: 'warm', label: 'Тёплый спокойный', bgColor: '#f6f5f0' },
];

const VALID_FONTS = new Set<UiFontFamily>(['inter', 'system', 'ibm-plex', 'manrope']);
const VALID_SMOOTHING = new Set<UiFontSmoothing>(['subpixel', 'antialiased']);
const VALID_SCALES = new Set<UiFontScale>(['compact', 'normal', 'large']);
const VALID_THEMES = new Set<UiThemePreset>(['navy', 'graphite', 'petrol', 'emerald']);
const VALID_SURFACES = new Set<UiSurfaceTone>(['cool', 'neutral', 'warm']);

export function loadUiPreferences(): UiPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_UI_PREFERENCES };
  try {
    const raw = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_PREFERENCES };
    const parsed = JSON.parse(raw) as Partial<UiPreferences>;
    return {
      fontFamily:
        parsed.fontFamily && VALID_FONTS.has(parsed.fontFamily)
          ? parsed.fontFamily
          : DEFAULT_UI_PREFERENCES.fontFamily,
      fontSmoothing:
        parsed.fontSmoothing && VALID_SMOOTHING.has(parsed.fontSmoothing)
          ? parsed.fontSmoothing
          : DEFAULT_UI_PREFERENCES.fontSmoothing,
      fontScale:
        parsed.fontScale && VALID_SCALES.has(parsed.fontScale)
          ? parsed.fontScale
          : DEFAULT_UI_PREFERENCES.fontScale,
      themePreset:
        parsed.themePreset && VALID_THEMES.has(parsed.themePreset)
          ? parsed.themePreset
          : DEFAULT_UI_PREFERENCES.themePreset,
      surfaceTone:
        parsed.surfaceTone && VALID_SURFACES.has(parsed.surfaceTone)
          ? parsed.surfaceTone
          : DEFAULT_UI_PREFERENCES.surfaceTone,
      showKpiCards:
        typeof parsed.showKpiCards === 'boolean'
          ? parsed.showKpiCards
          : DEFAULT_UI_PREFERENCES.showKpiCards,
    };
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function saveUiPreferences(prefs: UiPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

export function applyUiPreferences(prefs: UiPreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  const fontOpt =
    FONT_FAMILY_OPTIONS.find((f) => f.id === prefs.fontFamily) || FONT_FAMILY_OPTIONS[0];
  const scaleOpt =
    FONT_SCALE_OPTIONS.find((s) => s.id === prefs.fontScale) || FONT_SCALE_OPTIONS[1];
  const themeOpt =
    THEME_PRESET_OPTIONS.find((t) => t.id === prefs.themePreset) || THEME_PRESET_OPTIONS[0];
  const surfaceOpt =
    SURFACE_TONE_OPTIONS.find((s) => s.id === prefs.surfaceTone) || SURFACE_TONE_OPTIONS[0];

  root.style.setProperty('--font-sans', fontOpt.cssValue);
  root.style.setProperty('--font-display', fontOpt.cssValue);
  root.style.setProperty('--font-feature-settings', fontOpt.featureSettings);
  root.style.setProperty('--brand-navy', themeOpt.primary);
  root.style.setProperty('--brand-navy-dark', themeOpt.primaryHover);
  root.style.setProperty('--brand-nav-bg', themeOpt.navBg);
  root.style.setProperty('--brand-sky', themeOpt.skyTint);
  root.style.setProperty('--app-bg', surfaceOpt.bgColor);
  root.style.fontSize = scaleOpt.pxValue;

  root.dataset.fontSmoothing = prefs.fontSmoothing;
  root.dataset.themePreset = prefs.themePreset;
  root.dataset.fontFamily = prefs.fontFamily;
  root.dataset.showKpi = prefs.showKpiCards ? 'true' : 'false';
}

export function resetUiPreferences(): UiPreferences {
  const defaults = { ...DEFAULT_UI_PREFERENCES };
  saveUiPreferences(defaults);
  applyUiPreferences(defaults);
  return defaults;
}
