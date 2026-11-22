import { WeatherDailyItem, WeatherStationItem } from '../types/welding';

const DEFAULT_REFERENCE_STATIONS: WeatherStationItem[] = [
  {
    id: 'st-30528',
    wmoId: '30528',
    usaf: '305280',
    wban: '99999',
    name: 'Казачинское',
    nameEn: 'KAZACINSKOE',
    region: 'Иркутская область',
    latitude: 55.85,
    longitude: 107.60,
    isActive: true,
  },
  {
    id: 'st-30536',
    wmoId: '30536',
    usaf: '305360',
    wban: '99999',
    name: 'Жигалово',
    nameEn: 'ZIGALOVO',
    region: 'Иркутская область',
    latitude: 54.80,
    longitude: 105.15,
    isActive: true,
  },
  {
    id: 'st-30433',
    wmoId: '30433',
    usaf: '304330',
    wban: '99999',
    name: 'Киренск',
    nameEn: 'KIRENSK',
    region: 'Иркутская область',
    latitude: 57.77,
    longitude: 108.07,
    isActive: true,
  },
  {
    id: 'st-30309',
    wmoId: '30309',
    usaf: '303090',
    wban: '99999',
    name: 'Усть-Кут',
    nameEn: 'UST-KUT',
    region: 'Иркутская область',
    latitude: 56.80,
    longitude: 105.70,
    isActive: true,
  },
  {
    id: 'st-23330',
    wmoId: '23330',
    usaf: '233300',
    wban: '99999',
    name: 'Салехард (ЯНАО)',
    nameEn: 'SALEHARD',
    region: 'Ямало-Ненецкий АО',
    latitude: 66.533,
    longitude: 66.667,
    isActive: true,
  },
  {
    id: 'st-28661',
    wmoId: '28661',
    usaf: '286610',
    wban: '99999',
    name: 'Курган (АМСГ)',
    nameEn: 'KURGAN',
    region: 'Курганская область',
    latitude: 55.47,
    longitude: 65.42,
    isActive: true,
  },
  {
    id: 'st-23078',
    wmoId: '23078',
    usaf: '230780',
    wban: '99999',
    name: 'Новый Уренгой',
    nameEn: 'NOVYJ URENGOJ',
    region: 'Ямало-Ненецкий АО',
    latitude: 66.08,
    longitude: 76.52,
    isActive: true,
  },
  {
    id: 'st-27612',
    wmoId: '27612',
    usaf: '276120',
    wban: '99999',
    name: 'Москва (ВДНХ)',
    nameEn: 'MOSKVA',
    region: 'Московская область',
    latitude: 55.83,
    longitude: 37.62,
    isActive: true,
  },
  {
    id: 'st-26063',
    wmoId: '26063',
    usaf: '260630',
    wban: '99999',
    name: 'Санкт-Петербург',
    nameEn: 'SANKT-PETERBURG',
    region: 'Ленинградская область',
    latitude: 59.97,
    longitude: 30.3,
    isActive: true,
  },
  {
    id: 'st-22837',
    wmoId: '22837',
    usaf: '228370',
    wban: '99999',
    name: 'Волхов (М-2)',
    nameEn: 'VOLHOV',
    region: 'Ленинградская область',
    latitude: 59.93,
    longitude: 32.34,
    isActive: true,
  },
];

interface RawWeatherStationPayload {
  id: string | number;
  wmo_id?: string;
  wmoId?: string;
  usaf?: string;
  wban?: string;
  name: string;
  name_en?: string;
  nameEn?: string;
  region?: string;
  latitude: number;
  longitude: number;
  is_active?: boolean;
  distance_km?: number;
  distanceKm?: number;
  matched_settlement?: string;
  matchedSettlement?: string;
}

interface RawWeatherDailyPayload {
  id: string | number;
  station_id?: string;
  stationId?: string;
  obs_date?: string;
  obsDate?: string;
  t_min?: number;
  tMin?: number;
  t_max?: number;
  tMax?: number;
  t_mean?: number;
  tMean?: number;
  source?: string;
  updated_at?: string;
  updatedAt?: string;
}

