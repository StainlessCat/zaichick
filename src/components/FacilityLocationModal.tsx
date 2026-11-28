import { useModalDismiss } from '../hooks/useModalDismiss';
import { FacilityCustomStationForm } from './location/FacilityCustomStationForm';
import { FacilityUgmsImportPanel } from './location/FacilityUgmsImportPanel';
import { FacilityArchiveActionsPanel } from './location/FacilityArchiveActionsPanel';
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
  FileText,
  HelpCircle,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Upload,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { CustomWeatherStation, FacilityLocationPreset, FacilityObject, WeldJoint } from '../types/welding';
import {
  calculateHaversineDistanceKm,
  checkServerWeatherHealth,
  checkWeatherServiceHealth,
  determineDateObservationStatus,
  fetchAmbientTemperatureAuto,
  fetchSiteWeatherObservations,
  fetchStationDailyObservations,
  findNearbyWeatherStations,
  formatDateDDMMYY,
  formatObservationTemp,
  getFacilityWeatherStationName,
  parseUgmsWeatherCertificateCsv,
  searchLocationGeocoding,
  searchWeatherStations,
  UgmsImportResult,
  VERIFIED_WMO_STATIONS,
  WeatherDataSourceType,
  WeatherServiceHealth,
  WeatherStationMetadata,
  GeocodingSearchResult,
} from '../utils/weldingLogic';

interface FacilityLocationModalProps {
  isOpen: boolean;
  facility: FacilityObject | null;
  facilities: FacilityObject[];
  presets: FacilityLocationPreset[];
  joints?: WeldJoint[];
  customStations?: CustomWeatherStation[];
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
      customWeatherStations?: CustomWeatherStation[];
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

  // Кастомные поверенные метеопосты площадки (Этап 2)
  const [customStations, setCustomStations] = useState<CustomWeatherStation[]>([]);
  const [showAddCustomModal, setShowAddCustomModal] = useState(false);
  const [newCustomStation, setNewCustomStation] = useState({
    name: '',
    deviceModel: 'Метеокомплекс АМК-03',
    verificationCertNumber: '',
    verificationValidUntil: '2027-12-31',
    region: '',
  });

  // Импорт официальных справок УГМС Росгидромета (Этап 4)
  const [showUgmsModal, setShowUgmsModal] = useState(false);
  const [ugmsForm, setUgmsForm] = useState({
    docNumber: '',
    docDate: '2026-06-15',
    issuer: 'ФГБУ Северное УГМС Росгидромета',
    csvText: '',
  });
  const [ugmsParseResult, setUgmsParseResult] = useState<UgmsImportResult | null>(null);

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

