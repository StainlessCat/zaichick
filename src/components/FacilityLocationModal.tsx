import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarRange,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Compass,
  HelpCircle,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { FacilityLocationPreset, FacilityObject, WeldJoint } from '../types/welding';
import {
  calculateHaversineDistanceKm,
  checkWeatherServiceHealth,
  determineDateObservationStatus,
  fetchAmbientTemperatureAuto,
  fetchStationDailyObservations,
  findNearbyWeatherStations,
  formatDateDDMMYY,
  formatObservationTemp,
  getFacilityWeatherStationName,
  VERIFIED_WMO_STATIONS,
  WeatherDataSourceType,
  WeatherServiceHealth,
  WeatherStationMetadata,
} from '../utils/weldingLogic';

interface FacilityLocationModalProps {
  isOpen: boolean;
  facility: FacilityObject | null;
  facilities: FacilityObject[];
  presets: FacilityLocationPreset[];
  joints?: WeldJoint[];
  onSaveLocation: (
    objectName: string,
    location: {
      region: string;
      weatherStation: string;
      weatherStationId?: string;
      weatherStationDistanceKm?: number;
      weatherStationSource?: string;
      weatherLastCheckStatus?: string;
      weatherLastCheckedAt?: string;
      weatherLastErrorMessage?: string;
      latitude: number;
      longitude: number;
      weatherArchive?: Record<string, string>;
      weatherObservations?: Record<string, any>;
    }
  ) => void;
  onBulkUpdateJoints?: (
    facilityName: string,
    confirm: boolean
  ) => { updatedCount: number; message: string };
  onClose: () => void;
}

