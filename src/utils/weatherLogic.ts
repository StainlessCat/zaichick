/**
 * ZAYCHICK — Погодная аналитика и расчёт температур окружающего воздуха.
 * Интеграция с метеопостами Росгидромета, фактическими наблюдениями метеостанций
 * и климатическими нормами (СП 131.13330 Строительная климатология).
 */

import type { WeldJoint } from '../types/welding';
import { formatDateDDMMYY } from './dates';
import { determineDateObservationStatus } from './weatherService';

/**
 * Детерминированная оценка температуры воздуха по широте/долготе и дате (СП 131.13330 Строительная климатология).
 * Для Северо-Запада / умеренных широт (широта < 62.5° с.ш., долгота < 50° в.д., например г. Волхов Ленинградской обл. 59.93° N, 32.34° E)
 * использует среднемесячную кривую умеренно-континентального климата, а для северных и сибирских широт — арктическую кривую.
 */
export function estimateAmbientTempByCoordsAndDate(
  latitude: number,
  longitude: number,
  dateStr: string
): number {
  const d = dateStr ? new Date(dateStr) : new Date();
  const month = Number.isNaN(d.getTime()) ? 9 : d.getUTCMonth(); // 0..11
  const day = Number.isNaN(d.getTime()) ? 15 : d.getUTCDate();
  const dailyVariation = ((day * 7 + Math.round(longitude)) % 7) - 3;

  // Умеренно-континентальный климат Северо-Запада РФ (Ленинградская обл., г. Волхов, Выборг и др.)
  if (latitude < 62.5 && longitude < 50) {
    const temperateCurve = [-7, -6, -1, 6, 13, 17, 20, 18, 12, 6, 0, -4];
    const base = temperateCurve[month] ?? 6;
    const latAdj = Math.round((60 - latitude) * 0.9);
    return base + latAdj + dailyVariation;
  }

  // Среднемесячная кривая для северных нефтегазовых широт (65..71 с.ш.)
  const seasonalCurve = [-26, -24, -18, -9, -2, 7, 14, 11, 4, -5, -16, -23];
  const base = seasonalCurve[month] ?? -5;
  const latAdjustment = Math.round((67 - latitude) * 1.4);
  return base + latAdjustment + dailyVariation;
}

/**
 * Формирует посуточный архив температур воздуха (°C) за период (startDateIso .. endDateIso)
 * строго на основе фактических наблюдений реальной метеостанции.
 * КАТЕГОРИЧЕСКИЙ ЗАПРЕТ: климатические формулы исключены из роли источника архива.
 * Если фактических наблюдений станции за дату нет — поле остаётся пустым (статус «нет данных»).
 */
export function generatePeriodWeatherArchive(
  latitude: number,
  longitude: number,
  startDateIso: string,
  endDateIso: string,
  knownArchive?: Record<string, string>
): Record<string, string> {
  const archive: Record<string, string> = {};
  if (knownArchive) {
    Object.assign(archive, knownArchive);
  }
  return archive;
}

/**
 * Получение температуры окружающей среды на дату сварки:
 * 1) Из предзагруженного архива фактических наблюдений метеостанции объекта (weatherArchive[dateStr]);
 * 2) Если выбрана явная отдельная опция Open-Meteo ERA5 («реанализ, не наблюдения метеостанции»);
 * 3) Если наблюдений нет — значение остаётся НЕЗАПОЛНЕННЫМ (пустая строка) со статусом «За дату данных нет»
 *    или «Данные ещё не поступили».
 * 
 * ВНИМАНИЕ: Подстановка расчётных формул/климатических оценок в архив или паспорт стыка ЗАПРЕЩЕНА.
 */
