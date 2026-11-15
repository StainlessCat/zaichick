import React from 'react';
import { CloudRain, RefreshCw, Thermometer } from 'lucide-react';
import { Button, FormField, Select } from '../ui';
import { WeatherDailyItem, WeatherStationItem } from '../../types/welding';

export interface WeatherStationWidgetProps {
  selectedStationId?: string;
  stations: WeatherStationItem[];
  onSelectStation: (stationId: string) => void;
  activeDate?: string; // YYYY-MM-DD
  dailyWeather?: WeatherDailyItem | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  onApplyTemp?: (tMean: number) => void;
  className?: string;
}

export const WeatherStationWidget: React.FC<WeatherStationWidgetProps> = ({
  selectedStationId,
  stations,
  onSelectStation,
  activeDate,
  dailyWeather,
  isLoading = false,
  onRefresh,
  onApplyTemp,
  className = '',
}) => {
  const currentStation = stations.find((s) => s.id === selectedStationId);

  const formatTemp = (val: number | null | undefined): string => {
    if (val === null || val === undefined || Number.isNaN(val)) return '—';
    return val > 0 ? `+${val.toFixed(1)}°` : `${val.toFixed(1)}°`;
  };

  const hasTempData = dailyWeather && (dailyWeather.tMean != null || dailyWeather.tMin != null);

  return (
    <div className={`flex flex-wrap items-end gap-2 text-xs ${className}`}>
      {/* 1. Селектор метеостанции */}
      <FormField label="Метеостанция" className="w-52">
        <Select
          value={selectedStationId || ''}
          onChange={(e) => onSelectStation(e.target.value)}
          className="w-full truncate font-medium text-slate-800"
        >
          <option value="">Не привязана</option>
          {stations.map((st) => (
            <option key={st.id} value={st.id}>
              {st.name} ({st.wmoId})
              {st.distanceKm != null ? ` · ${st.distanceKm.toFixed(0)} км` : ''}
            </option>
          ))}
        </Select>
      </FormField>

      {/* 2. Компактный бейдж фактической температуры мин / ср / макс °C */}
      <FormField label="t° воздуха" className="shrink-0">
        <div className="h-8 box-border px-2.5 bg-slate-50 border border-slate-300 rounded-md flex items-center gap-2 font-mono text-[11px] leading-none text-slate-800 select-none">
          <Thermometer className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
          {isLoading ? (
            <span className="text-slate-400">Загрузка...</span>
          ) : hasTempData ? (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-blue-700" title="Минимальная температура суточного интервала">
                мин {formatTemp(dailyWeather?.tMin)}
              </span>
              <span className="text-slate-300">/</span>
              <span className="font-bold text-slate-900" title="Среднесуточная температура воздуха">
                ср {formatTemp(dailyWeather?.tMean)}
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-amber-700" title="Максимальная температура суточного интервала">
                макс {formatTemp(dailyWeather?.tMax)}
              </span>
              {dailyWeather?.source && (
                <span className="ml-1 text-[9px] px-1 py-0.5 rounded bg-slate-200 text-slate-600 font-sans uppercase">
                  {dailyWeather.source === 'SYNOP_LIVE' ? 'SYNOP' : 'GSOD'}
                </span>
              )}
            </div>
          ) : (
            <span className="text-slate-400">нет данных</span>
          )}
        </div>
      </FormField>

      {/* 3. Кнопка принудительного обновления погоды */}
      {onRefresh && currentStation && (
        <Button
          type="button"
          variant="secondary"
          onClick={onRefresh}
          disabled={isLoading}
          title={`Обновить фактическую погоду со шлюза для ${currentStation.name}`}
          className="shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Обновить</span>
        </Button>
      )}

      {/* 4. Опциональная кнопка подстановки в стык */}
      {onApplyTemp && hasTempData && dailyWeather?.tMean != null && (
        <Button
          type="button"
          variant="primary"
          onClick={() => onApplyTemp(dailyWeather.tMean!)}
          title="Подставить фактическую среднесуточную температуру воздуха в выбранный стык"
          className="shrink-0 font-semibold"
        >
          <span>В стык ({formatTemp(dailyWeather.tMean)})</span>
        </Button>
      )}
    </div>
  );
};
