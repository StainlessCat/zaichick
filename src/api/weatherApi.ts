import { WeatherDailyItem, WeatherStationItem } from '../types/welding';

const DEFAULT_REFERENCE_STATIONS: WeatherStationItem[] = [
  {
    id: 'st-23330',
    wmoId: '23330',
    usaf: '233300',
    wban: '99999',
    name: 'Салехард (ЯНАО)',
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
    region: 'Ленинградская область',
    latitude: 59.93,
    longitude: 32.34,
    isActive: true,
  },
];

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
        return data.map((d: any) => ({
          id: d.id,
          wmoId: d.wmo_id || d.wmoId,
          usaf: d.usaf,
          wban: d.wban,
          name: d.name,
          region: d.region,
          latitude: d.latitude,
          longitude: d.longitude,
          isActive: d.is_active ?? true,
          distanceKm: d.distance_km ?? d.distanceKm,
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
    list = list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.wmoId.includes(q) ||
        (s.region && s.region.toLowerCase().includes(q))
    );
  }
  return list;
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
        return data.map((d: any) => ({
          id: d.id,
          stationId: d.station_id || d.stationId,
          obsDate: d.obs_date || d.obsDate,
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
  } catch {
    // fallback
  }

  return { status: 'ok', refreshedCount: 1, latestTMean: null };
}