export async function fetchAmbientTemperatureAuto(
  latitude: number,
  longitude: number,
  dateStr?: string,
  weatherArchive?: Record<string, string>,
  options?: {
    sourceType?: 'meteostat' | 'open-meteo-era5';
    stationName?: string;
  }
): Promise<{ tempC: string; source: string; status?: string }> {
  const todayIso = new Date().toISOString().slice(0, 10);
  const targetDate =
    dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? dateStr : todayIso;

  // 1. Проверяем предзагруженный архив фактических наблюдений метеостанции объекта
  if (weatherArchive && weatherArchive[targetDate] !== undefined && weatherArchive[targetDate].trim() !== '') {
    const rawVal = String(weatherArchive[targetDate]).trim();
    const num = Number(rawVal);
    const formatted =
      !rawVal.startsWith('+') && !rawVal.startsWith('-') && !Number.isNaN(num) && num > 0
        ? `+${num}`
        : rawVal;
    const stLabel = options?.stationName || 'Метеостанция объекта';
    return {
      tempC: formatted,
      source: `Фактические наблюдения: ${stLabel} (${formatDateDDMMYY(targetDate)})`,
      status: 'available',
    };
  }

  const sourceType = options?.sourceType || 'meteostat';
  const { isPending, isHistorical } = determineDateObservationStatus(targetDate, todayIso);

  // 2. Если дата за последние 1–7 дней или будущая — архив ещё не поступил
  if (isPending) {
    return {
      tempC: '',
      source: 'Данные ещё не поступили (задержка обновления архива метеостанции)',
      status: 'pending',
    };
  }

  // 3. Отдельная маркированная опция Open-Meteo ERA5 (Строго «реанализ, не наблюдения метеостанции»)
  if (sourceType === 'open-meteo-era5' && isHistorical) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${latitude.toFixed(
        2
      )}&longitude=${longitude.toFixed(
        2
      )}&start_date=${targetDate}&end_date=${targetDate}&daily=temperature_2m_mean&timezone=auto`;
      const res = await fetch(archiveUrl, { signal: controller.signal });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const meanTemp = data?.daily?.temperature_2m_mean?.[0];
        if (typeof meanTemp === 'number') {
          const rounded = Math.round(meanTemp * 10) / 10;
          const formatted = rounded > 0 ? `+${rounded}` : `${rounded}`;
          return {
            tempC: formatted,
            source: `Open-Meteo ERA5 (${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E · ${formatDateDDMMYY(targetDate)}) · реанализ, не наблюдения метеостанции`,
            status: 'available',
          };
        }
      }
    } catch {
      // Сетевая ошибка — не подменять архив климатической оценкой незаметно!
    }
  }

  // 4. Если наблюдений нет — КАТЕГОРИЧЕСКИЙ ЗАПРЕТ НА ПОДМЕНУ РАСЧЁТНОЙ ФОРМУЛОЙ.
  // Поле остаётся пустым, статус «За дату данных нет».
  return {
    tempC: '',
    source: 'За дату данных нет (наблюдения на метеостанции отсутствуют)',
    status: 'not_found',
  };
}

/**
 * Возвращает название метеопункта объекта строительства, с которого берутся данные о температуре воздуха.
 */
export function getFacilityWeatherStationName(
  facility?: {
    name?: string;
    shortName?: string;
    region?: string;
    weatherStation?: string;
  } | null
): string {
  if (!facility) return 'Метеопункт площадки';
  if (facility.weatherStation && facility.weatherStation.trim()) {
    return facility.weatherStation.trim();
  }
  const n = (facility.name || '').toLowerCase();
  if (n.includes('волхов')) return 'Метеостанция г. Волхов (№26078)';
  if (n.includes('бованенк')) return 'Метеопункт Бованенково';
  if (n.includes('заполярн')) return 'Метеопункт Тазовский (Заполярное)';
  if (n.includes('харасав')) return 'Метеопункт Харасавэй';
  if (n.includes('уренгой')) return 'Метеопункт Новый Уренгой';
  if (facility.shortName) return `Метеопункт ${facility.shortName}`;
  if (facility.region) return `Метеопункт (${facility.region})`;
  return 'Метеопункт объекта';
}

/**
 * Пакетное обновление температур стыков выбранного объекта по архиву наблюдений метеостанции.
 * Не модифицирует стыки других объектов или стыки без даты сварки / без записей в архиве.
 */
export function bulkUpdateJointsTemperaturesFromArchive(
  joints: WeldJoint[],
  facilityName: string,
  weatherArchive?: Record<string, string>,
  weatherStationName?: string
): { updatedJoints: WeldJoint[]; updatedCount: number } {
  if (!weatherArchive || Object.keys(weatherArchive).length === 0) {
    return { updatedJoints: joints, updatedCount: 0 };
  }

  let count = 0;
  const updatedJoints = joints.map((j) => {
    if (j.objectName !== facilityName) return j;
    if (
      j.weldingDate &&
      weatherArchive[j.weldingDate] !== undefined &&
      weatherArchive[j.weldingDate].trim() !== ''
    ) {
      count++;
      return {
        ...j,
        ambientTemp: weatherArchive[j.weldingDate],
        weatherSource: weatherStationName || 'Метеостанция объекта',
      };
    }
    return j;
  });

  return { updatedJoints, updatedCount: count };
}