export async function fetchWeatherStations(
  search?: string,
  lat?: number,
  lon?: number
): Promise<WeatherStationItem[]> {
  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (lat != null) params.append('lat', String(lat));
    if (lon != null) params.append('lon', String(lon));

    const res = await fetch(`/api/weather/stations?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return (data as RawWeatherStationPayload[]).map((d) => ({
          id: String(d.id),
          wmoId: d.wmo_id || d.wmoId || String(d.id),
          usaf: d.usaf,
          wban: d.wban,
          name: d.name,
          nameEn: d.name_en || d.nameEn,
          region: d.region,
          latitude: d.latitude,
          longitude: d.longitude,
          isActive: d.is_active ?? true,
          distanceKm: d.distance_km ?? d.distanceKm,
          matchedSettlement: d.matched_settlement ?? d.matchedSettlement,
        }));
      }
    }
  } catch {
    // Offline / fallback to reference stations
  }

  // Filter fallback stations
  let list = DEFAULT_REFERENCE_STATIONS;
  if (search && search.trim()) {
    const q = search.toLowerCase().trim();
    // Check known small settlements in fallback
    if (q.includes('карам') || q.includes('karam')) {
      const kaz = list.find((s) => s.wmoId === '30528');
      const zig = list.find((s) => s.wmoId === '30536');
      const kir = list.find((s) => s.wmoId === '30433');
      const res: WeatherStationItem[] = [];
      if (kaz) res.push({ ...kaz, distanceKm: 42.5, matchedSettlement: 'Карам' });
      if (zig) res.push({ ...zig, distanceKm: 135.0, matchedSettlement: 'Карам' });
      if (kir) res.push({ ...kir, distanceKm: 240.0, matchedSettlement: 'Карам' });
      return res;
    }

    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.nameEn && s.nameEn.toLowerCase().includes(q)) ||
        s.wmoId.includes(q) ||
        (s.region && s.region.toLowerCase().includes(q))
    );
  }
  return list;
}

export async function createWeatherStationAlias(alias: {
  settlementName: string;
  stationId: string;
  distanceKm?: number;
}): Promise<void> {
  try {
    await fetch('/api/weather/aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settlement_name: alias.settlementName,
        station_id: alias.stationId,
        distance_km: alias.distanceKm,
      }),
    });
  } catch {
    // offline fallback: save to localStorage
    try {
      const key = 'zaychick_weather_aliases';
      const raw = localStorage.getItem(key);
      const list = raw ? JSON.parse(raw) : [];
      list.push(alias);
      localStorage.setItem(key, JSON.stringify(list));
    } catch {
      // ignore
    }
  }
}

export async function fetchWeatherDaily(
  stationId: string,
  dateFrom: string,
  dateTo: string
): Promise<WeatherDailyItem[]> {
  try {
    const params = new URLSearchParams({
      station_id: stationId,
      date_from: dateFrom,
      date_to: dateTo,
    });
    const res = await fetch(`/api/weather/daily?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return (data as RawWeatherDailyPayload[]).map((d) => ({
          id: String(d.id),
          stationId: d.station_id || d.stationId || stationId,
          obsDate: d.obs_date || d.obsDate || dateFrom,
          tMin: d.t_min ?? d.tMin,
          tMax: d.t_max ?? d.tMax,
          tMean: d.t_mean ?? d.tMean,
          source: d.source || 'SYNOP_LIVE',
          updatedAt: d.updated_at || d.updatedAt,
        }));
      }
    }
  } catch {
    // offline fallback
  }

  return [];
}

export async function refreshWeatherStation(
  stationId: string,
  days: number = 3
): Promise<{ status: string; refreshedCount: number; latestTMean?: number | null }> {
  try {
    const res = await fetch(`/api/weather/stations/${stationId}/refresh?days=${days}`, {
      method: 'POST',
    });
    if (res.ok) {
      const data = await res.json();
      return {
        status: data.status || 'ok',
        refreshedCount: data.refreshed_count ?? 1,
        latestTMean: data.latest_t_mean,
      };
    }
    return { status: 'error', refreshedCount: 0, latestTMean: null };
  } catch {
    return { status: 'error', refreshedCount: 0, latestTMean: null };
  }
}