export const FacilityLocationModal: React.FC<FacilityLocationModalProps> = ({
  isOpen,
  facility,
  facilities,
  presets,
  joints = [],
  onSaveLocation,
  onBulkUpdateJoints,
  onClose,
}) => {
  const [selectedObjName, setSelectedObjName] = useState('');
  const [region, setRegion] = useState('');
  const [weatherStation, setWeatherStation] = useState('');
  const [weatherStationId, setWeatherStationId] = useState('');
  const [sourceType, setSourceType] = useState<WeatherDataSourceType>('meteostat');
  const [latitude, setLatitude] = useState(59.93);
  const [longitude, setLongitude] = useState(32.34);
  const [periodStart, setPeriodStart] = useState('2026-04-01');
  const [periodEnd, setPeriodEnd] = useState('2026-09-30');
  const [weatherArchive, setWeatherArchive] = useState<Record<string, string>>({});
  const [weatherObservations, setWeatherObservations] = useState<Record<string, any>>({});

  // 1. Сигнализация доступности сервиса (На связи / Нет связи)
  const [serviceHealth, setServiceHealth] = useState<WeatherServiceHealth | null>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);

  // 2. Сигнализация наличия данных на конкретную дату
  const [testDate, setTestDate] = useState('2026-06-15');
  const [dateCheckStatus, setDateCheckStatus] = useState<{
    status: 'idle' | 'checking' | 'available' | 'not_found' | 'pending';
    tempC?: string;
    source?: string;
    message: string;
  }>({
    status: 'idle',
    message: 'Выберите дату для проверки наблюдений станции',
  });

  // Загрузка архива наблюдений за период
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [archiveLoadMessage, setArchiveLoadMessage] = useState<string | null>(null);

  // Поиск станций
  const [searchQuery, setSearchQuery] = useState('');
  const [showManualCoords, setShowManualCoords] = useState(false);

  // Диалог подтверждения массового обновления стыков
  const [isConfirmingBulkUpdate, setIsConfirmingBulkUpdate] = useState(false);
  const [bulkUpdateResult, setBulkUpdateResult] = useState<string | null>(null);

  // Проверка связи с сервисом
  const performHealthCheck = async (src: WeatherDataSourceType = sourceType) => {
    setIsCheckingHealth(true);
    try {
      const health = await checkWeatherServiceHealth(src);
      setServiceHealth(health);
    } finally {
      setIsCheckingHealth(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const target = facility || facilities[0];
    if (target) {
      setSelectedObjName(target.name);
      setRegion(target.region);
      setWeatherStation(getFacilityWeatherStationName(target));
      setWeatherStationId(target.weatherStationId || '26078');
      setSourceType(
        target.weatherStationSource === 'open-meteo-era5' ? 'open-meteo-era5' : 'meteostat'
      );
      setLatitude(target.latitude);
      setLongitude(target.longitude);
      setWeatherArchive(target.weatherArchive || {});
      setWeatherObservations(target.weatherObservations || {});
    } else {
      setSelectedObjName('КС Волховская');
      setRegion('Ленинградская область, г. Волхов');
      setWeatherStation('Метеостанция г. Волхов (№26078)');
      setWeatherStationId('26078');
      setSourceType('meteostat');
      setLatitude(59.93);
      setLongitude(32.34);
      setWeatherArchive({});
      setWeatherObservations({});
    }

    setSearchQuery('');
    setShowManualCoords(false);
    setDateCheckStatus({
      status: 'idle',
      message: 'Выберите дату для проверки наблюдений станции',
    });
    setArchiveLoadMessage(null);
    setIsConfirmingBulkUpdate(false);
    setBulkUpdateResult(null);

    // Автоматическая проверка связи при открытии модального окна
    performHealthCheck('meteostat');
  }, [isOpen, facility, facilities]);

  // Нахождение ближайших реальных станций по координатам объекта
  const nearbyStations = useMemo(() => {
    const list = findNearbyWeatherStations(latitude, longitude, 12);
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.region.toLowerCase().includes(q)
    );
  }, [latitude, longitude, searchQuery]);

  // Выбор метеостанции
  const handleSelectStation = (st: WeatherStationMetadata) => {
    setWeatherStation(`${st.name} (ID: ${st.id})`);
    setWeatherStationId(st.id);
    setRegion(st.region);
    setDateCheckStatus({
      status: 'idle',
      message: `Выбрана ${st.name}. Проверьте наличие данных на дату.`,
    });
  };

  // Переключение объекта
  const handleSelectObject = (name: string) => {
    setSelectedObjName(name);
    const found = facilities.find((f) => f.name === name);
    if (found) {
      setRegion(found.region);
      setWeatherStation(getFacilityWeatherStationName(found));
      setWeatherStationId(found.weatherStationId || '26078');
      setSourceType(
        found.weatherStationSource === 'open-meteo-era5' ? 'open-meteo-era5' : 'meteostat'
      );
      setLatitude(found.latitude);
      setLongitude(found.longitude);
      setWeatherArchive(found.weatherArchive || {});
      setWeatherObservations(found.weatherObservations || {});
      setDateCheckStatus({
        status: 'idle',
        message: 'Выберите дату для проверки наблюдений станции',
      });
      setBulkUpdateResult(null);
    }
  };

  // Проверка наблюдений на конкретную дату
  const handleCheckDateObservations = async () => {
    setDateCheckStatus({
      status: 'checking',
      message: 'Запрос данных метеонаблюдений...',
    });

    const nowIso = new Date().toISOString().slice(0, 10);
    const { isPending } = determineDateObservationStatus(testDate, nowIso);

    if (isPending) {
      setDateCheckStatus({
        status: 'pending',
        tempC: '',
        message: 'Данные ещё не поступили (задержка обновления архива метеостанции 1–7 дней)',
      });
      return;
    }

    // Проверяем локальный архив или запрашиваем станцию
    if (weatherArchive[testDate] !== undefined && weatherArchive[testDate].trim() !== '') {
      const val = weatherArchive[testDate];
      setDateCheckStatus({
        status: 'available',
        tempC: val,
        source: weatherStation,
        message: `Данные станции доступны за эту дату: ${val} °C`,
      });
      return;
    }

    try {
      const obsMap = await fetchStationDailyObservations(
        { id: weatherStationId || '26078', name: weatherStation, latitude, longitude },
        testDate,
        testDate,
        { sourceType }
      );
      const obs = obsMap[testDate];
      if (obs && obs.status === 'available' && obs.tavg !== undefined) {
        const fmt = formatObservationTemp(obs.tavg);
        setDateCheckStatus({
          status: 'available',
          tempC: fmt,
          source: obs.sourceDescription,
          message: `Данные станции доступны за эту дату: ${fmt} °C`,
        });
      } else if (obs && obs.status === 'pending') {
        setDateCheckStatus({
          status: 'pending',
          tempC: '',
          message: 'Данные ещё не поступили',
        });
      } else {
        // КАТЕГОРИЧЕСКИЙ ЗАПРЕТ НА ПОДМЕНУ РАСЧЁТНОЙ ФОРМУЛОЙ!
        setDateCheckStatus({
          status: 'not_found',
          tempC: '',
          message: 'За дату данных нет (наблюдения на выбранной метеостанции отсутствуют)',
        });
      }
    } catch (err: any) {
      setDateCheckStatus({
        status: 'not_found',
        tempC: '',
        message: `Ошибка связи: ${err?.message || 'Сервис метеонаблюдений недоступен'}. Климатическая подмена запрещена.`,
      });
    }
  };

  // Загрузка дневного архива наблюдений за выбранный период
  const handleLoadDailyObservationsArchive = async () => {
    setIsLoadingArchive(true);
    setArchiveLoadMessage(null);
    try {
      const obsMap = await fetchStationDailyObservations(
        { id: weatherStationId || '26078', name: weatherStation, latitude, longitude },
        periodStart,
        periodEnd,
        { sourceType }
      );
      const newArchive: Record<string, string> = { ...weatherArchive };
      let loadedCount = 0;
      let missingCount = 0;

      Object.entries(obsMap).forEach(([d, obs]) => {
        if (obs.status === 'available' && obs.tavg !== undefined) {
          newArchive[d] = formatObservationTemp(obs.tavg);
          loadedCount++;
        } else {
          missingCount++;
        }
      });

      setWeatherArchive(newArchive);
      setWeatherObservations(obsMap);
      setArchiveLoadMessage(
        `Загружено ${loadedCount} сут. фактических наблюдений. За ${missingCount} сут. наблюдения на станции отсутствуют (статус «нет данных»).`
      );
    } catch (err: any) {
      setArchiveLoadMessage(`Ошибка загрузки архива: ${err?.message || 'Сбой сети'}`);
    } finally {
      setIsLoadingArchive(false);
    }
  };

  // Количество стыков на текущем объекте
  const facilityJoints = useMemo(() => {
    return joints.filter((j) => j.objectName === selectedObjName);
  }, [joints, selectedObjName]);

  // Выполнение явного массового обновления стыков с подтверждением
  const handleConfirmBulkUpdate = () => {
    if (!onBulkUpdateJoints) return;
    const res = onBulkUpdateJoints(selectedObjName, true);
    setBulkUpdateResult(res.message);
    setIsConfirmingBulkUpdate(false);
  };

  // Сохранение настроек метеопункта объекта
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanObjName = selectedObjName.trim();
    if (!cleanObjName) return;

    onSaveLocation(cleanObjName, {
      region: region.trim() || 'Промышленная площадка',
      weatherStation: weatherStation.trim() || 'Метеостанция объекта',
      weatherStationId: weatherStationId || '26078',
      weatherStationDistanceKm: calculateHaversineDistanceKm(
        latitude,
        longitude,
        nearbyStations[0]?.latitude ?? latitude,
        nearbyStations[0]?.longitude ?? longitude
      ),
      weatherStationSource: sourceType,
      weatherLastCheckStatus: serviceHealth?.status || 'online',
      weatherLastCheckedAt: serviceHealth?.lastCheckedAt || new Date().toISOString(),
      weatherLastErrorMessage: serviceHealth?.errorMessage,
      latitude: Number(latitude),
      longitude: Number(longitude),
      weatherArchive,
      weatherObservations,
    });
    onClose();
  };

  if (!isOpen) return null;

  const archiveDaysCount = Object.keys(weatherArchive).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Настройка метеопункта объекта и архива наблюдений"
    >
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Шапка */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-[#1e3799] to-[#2a4dbd] text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <CloudSun className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold">
                Метеопункт объекта и архив наблюдений
              </h2>
              <p className="text-[11px] text-sky-100">
                СТО Газпром 15-1.1-002-2023 · Наблюдения реальных метеостанций Росгидромета / Meteostat
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно"
            className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Тело модального окна */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* 1. БЛОК СИГНАЛИЗАЦИИ ДОСТУПНОСТИ СЕРВИСА */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  serviceHealth?.status === 'online'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700'
                }`}
              >
                {serviceHealth?.status === 'online' ? (
                  <Wifi className="w-4 h-4" />
                ) : (
                  <WifiOff className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-800">
                    Доступность сервиса метеоданных:
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      serviceHealth?.status === 'online'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}
                  >
                    {serviceHealth?.status === 'online' ? 'На связи' : 'Нет связи'}
                    {serviceHealth?.responseTimeMs !== undefined && (
                      <span className="text-[9px] opacity-75">
                        ({serviceHealth.responseTimeMs} мс)
                      </span>
                    )}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {serviceHealth?.status === 'online'
                    ? `Успешное соединение · ${serviceHealth.lastCheckedAt ? new Date(serviceHealth.lastCheckedAt).toLocaleTimeString() : ''}`
                    : `Сбой: ${serviceHealth?.errorMessage || 'Сервер не отвечает'}`}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => performHealthCheck(sourceType)}
              disabled={isCheckingHealth}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs shrink-0"
            >
              {isCheckingHealth ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#1e3799]" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 text-[#1e3799]" />
              )}
              <span>Проверить связь</span>
            </button>
          </div>

          {/* 2. ВЫБОР ОБЪЕКТА СТРОИТЕЛЬСТВА */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Объект строительства:
            </label>
            <select
              value={selectedObjName}
              onChange={(e) => handleSelectObject(e.target.value)}
              aria-label="Выбор объекта строительства"
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-medium text-xs sm:text-sm text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-[#1e3799]"
            >
              {facilities.map((f) => (
                <option key={f.id} value={f.name}>
                  {f.name} ({getFacilityWeatherStationName(f)})
                </option>
              ))}
            </select>
          </div>

          {/* 3. ВЫБОР ИСТОЧНИКА ДАННЫХ (Meteostat Daily vs Open-Meteo ERA5 Reanalysis) */}
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 space-y-2">
            <span className="text-xs font-bold text-slate-800">
              Источник данных метеоархива:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  sourceType === 'meteostat'
                    ? 'bg-sky-50 border-[#1e3799] ring-1 ring-[#1e3799]'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="sourceType"
                  value="meteostat"
                  checked={sourceType === 'meteostat'}
                  onChange={() => setSourceType('meteostat')}
                  className="mt-0.5 text-[#1e3799]"
                />
                <div>
                  <span className="font-bold text-slate-900 block">
                    Meteostat Daily (Основной)
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Фактические наблюдения выбранной метеостанции (model=false, без синтетических данных).
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  sourceType === 'open-meteo-era5'
                    ? 'bg-amber-50 border-amber-600 ring-1 ring-amber-600'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="sourceType"
                  value="open-meteo-era5"
                  checked={sourceType === 'open-meteo-era5'}
                  onChange={() => setSourceType('open-meteo-era5')}
                  className="mt-0.5 text-amber-600"
                />
                <div>
                  <span className="font-bold text-slate-900 block">
                    Open-Meteo ERA5 (Опция)
                  </span>
                  <span className="text-[11px] text-amber-800 font-medium">
                    «реанализ, не наблюдения метеостанции» (модельная сетка по координатам).
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* 4. ВЫБОР РЕАЛЬНОЙ МЕТЕОСТАНЦИИ С ОТОБРАЖЕНИЕМ РАССТОЯНИЯ И ИДЕНТИФИКАТОРА */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#1e3799]" />
                <span>Ближайшие реальные метеостанции по координатам площадки:</span>
              </span>
              <span className="text-[11px] text-slate-500">
                Координаты: {latitude.toFixed(2)}°N, {longitude.toFixed(2)}°E
              </span>
            </div>

            {/* Быстрый фильтр станций */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Фильтр станций по названию, WMO ID или городу..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1e3799]"
              />
            </div>

            {/* Список станций с расстоянием (км) и WMO ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-200">
              {nearbyStations.map((st) => {
                const isSelected = weatherStationId === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => handleSelectStation(st)}
                    className={`p-2.5 rounded-lg border text-left transition-all flex items-start justify-between gap-2 cursor-pointer ${
                      isSelected
                        ? 'bg-sky-50 border-[#1e3799] ring-2 ring-[#1e3799]/30 shadow-2xs'
                        : 'bg-white border-slate-200 hover:border-sky-400 hover:bg-sky-50/40'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-xs text-slate-900 truncate flex items-center gap-1.5">
                        <span>{st.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {st.region} · WMO ID: <span className="font-mono font-bold">{st.id}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="font-mono font-bold text-[11px] text-[#1e3799] bg-sky-100 px-1.5 py-0.5 rounded">
                        {st.distanceKm} км
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. АКТИВНАЯ СТАНЦИЯ И ПРОВЕРКА НАЛИЧИЯ ДАННЫХ НА ДАТУ */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-200 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-800">
                  Подтверждённая метеостанция для объекта
                </span>
                <div className="font-bold text-sm text-[#1e3799] truncate">
                  {weatherStation}
                </div>
                <div className="text-[11px] text-slate-600 mt-0.5">
                  WMO ID: <span className="font-mono font-bold">{weatherStationId}</span> · {region}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span className="inline-flex items-center gap-1 font-mono text-xs font-bold text-[#1e3799] bg-white px-2 py-1 rounded-md border border-sky-200 shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{archiveDaysCount} сут. в архиве</span>
                </span>
              </div>
            </div>

            {/* Проверка наблюдений на дату */}
            <div className="pt-2.5 border-t border-sky-200/60">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <span className="text-xs font-bold text-slate-800">
                  Проверка фактических данных станции на дату сварки:
                </span>
                <input
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                  aria-label="Дата для проверки наблюдений"
                  className="px-2 py-1 bg-white border border-slate-300 rounded-md font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={handleCheckDateObservations}
                  className="px-3 py-1 bg-[#1e3799] hover:bg-[#152a77] text-white rounded-md text-xs font-semibold transition-colors cursor-pointer"
                >
                  Проверить наблюдения
                </button>
              </div>

              {/* Статус наличия данных */}
              {dateCheckStatus.status !== 'idle' && (
                <div
                  className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 ${
                    dateCheckStatus.status === 'available'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : dateCheckStatus.status === 'pending'
                      ? 'bg-sky-50 border-sky-300 text-sky-900'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {dateCheckStatus.status === 'available' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    )}
                    <span>{dateCheckStatus.message}</span>
                  </div>
                  {dateCheckStatus.status === 'available' && dateCheckStatus.tempC && (
                    <span className="font-mono font-bold text-sm bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-800 shrink-0">
                      {dateCheckStatus.tempC} °C
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 6. ПЕРИОД НАБЛЮДЕНИЙ И ЗАГРУЗКА АРХИВА */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <CalendarRange className="w-3.5 h-3.5 text-[#1e3799]" />
                <span>Загрузка дневного архива наблюдений за период:</span>
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                aria-label="Начало периода"
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs"
              />
              <span className="text-slate-400">—</span>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                aria-label="Конец периода"
                className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs"
              />
              <button
                type="button"
                onClick={handleLoadDailyObservationsArchive}
                disabled={isLoadingArchive}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {isLoadingArchive ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CloudSun className="w-3.5 h-3.5" />
                )}
                <span>Загрузить дневной архив</span>
              </button>
            </div>

            {archiveLoadMessage && (
              <div className="text-[11px] font-medium text-slate-600 bg-white p-2 rounded-lg border border-slate-200">
                {archiveLoadMessage}
              </div>
            )}
          </div>

          {/* 7. ЗАЩИТА СТЫКОВ: СМЕНА СТАНЦИИ НЕ МЕНЯЕТ ЗАПИСАННЫЕ ТЕМПЕРАТУРЫ МОЛЧА */}
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>Изоляция температур сваренных стыков</span>
                </span>
                <p className="text-[11px] text-amber-900 mt-0.5">
                  Смена метеостанции не изменяет уже зафиксированные температуры в паспортах стыков.
                  Для обновления температур требуется отдельная команда с подтверждением.
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-xs font-mono font-bold text-slate-700 bg-white px-2 py-0.5 rounded border border-amber-200">
                  Стыков объекта: {facilityJoints.length}
                </span>
              </div>
            </div>

            {/* Кнопка отдельной команды с подтверждением */}
            <div className="pt-2 flex items-center gap-2 flex-wrap">
              {!isConfirmingBulkUpdate ? (
                <button
                  type="button"
                  onClick={() => setIsConfirmingBulkUpdate(true)}
                  disabled={facilityJoints.length === 0 || archiveDaysCount === 0}
                  className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Обновить температуры стыков по выбранной метеостанции</span>
                </button>
              ) : (
                <div className="w-full p-3 rounded-lg bg-white border border-amber-300 space-y-2">
                  <p className="text-xs font-bold text-amber-950">
                    Подтвердите обновление температур для {facilityJoints.length} стыков объекта «{selectedObjName}» по наблюдениям станции «{weatherStation}»?
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmBulkUpdate}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold cursor-pointer"
                    >
                      Да, обновить
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingBulkUpdate(false)}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-medium cursor-pointer"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}

              {bulkUpdateResult && (
                <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-300">
                  {bulkUpdateResult}
                </span>
              )}
            </div>
          </div>
        </form>

        {/* Футер */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-[11px] text-slate-500 font-mono">
            {latitude.toFixed(2)}°N, {longitude.toFixed(2)}°E · WMO {weatherStationId}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-[#1e3799] hover:bg-[#152a77] text-white transition-all shadow-sm hover:shadow cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Подтвердить для объекта</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