  // Поиск станций и онлайн-геокодинг
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineLocations, setOnlineLocations] = useState<GeocodingSearchResult[]>([]);
  const [showManualCoords, setShowManualCoords] = useState(false);

  // Диалог подтверждения массового обновления стыков
  const [isConfirmingBulkUpdate, setIsConfirmingBulkUpdate] = useState(false);
  const [bulkUpdateResult, setBulkUpdateResult] = useState<string | null>(null);

  // Проверка связи с сервисом
  const performHealthCheck = async (src: WeatherDataSourceType = sourceType) => {
    setIsCheckingHealth(true);
    try {
      const serverHealth = await checkServerWeatherHealth();
      if (serverHealth.status === 'online' || src === 'open-meteo-era5') {
        setServiceHealth(serverHealth);
      } else {
        const health = await checkWeatherServiceHealth(src);
        setServiceHealth(health);
      }
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
      setWeatherStationId(target.weatherStationId || '');
      setSourceType(
        (target.weatherStationSource as WeatherDataSourceType) || 'meteostat'
      );
      setLatitude(target.latitude);
      setLongitude(target.longitude);
      setWeatherArchive(target.weatherArchive || {});
      setWeatherObservations(target.weatherObservations || {});
      setCustomStations(target.customWeatherStations || []);
    } else {
      setSelectedObjName('');
      setRegion('');
      setWeatherStation('Метеостанция не привязана');
      setWeatherStationId('');
      setSourceType('meteostat');
      setLatitude(55.0);
      setLongitude(55.0);
      setWeatherArchive({});
      setWeatherObservations({});
      setCustomStations([]);
    }

    setSearchQuery('');
    setOnlineLocations([]);
    setIsSearchingOnline(false);
    setShowManualCoords(false);
    setShowAddCustomModal(false);
    setShowUgmsModal(false);
    setUgmsParseResult(null);
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

  // Онлайн-геокодинг городов РФ через Open-Meteo Geocoding
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setOnlineLocations([]);
      setIsSearchingOnline(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingOnline(true);
      try {
        const results = await searchLocationGeocoding(q);
        setOnlineLocations(results);
      } catch {
        setOnlineLocations([]);
      } finally {
        setIsSearchingOnline(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Сквозной поиск по реестру станций WMO/Росгидромета и кастомных метеопостов
  const nearbyStations = useMemo(() => {
    return searchWeatherStations(searchQuery, latitude, longitude, 30, customStations);
  }, [latitude, longitude, searchQuery, customStations]);

  // Выбор метеостанции
  const handleSelectStation = (st: WeatherStationMetadata, syncCoords = true) => {
    setWeatherStation(`${st.name} (ID: ${st.id})`);
    setWeatherStationId(st.id);
    setRegion(st.region);
    if (st.source === 'custom') {
      setSourceType('custom');
    }
    if (syncCoords) {
      setLatitude(st.latitude);
      setLongitude(st.longitude);
    }
    setDateCheckStatus({
      status: 'idle',
      message: `Выбрана «${st.name}» (${st.source === 'custom' ? 'Поверенный метеопост' : `WMO ID: ${st.id}`}). Проверьте наличие данных на дату.`,
    });
  };

  // Выбор населённого пункта из геокодера
  const handleSelectGeocodedLocation = (geo: GeocodingSearchResult) => {
    setLatitude(geo.latitude);
    setLongitude(geo.longitude);
    setRegion(geo.region);
    handleSelectStation(geo.nearestStation, false);
    setDateCheckStatus({
      status: 'idle',
      message: `Площадка привязана к «${geo.name}» (${geo.region}). Ближайшая станция: ${geo.nearestStation.name} (${geo.distanceKm} км).`,
    });
  };

  // Сохранение нового поверенного метеопоста площадки (Этап 2)
  const handleSaveCustomStation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomStation.name.trim()) return;

    const created: CustomWeatherStation = {
      id: `amk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: newCustomStation.name.trim(),
      deviceModel: newCustomStation.deviceModel.trim() || 'АМК-03',
      verificationCertNumber: newCustomStation.verificationCertNumber.trim() || 'СП-2026/8841',
      verificationValidUntil: newCustomStation.verificationValidUntil,
      isVerified: true,
      region: newCustomStation.region.trim() || region || 'Регион площадки',
      latitude: Number(latitude),
      longitude: Number(longitude),
      createdAt: new Date().toISOString(),
      source: 'custom',
    };

    const updated = [created, ...customStations];
    setCustomStations(updated);
    setSourceType('custom');
    handleSelectStation({ ...created, country: 'RU' }, false);
    setShowAddCustomModal(false);
    setNewCustomStation({
      name: '',
      deviceModel: 'Метеокомплекс АМК-03',
      verificationCertNumber: '',
      verificationValidUntil: '2027-12-31',
      region: '',
    });
    setArchiveLoadMessage(
      `Поверенный метеопост «${created.name}» (Поверка ${created.verificationCertNumber}) успешно зарегистрирован и привязан к объекту.`
    );
  };

  // Парсинг текста справки УГМС (Этап 4)
  const handleParseUgmsText = () => {
    if (!ugmsForm.csvText.trim()) return;
    const res = parseUgmsWeatherCertificateCsv(ugmsForm.csvText, {
      docNumber: ugmsForm.docNumber.trim(),
      docDate: ugmsForm.docDate.trim(),
      issuer: ugmsForm.issuer.trim(),
      stationName: `Справка УГМС №${ugmsForm.docNumber.trim() || 'Б/Н'}`,
    });
    setUgmsParseResult(res);
  };

  // Применение справки УГМС к объекту и архиву (Этап 4)
  const handleApplyUgmsCertificate = () => {
    if (!ugmsParseResult || ugmsParseResult.parsedCount === 0) return;
    setWeatherArchive((prev) => ({ ...prev, ...ugmsParseResult.weatherArchive }));
    setWeatherObservations((prev) => ({ ...prev, ...ugmsParseResult.weatherObservations }));
    setSourceType('ugms-certificate');
    setWeatherStation(ugmsParseResult.docDescription);
    setWeatherStationId(ugmsForm.docNumber ? `УГМС-${ugmsForm.docNumber}` : 'UGMS-CERT');
    setShowUgmsModal(false);
    setDateCheckStatus({
      status: 'idle',
      message: `Импортировано ${ugmsParseResult.parsedCount} замеров из «${ugmsParseResult.docDescription}».`,
    });
    setArchiveLoadMessage(
      `Успешно внесено ${ugmsParseResult.parsedCount} сут. фактических наблюдений из официальной справки УГМС.`
    );
  };

  // Переключение объекта
  const handleSelectObject = (name: string) => {
    setSelectedObjName(name);
    const found = facilities.find((f) => f.name === name);
    if (found) {
      setRegion(found.region);
      setWeatherStation(getFacilityWeatherStationName(found));
      setWeatherStationId(found.weatherStationId || '');
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
    if (!weatherStationId) {
      setDateCheckStatus({
        status: 'not_found',
        message: 'Метеостанция не привязана к объекту. Сначала выберите станцию из каталога или зарегистрируйте поверенный метеопост.',
      });
      return;
    }

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
      let obsMap: Record<string, import('../utils/weatherService').DailyWeatherObservation> = {};
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        try {
          obsMap = await fetchSiteWeatherObservations(
            latitude,
            longitude,
            testDate,
            testDate,
            weatherStation || selectedObjName
          );
        } catch {
          obsMap = {};
        }
      }
      if (!obsMap[testDate]) {
        obsMap = await fetchStationDailyObservations(
          { id: weatherStationId || 'site', name: weatherStation, latitude, longitude },
          testDate,
          testDate,
          { sourceType }
        );
      }
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
    } catch (err: unknown) {
      setDateCheckStatus({
        status: 'not_found',
        tempC: '',
        message: `Ошибка связи: ${(err instanceof Error ? err.message : String(err)) || 'Сервис метеонаблюдений недоступен'}. Климатическая подмена запрещена.`,
      });
    }
  };

  // Загрузка дневного архива наблюдений за выбранный период
  const handleLoadDailyObservationsArchive = async () => {
    if (!weatherStationId) {
      setArchiveLoadMessage('Метеостанция не привязана к объекту. Сначала выберите станцию из каталога или зарегистрируйте поверенный метеопост.');
      return;
    }

    setIsLoadingArchive(true);
    setArchiveLoadMessage(null);
    try {
      let obsMap: Record<string, import('../utils/weatherService').DailyWeatherObservation> = {};
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        try {
          obsMap = await fetchSiteWeatherObservations(
            latitude,
            longitude,
            periodStart,
            periodEnd,
            weatherStation || selectedObjName
          );
        } catch {
          obsMap = {};
        }
      }
      if (Object.keys(obsMap).length === 0) {
        obsMap = await fetchStationDailyObservations(
          { id: weatherStationId || 'site', name: weatherStation, latitude, longitude },
          periodStart,
          periodEnd,
          { sourceType }
        );
      }
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
    } catch (err: unknown) {
      setArchiveLoadMessage(`Ошибка загрузки архива: ${(err instanceof Error ? err.message : String(err)) || 'Сбой сети'}`);
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
      weatherStationId: weatherStationId || undefined,
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
      customWeatherStations: customStations,
    });
    onClose();
  };

  const { handleRequestClose } = useModalDismiss({
    isOpen,
    isDirty: false,
    onClose,
  });

  if (!isOpen) return null;

  const archiveDaysCount = Object.keys(weatherArchive).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Настройка метеопункта объекта и архива наблюдений"
    >
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={handleRequestClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Шапка */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-[#1e3799] to-[#2a4dbd] text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <CloudSun className="w-5 h-5 text-sky-200" />
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
            onClick={handleRequestClose}
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

          {/* 3. ВЫБОР ИСТОЧНИКА ДАННЫХ (Meteostat / Поверенный метеопост / Справка УГМС / ERA5) */}
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
                    Серверный архив по координатам объекта
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Ежедневный сбор и архив температур по точным координатам стройки без удалённых станций.
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  sourceType === 'custom'
                    ? 'bg-emerald-50 border-emerald-600 ring-1 ring-emerald-600'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="sourceType"
                  value="custom"
                  checked={sourceType === 'custom'}
                  onChange={() => setSourceType('custom')}
                  className="mt-0.5 text-emerald-600"
                />
                <div>
                  <span className="font-bold text-emerald-950 block">
                    Поверенный метеопост площадки
                  </span>
                  <span className="text-[11px] text-emerald-800 font-medium">
                    АМК / сертифицированный прибор с поверкой Росстандарта (ФГИС АРШИН).
                  </span>
                </div>
              </label>

              <label
                className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                  sourceType === 'ugms-certificate'
                    ? 'bg-indigo-50 border-indigo-600 ring-1 ring-indigo-600'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="sourceType"
                  value="ugms-certificate"
                  checked={sourceType === 'ugms-certificate'}
                  onChange={() => setSourceType('ugms-certificate')}
                  className="mt-0.5 text-indigo-600"
                />
                <div>
                  <span className="font-bold text-indigo-950 block">
                    Официальная справка УГМС
                  </span>
                  <span className="text-[11px] text-indigo-800 font-medium">
                    Ведомость фактических температур с официальными реквизитами для технадзора.
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
                    Open-Meteo ERA5
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
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#1e3799]" />
                <span>Реестр станций WMO/РФ и метеопостов площадки:</span>
              </span>
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddCustomModal(true);
                    setShowUgmsModal(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-700" />
                  <span>+ Поверенный метеопост</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowUgmsModal(true);
                    setShowAddCustomModal(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-300 text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-700" />
                  <span>Импорт справки УГМС</span>
                </button>
              </div>
            </div>

            {/* Форма регистрации поверенного метеопоста (Этап 2) */}
            <FacilityCustomStationForm
              isOpen={showAddCustomModal}
              newCustomStation={newCustomStation}
              setNewCustomStation={setNewCustomStation}
              onClose={() => setShowAddCustomModal(false)}
              onSave={handleSaveCustomStation}
            />

            <FacilityUgmsImportPanel
              isOpen={showUgmsModal}
              ugmsForm={ugmsForm}
              setUgmsForm={setUgmsForm}
              ugmsParseResult={ugmsParseResult}
              onClose={() => setShowUgmsModal(false)}
              onParseText={handleParseUgmsText}
              onApplyCertificate={handleApplyUgmsCertificate}
            />

            {/* Быстрый поиск / фильтр станций */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск по названию станции, городу (напр. Курган), WMO ID или прибору..."
                className="w-full pl-9 pr-9 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-[#1e3799]"
              />
              {isSearchingOnline && (
                <Loader2 className="w-4 h-4 absolute right-3 top-2.5 animate-spin text-[#1e3799]" />
              )}
            </div>

            {/* Результаты онлайн-геокодинга городов РФ */}
            {onlineLocations.length > 0 && (
              <div className="p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-1.5">
                <div className="text-[11px] font-bold text-amber-950 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-amber-700" />
                    <span>Геокодер населённых пунктов (найдено: {onlineLocations.length})</span>
                  </span>
                  <span className="text-[10px] text-amber-800">
                    Нажмите «Привязать» для центрирования координат
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {onlineLocations.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => handleSelectGeocodedLocation(loc)}
                      className="p-2 bg-white rounded-lg border border-amber-200 hover:border-[#1e3799] text-left flex items-start justify-between gap-2 transition-all cursor-pointer shadow-2xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate">
                          {loc.name}
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {loc.region}
                        </div>
                        <div className="text-[10px] text-sky-800 font-medium truncate mt-0.5">
                          Станция: {loc.nearestStation.name} (WMO {loc.nearestStation.id})
                        </div>
                      </div>
                      <span className="shrink-0 text-[10px] font-bold text-[#1e3799] bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                        {loc.distanceKm} км
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Список станций с расстоянием (км) и WMO ID */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-slate-200">
              {nearbyStations.length === 0 ? (
                <div className="col-span-full p-4 text-center text-xs text-slate-500 bg-white rounded-lg border border-slate-200">
                  По запросу «{searchQuery}» станций не найдено. Попробуйте ввести название ближайшего крупного города.
                </div>
              ) : (
                nearbyStations.map((st) => {
                  const isSelected = weatherStationId === st.id;
                  const isCustom = st.source === 'custom';
                  return (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleSelectStation(st, !isCustom)}
                      className={`p-2.5 rounded-lg border text-left transition-all flex items-start justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-sky-50 border-[#1e3799] ring-2 ring-[#1e3799]/30 shadow-2xs'
                          : isCustom
                          ? 'bg-emerald-50/60 border-emerald-300 hover:bg-emerald-100/60'
                          : 'bg-white border-slate-200 hover:border-sky-400 hover:bg-sky-50/40'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-slate-900 truncate flex items-center gap-1.5">
                          <span>{st.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1 flex-wrap">
                          {isCustom ? (
                            <span className="font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.2 rounded text-[10px]">
                              Поверка {st.verificationCertNumber} ({st.deviceModel || 'АМК'})
                            </span>
                          ) : (
                            <span>
                              {st.region} · WMO ID: <span className="font-mono font-bold">{st.id}</span>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={`font-mono font-bold text-[11px] px-1.5 py-0.5 rounded ${
                            isCustom
                              ? 'text-emerald-800 bg-emerald-100'
                              : 'text-[#1e3799] bg-sky-100'
                          }`}
                        >
                          {st.distanceKm !== undefined ? `${st.distanceKm} км` : '—'}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <FacilityArchiveActionsPanel
            weatherStation={weatherStation}
            weatherStationId={weatherStationId}
            region={region}
            selectedObjName={selectedObjName}
            archiveDaysCount={archiveDaysCount}
            testDate={testDate}
            setTestDate={setTestDate}
            dateCheckStatus={dateCheckStatus}
            onCheckDateObservations={handleCheckDateObservations}
            periodStart={periodStart}
            setPeriodStart={setPeriodStart}
            periodEnd={periodEnd}
            setPeriodEnd={setPeriodEnd}
            isLoadingArchive={isLoadingArchive}
            onLoadDailyObservationsArchive={handleLoadDailyObservationsArchive}
            archiveLoadMessage={archiveLoadMessage}
            facilityJoints={facilityJoints}
            isConfirmingBulkUpdate={isConfirmingBulkUpdate}
            setIsConfirmingBulkUpdate={setIsConfirmingBulkUpdate}
            onConfirmBulkUpdate={handleConfirmBulkUpdate}
            bulkUpdateResult={bulkUpdateResult}
          />
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
