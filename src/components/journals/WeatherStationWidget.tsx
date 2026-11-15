import React from 'react';
import { RefreshCw, Thermometer } from 'lucide-react';
import { Button, FormField } from '../ui';
import { WeatherDailyItem } from '../../types/welding';

export interface WeatherStationWidgetProps {
  stationName?: string;
  activeDate?: string; // YYYY-MM-DD
  dailyWeather?: WeatherDailyItem | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  onApplyTemp?: (tMean: number) => void;
  onApplyAllDates?: () => void;
  className?: string;
}

export const WeatherStationWidget: React.FC<WeatherStationWidgetProps> = ({
  stationName,
  activeDate,
  dailyWeather,
  isLoading = false,
  onRefresh,
  onApplyTemp,
  onApplyAllDates,
  className = '',
}) => {
  const formatTemp = (val: number | null | undefined): string => {
    if (val === null || val === undefined || Number.isNaN(val)) return '—';
    return val > 0 ? `+${val.toFixed(1)}°` : `${val.toFixed(1)}°`;
  };

  const hasTempData = dailyWeather && (dailyWeather.tMean != null || dailyWeather.tMin != null);

  return (
    <div className={`flex flex-wrap items-end gap-2 text-xs ${className}`}>
      {/* 1. Отображение метеостанции объекта (только чтение, настройка в меню объекта) */}
      <FormField label="Метеостанция объекта" className="shrink-0 max-w-[210px]">
        <div
          className="h-8 box-border px-2.5 bg-slate-50 border border-slate-300 rounded-md flex items-center font-medium text-[11px] leading-none text-slate-800 select-none truncate"
          title={
            stationName && stationName.trim()
              ? `Метеостанция объекта: ${stationName}`
              : 'Метеостанция не привязана к объекту. Настройте в меню объекта'
          }
        >
          <span className="truncate">
            {stationName && stationName.trim() ? stationName : 'Не привязана'}
          </span>
        </div>
      </FormField>

      {/* 2. Компактный бейдж фактической температуры мин / ср / макс */}
      <FormField label="t° воздуха" className="shrink-0">
        <div className="h-8 box-border px-2.5 bg-slate-50 border border-slate-300 rounded-md flex items-center gap-2 font-mono text-[11px] leading-none text-slate-800 select-none">
          <Thermometer className="w-3.5 h-3.5 text-[#1e3799] shrink-0" />
          {isLoading ? (
            <span className="text-slate-400">Загрузка...</span>
          ) : hasTempData ? (
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <span className="text-blue-700" title="Минимальная температура">
                мин {formatTemp(dailyWeather?.tMin)}
              </span>
              <span className="text-slate-300">/</span>
              <span className="font-bold text-slate-900" title="Среднесуточная температура">
                ср {formatTemp(dailyWeather?.tMean)}
              </span>
              <span className="text-slate-300">/</span>
              <span className="text-amber-700" title="Максимальная температура">
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

      {/* 3. Кнопка обновления фактической погоды */}
      {onRefresh && stationName && (
        <Button
          type="button"
          variant="secondary"
          onClick={onRefresh}
          disabled={isLoading}
          title={`Обновить фактическую погоду для ${stationName}`}
          className="shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Обновить</span>
        </Button>
      )}

      {/* 4. Кнопка подстановки в стыки активной даты */}
      {onApplyTemp && hasTempData && dailyWeather?.tMean != null && (
        <Button
          type="button"
          variant="primary"
          onClick={() => onApplyTemp(dailyWeather.tMean!)}
          title={`Подставить фактическую температуру ${formatTemp(dailyWeather.tMean)} в стыки за дату ${activeDate || 'сегодня'}`}
          className="shrink-0 font-semibold"
        >
          <span>Внести за {activeDate ? activeDate.slice(5).replace('-', '.') : 'дату'}</span>
        </Button>
      )}

      {/* 5. Пакетное заполнение всех дат сварки линии */}
      {onApplyAllDates && (
        <Button
          type="button"
          variant="secondary"
          onClick={onApplyAllDates}
          disabled={isLoading}
          title="Запросить суточные наблюдения архива по всем датам сварки линии и заполнить температуру для каждого дня индивидуально"
          className="shrink-0 font-semibold"
        >
          <span>Заполнить все даты</span>
        </Button>
      )}
    </div>
  );
};
