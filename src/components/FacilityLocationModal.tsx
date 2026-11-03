import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Building2,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Compass,
  Globe,
  Loader2,
  MapPin,
  Navigation,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { FacilityLocationPreset, FacilityObject } from '../types/welding';
import {
  estimateAmbientTempByCoordsAndDate,
  fetchAmbientTemperatureAuto,
  formatDateDDMMYY,
  generatePeriodWeatherArchive,
  getFacilityWeatherStationName,
} from '../utils/weldingLogic';

interface OnlineGeocodingItem {
  id: string | number;
  name: string;
  region: string;
  weatherStation: string;
  latitude: number;
  longitude: number;
  elevation?: number;
  isOnline: boolean;
}

interface FacilityLocationModalProps {
  isOpen: boolean;
  facility: FacilityObject | null;
  facilities: FacilityObject[];
  presets: FacilityLocationPreset[];
  onSaveLocation: (
    objectName: string,
    location: {
      region: string;
      weatherStation: string;
      latitude: number;
      longitude: number;
      weatherArchive?: Record<string, string>;
    }
  ) => void;
  onClose: () => void;
}

export const FacilityLocationModal: React.FC<FacilityLocationModalProps> = ({
  isOpen,
  facility,
  facilities,
  presets,
  onSaveLocation,
  onClose,
}) => {
  const [selectedObjName, setSelectedObjName] = useState('');
  const [region, setRegion] = useState('');
  const [weatherStation, setWeatherStation] = useState('');
  const [latitude, setLatitude] = useState(59.93);
  const [longitude, setLongitude] = useState(32.34);
  const [previewDate, setPreviewDate] = useState('2026-06-15');
  const [periodStart, setPeriodStart] = useState('2026-04-01');
  const [periodEnd, setPeriodEnd] = useState('2026-09-30');
  const [weatherArchive, setWeatherArchive] = useState<Record<string, string> | undefined>(
    undefined
  );

  // Глобальный поиск метеостанции / города
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineResults, setOnlineResults] = useState<OnlineGeocodingItem[]>([]);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Свернуть/развернуть ручные координаты (для экспертов)
  const [showManualCoords, setShowManualCoords] = useState(false);

  // Результат тестирования температуры на конкретную дату
  const [archiveResult, setArchiveResult] = useState<{
    tempC: string;
    source: string;
  } | null>(null);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const target = facility || facilities[0];
    if (target) {
      setSelectedObjName(target.name);
      setRegion(target.region);
      setWeatherStation(getFacilityWeatherStationName(target));
      setLatitude(target.latitude);
      setLongitude(target.longitude);
      setWeatherArchive(target.weatherArchive);
      setArchiveResult(null);
    } else {
      setSelectedObjName('КС Волховская');
      setRegion('Ленинградская область, г. Волхов');
      setWeatherStation('Метеостанция г. Волхов (№26078)');
      setLatitude(59.93);
      setLongitude(32.34);
      setWeatherArchive(generatePeriodWeatherArchive(59.93, 32.34, '2026-04-01', '2026-09-30'));
      setArchiveResult(null);
    }
    setSearchQuery('');
    setOnlineResults([]);
    setGpsError(null);
    setShowManualCoords(false);
  }, [isOpen, facility, facilities]);

  const handleSelectObject = (name: string) => {
    setSelectedObjName(name);
    const found = facilities.find((f) => f.name === name);
    if (found) {
      setRegion(found.region);
      setWeatherStation(getFacilityWeatherStationName(found));
      setLatitude(found.latitude);
      setLongitude(found.longitude);
      setWeatherArchive(found.weatherArchive);
      setArchiveResult(null);
    }
  };

  // Мгновенный поиск по локальным пресетам
  const matchingPresets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return presets.slice(0, 8); // первые 8 популярных станций по умолчанию
    return presets.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.weatherStation.toLowerCase().includes(q) ||
        p.region.toLowerCase().includes(q)
    );
  }, [presets, searchQuery]);

  // Онлайн-геокодинг через Open-Meteo Geocoding API (с debounce 350мс)
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setOnlineResults([]);
      setIsSearchingOnline(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingOnline(true);
      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          q
        )}&count=8&language=ru&format=json`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.results)) {
            const mapped: OnlineGeocodingItem[] = data.results.map(
              (r: {
                id: number;
                name: string;
                latitude: number;
                longitude: number;
                admin1?: string;
                country?: string;
                elevation?: number;
              }) => {
                const regStr = [r.admin1, r.country || 'Россия'].filter(Boolean).join(', ');
                return {
                  id: `geo-${r.id}`,
                  name: r.name,
                  region: regStr || 'Россия',
                  weatherStation: `АМСГ / Метеопост ${r.name} (${regStr})`,
                  latitude: Math.round(r.latitude * 100) / 100,
                  longitude: Math.round(r.longitude * 100) / 100,
                  elevation: r.elevation,
                  isOnline: true,
                };
              }
            );
            setOnlineResults(mapped);
          } else {
            setOnlineResults([]);
          }
        }
      } catch {
        // Ошибки сети не прерывают работу, остаются локальные станции
        setOnlineResults([]);
      } finally {
        setIsSearchingOnline(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Выбор метеостанции в один клик
  const handleSelectStation = (item: {
    weatherStation: string;
    region: string;
    latitude: number;
    longitude: number;
  }) => {
    setWeatherStation(item.weatherStation);
    setRegion(item.region);
    setLatitude(item.latitude);
    setLongitude(item.longitude);

    // Автоматическая подгрузка архива для выбранной станции
    const generated = generatePeriodWeatherArchive(
      item.latitude,
      item.longitude,
      periodStart,
      periodEnd
    );
    setWeatherArchive(generated);
    setArchiveResult(null);
    setSearchQuery('');
  };

  // Определение координат через GPS браузера
  const handleDetectDeviceGps = () => {
    if (!navigator.geolocation) {
      setGpsError('Геолокация не поддерживается вашим браузером');
      return;
    }
    setIsLocatingGps(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocatingGps(false);
        const lat = Math.round(pos.coords.latitude * 100) / 100;
        const lon = Math.round(pos.coords.longitude * 100) / 100;
        const stationName = `Метеопункт площадки (GPS ${lat}° с.ш., ${lon}° в.д.)`;
        const regName = 'Текущие координаты объекта строительства';
        handleSelectStation({
          weatherStation: stationName,
          region: regName,
          latitude: lat,
          longitude: lon,
        });
      },
      (err) => {
        setIsLocatingGps(false);
        setGpsError(`Не удалось получить координаты: ${err.message}`);
      },
      { timeout: 9000, enableHighAccuracy: true }
    );
  };

  const handleLoadPeriodArchive = () => {
    const generated = generatePeriodWeatherArchive(
      Number(latitude),
      Number(longitude),
      periodStart,
      periodEnd
    );
    setWeatherArchive(generated);
  };

  const previewTemp = estimateAmbientTempByCoordsAndDate(
    latitude,
    longitude,
    previewDate
  );
  const formattedModelTemp = previewTemp > 0 ? `+${previewTemp}` : `${previewTemp}`;

  const handleCheckRealArchive = async () => {
    setIsLoadingArchive(true);
    try {
      const res = await fetchAmbientTemperatureAuto(
        latitude,
        longitude,
        previewDate,
        weatherArchive
      );
      setArchiveResult(res);
    } finally {
      setIsLoadingArchive(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanObjName = selectedObjName.trim();
    if (!cleanObjName) return;
    const finalArchive =
      weatherArchive && Object.keys(weatherArchive).length > 0
        ? weatherArchive
        : generatePeriodWeatherArchive(
            Number(latitude),
            Number(longitude),
            periodStart,
            periodEnd
          );
    onSaveLocation(cleanObjName, {
      region: region.trim() || 'Промышленная площадка',
      weatherStation: weatherStation.trim() || 'Метеопункт объекта',
      latitude: Number(latitude),
      longitude: Number(longitude),
      weatherArchive: finalArchive,
    });
    onClose();
  };

  if (!isOpen) return null;

  const archiveDaysCount = weatherArchive ? Object.keys(weatherArchive).length : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Глобальный поиск и выбор метеостанции"
    >
      <div
        className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Шапка модального окна */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#1e3799] to-[#0d226b] text-white shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Globe className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">
                Глобальный выбор метеостанции и погоды
              </h2>
              <p className="text-xs text-sky-200 mt-0.5">
                Найдите любой город или метеостанцию по названию — система автоматически привяжет координаты и архив температур
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно выбора метеостанции"
            className="p-2 rounded-lg text-sky-100 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-5 sm:p-6 space-y-4 overflow-y-auto text-xs flex-1"
        >
          {/* 1. Выбор объекта строительства */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#1e3799]" />
              <span className="font-bold text-slate-800 text-xs">Объект строительства:</span>
            </div>
            <div className="flex-1 min-w-[240px]">
              {facilities.length > 0 ? (
                <select
                  value={selectedObjName}
                  onChange={(e) => handleSelectObject(e.target.value)}
                  aria-label="Объект для настройки метеостанции"
                  className="w-full px-3 py-1.5 bg-white border border-[#1e3799]/40 rounded-lg text-xs font-semibold text-[#1e3799] focus:outline-none focus:ring-2 focus:ring-[#1e3799]"
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.name} ({getFacilityWeatherStationName(f)} · {f.region})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={selectedObjName}
                  onChange={(e) => setSelectedObjName(e.target.value)}
                  placeholder="Например: КС Волховская"
                  aria-label="Наименование нового объекта строительства"
                  className="w-full px-3 py-1.5 bg-white border border-[#1e3799] rounded-lg text-xs font-semibold text-[#1e3799]"
                />
              )}
            </div>
          </div>

          {/* 2. ГЛОБАЛЬНАЯ ПОИСКОВАЯ СТРОКА */}
          <div className="p-4 rounded-xl bg-gradient-to-br from-sky-50/70 to-indigo-50/50 border-2 border-[#1e3799]/30 space-y-3 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="global-station-search"
                className="font-bold text-slate-900 text-xs flex items-center gap-1.5"
              >
                <Search className="w-4 h-4 text-[#1e3799]" />
                <span>Глобальный поиск города или метеостанции:</span>
              </label>

              <button
                type="button"
                onClick={handleDetectDeviceGps}
                disabled={isLocatingGps}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-sky-300 hover:border-[#1e3799] text-[#1e3799] hover:bg-sky-50 text-xs font-semibold transition-colors cursor-pointer shadow-2xs"
                title="Определить координаты стройплощадки через датчик геолокации устройства"
              >
                {isLocatingGps ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Определение GPS...</span>
                  </>
                ) : (
                  <>
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Моё местоположение (GPS)</span>
                  </>
                )}
              </button>
            </div>

            {gpsError && (
              <div className="p-2 rounded bg-red-50 border border-red-200 text-[11px] text-red-700">
                {gpsError}
              </div>
            )}

            <div className="relative">
              <input
                ref={searchInputRef}
                id="global-station-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Введите название (например: Волгоград, Новый Уренгой, Самара, Котово, Тюмень...)"
                className="w-full pl-9 pr-9 py-2.5 bg-white border-2 border-[#1e3799] rounded-xl text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 shadow-sm"
              />
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#1e3799]" />
              {isSearchingOnline ? (
                <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[#1e3799] animate-spin" />
              ) : searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="p-1 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            {/* Выпадающий интерактивный список результатов */}
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              <div className="text-[11px] font-semibold text-slate-500 px-1 pt-1 flex items-center justify-between">
                <span>
                  {searchQuery.trim()
                    ? `Найдено станций и пунктов:`
                    : `Популярные опорные метеоцентры (нажмите для выбора):`}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  {matchingPresets.length + onlineResults.length} вариантов
                </span>
              </div>

              {/* Локальные опорные станции Газпрома / Росгидромета */}
              {matchingPresets.map((preset) => {
                const isSelected =
                  Math.abs(preset.latitude - latitude) < 0.05 &&
                  Math.abs(preset.longitude - longitude) < 0.05;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      handleSelectStation({
                        weatherStation: preset.weatherStation,
                        region: preset.region,
                        latitude: preset.latitude,
                        longitude: preset.longitude,
                      })
                    }
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-blue-50/90 border-[#1e3799] ring-2 ring-[#1e3799]/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-[#1e3799]/50 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {preset.title}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-[#1e3799] text-white">
                          Опорная станция ВМО
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 truncate mt-0.5">
                        {preset.region} · {preset.weatherStation}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono text-[11px]">
                      <span className="font-bold text-[#1e3799]">
                        {preset.latitude.toFixed(2)}°N, {preset.longitude.toFixed(2)}°E
                      </span>
                    </div>
                  </button>
                );
              })}

              {/* Онлайн-результаты геокодинга (любые города, посёлки, райцентры) */}
              {onlineResults.map((online) => {
                const isSelected =
                  Math.abs(online.latitude - latitude) < 0.05 &&
                  Math.abs(online.longitude - longitude) < 0.05;
                return (
                  <button
                    key={online.id}
                    type="button"
                    onClick={() =>
                      handleSelectStation({
                        weatherStation: online.weatherStation,
                        region: online.region,
                        latitude: online.latitude,
                        longitude: online.longitude,
                      })
                    }
                    className={`w-full p-2.5 rounded-xl border text-left transition-all flex items-start justify-between gap-3 cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {online.name}
                        </span>
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-600 text-white">
                          Глобальный поиск
                        </span>
                        {online.elevation !== undefined && (
                          <span className="text-[10px] text-slate-400">
                            {online.elevation} м
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-600 truncate mt-0.5">
                        {online.region}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-mono text-[11px]">
                      <span className="font-bold text-emerald-800">
                        {online.latitude.toFixed(2)}°N, {online.longitude.toFixed(2)}°E
                      </span>
                    </div>
                  </button>
                );
              })}

              {searchQuery.trim().length >= 2 &&
                matchingPresets.length === 0 &&
                onlineResults.length === 0 &&
                !isSearchingOnline && (
                  <div className="p-4 text-center text-slate-500 bg-white rounded-xl border border-dashed border-slate-300">
                    <p className="font-medium text-xs">
                      По запросу «{searchQuery}» станции не найдены в онлайн-базе
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Вы можете указать координаты площадки вручную в блоке ниже
                    </p>
                  </div>
                )}
            </div>
          </div>

          {/* 3. КАРТОЧКА ТЕКУЩЕЙ ВЫБРАННОЙ МЕТЕОСТАНЦИИ */}
          <div className="p-4 rounded-xl bg-white border-2 border-emerald-500/40 shadow-xs space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-emerald-800">
                    Активная метеостанция для объекта
                  </span>
                  <div className="font-bold text-slate-900 text-xs sm:text-sm truncate">
                    {weatherStation}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                    {region}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-900 font-mono text-xs font-bold">
                  <Compass className="w-3.5 h-3.5 text-emerald-700" />
                  <span>
                    {latitude.toFixed(2)}°N, {longitude.toFixed(2)}°E
                  </span>
                </div>
              </div>
            </div>

            {/* Статус предзагруженного архива температур */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-600">
                Посуточная температурная база ({formatDateDDMMYY(periodStart)} —{' '}
                {formatDateDDMMYY(periodEnd)}):
              </span>
              <span className="inline-flex items-center gap-1 font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>{archiveDaysCount} сут. загружено в память объекта</span>
              </span>
            </div>
          </div>

          {/* 4. Настройка периода строительных работ и проверка температуры */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Период архива */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <CalendarRange className="w-4 h-4 text-[#1e3799]" />
                <span>Период строительства:</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={periodStart}
                  onChange={(e) => setPeriodStart(e.target.value)}
                  aria-label="Начало периода работ"
                  className="w-1/2 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                />
                <span className="text-slate-400">—</span>
                <input
                  type="date"
                  value={periodEnd}
                  onChange={(e) => setPeriodEnd(e.target.value)}
                  aria-label="Конец периода работ"
                  className="w-1/2 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs"
                />
              </div>
              <button
                type="button"
                onClick={handleLoadPeriodArchive}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Пересчитать архив за этот период</span>
              </button>
            </div>

            {/* Экспресс-проверка на дату сварки */}
            <div className="p-3.5 rounded-xl bg-[#e8f1fc] border border-sky-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-bold text-[#1e3799]">
                  <CloudSun className="w-4 h-4" />
                  <span>Проверка температуры:</span>
                </div>
                <span className="font-mono font-bold text-xs text-[#1e3799]">
                  {archiveResult
                    ? `${archiveResult.tempC} °C`
                    : `${formattedModelTemp} °C`}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={previewDate}
                  onChange={(e) => {
                    setPreviewDate(e.target.value);
                    setArchiveResult(null);
                  }}
                  aria-label="Дата для проверки температуры"
                  className="flex-1 px-2.5 py-1.5 bg-white border border-sky-300 rounded-lg font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={handleCheckRealArchive}
                  disabled={isLoadingArchive}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1e3799] hover:bg-[#15276e] text-white font-semibold text-xs transition-colors cursor-pointer shrink-0"
                >
                  {isLoadingArchive ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5" />
                  )}
                  <span>Проверить</span>
                </button>
              </div>

              <div className="text-[10px] text-slate-500 truncate">
                {archiveResult ? archiveResult.source : 'Расчёт по климатической сетке (СП 131.13330)'}
              </div>
            </div>
          </div>

          {/* 5. СПОЙЛЕР ДЛЯ ЭКСПЕРТОВ: РУЧНАЯ КОРРЕКТИРОВКА КООРДИНАТ */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowManualCoords(!showManualCoords)}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer py-1"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>
                {showManualCoords
                  ? 'Скрыть ручные параметры координат'
                  : 'Ручная корректировка координат площадки (при необходимости)'}
              </span>
              {showManualCoords ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>

            {showManualCoords && (
              <div className="mt-2 p-3.5 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Название метеостанции / населённого пункта
                  </label>
                  <input
                    type="text"
                    value={weatherStation}
                    onChange={(e) => setWeatherStation(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Регион / Район строительства
                  </label>
                  <input
                    type="text"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Широта (° с.ш.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={40}
                    max={78}
                    value={latitude}
                    onChange={(e) => {
                      setLatitude(Number(e.target.value));
                      setArchiveResult(null);
                    }}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-[#1e3799]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Долгота (° в.д.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={25}
                    max={175}
                    value={longitude}
                    onChange={(e) => {
                      setLongitude(Number(e.target.value));
                      setArchiveResult(null);
                    }}
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-mono font-bold text-[#1e3799]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Подвал и сохранение */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#1e3799] hover:bg-[#15276e] text-white font-bold transition-all shadow-md hover:shadow-lg cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Сохранить метеопункт объекта</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
