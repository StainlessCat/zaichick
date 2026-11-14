import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  FacilityObject,
  ProjectLineItem,
  WeldJoint,
} from '../../types/welding';
import {
  deriveFacilitiesFromLineList,
  fetchAmbientTemperatureAuto,
  resolveFacilityDefaultLocation,
} from '../../utils/weldingLogic';
import { FACILITY_OBJECTS } from '../../data/seedData';
import type { FacilityGeoOverride } from '../useServerSync';

export const EMPTY_FACILITY_FALLBACK: FacilityObject = {
  id: 'fac-empty-default',
  name: 'Новый объект',
  shortName: 'Новый объект',
  region: 'ЯНАО',
  weatherStation: 'Метеостанция объекта',
  latitude: 66.53,
  longitude: 66.6,
  rdCodes: [
    {
      code: 'НОВЫЙ-ШИФР-РД',
      title: 'Рабочая документация',
      contours: ['Основной контур'],
    },
  ],
};

export interface UseFacilityWeatherStateParams {
  projectLineList: ProjectLineItem[];
  serverFacilities: FacilityObject[];
  selectedObjectName: string;
  setSelectedObjectName: React.Dispatch<React.SetStateAction<string>>;
  setSelectedRdCode: React.Dispatch<React.SetStateAction<string>>;
  setJoints: React.Dispatch<React.SetStateAction<WeldJoint[]>>;
  recordUndoSnapshot: (actionLabel: string) => void;
}

export function useFacilityWeatherState({
  projectLineList,
  serverFacilities,
  selectedObjectName,
  setSelectedObjectName,
  setSelectedRdCode,
  setJoints,
  recordUndoSnapshot,
}: UseFacilityWeatherStateParams) {
  // Геокоординаты и метеопосты
  const [facilityGeoOverrides, setFacilityGeoOverrides] = useState<
    Record<string, FacilityGeoOverride>
  >({});
  const [locationModalFacilityName, setLocationModalFacilityName] = useState<
    string | null
  >(null);

  // Метеосводка объекта
  const [siteWeather, setSiteWeather] = useState<{
    tempC: string;
    source: string;
    loading: boolean;
  }>({
    tempC: '-6',
    source: 'Метеопост УКПГ-2В (70.37°N, 68.43°E)',
    loading: false,
  });

  // Производные списки объектов (из серверного списка facilities + лайнлиста)
  const derivedFacilities = useMemo(() => {
    const base = deriveFacilitiesFromLineList(
      projectLineList,
      serverFacilities.length > 0 ? serverFacilities : FACILITY_OBJECTS,
      true
    );
    const merged = base.map((fac) => {
      const over = facilityGeoOverrides[fac.name];
      if (!over) return fac;
      return {
        ...fac,
        region: over.region,
        weatherStation: over.weatherStation || fac.weatherStation,
        weatherStationId: over.weatherStationId || fac.weatherStationId,
        weatherStationDistanceKm:
          over.weatherStationDistanceKm ?? fac.weatherStationDistanceKm,
        weatherStationSource:
          over.weatherStationSource || fac.weatherStationSource,
        latitude: over.latitude,
        longitude: over.longitude,
        weatherArchive: over.weatherArchive || fac.weatherArchive,
        weatherObservations: over.weatherObservations || fac.weatherObservations,
        customWeatherStations:
          over.customWeatherStations || fac.customWeatherStations,
      };
    });

    const existingNames = new Set(merged.map((f) => f.name));
    Object.entries(facilityGeoOverrides).forEach(([objName, over], idx) => {
      if (!existingNames.has(objName)) {
        merged.push({
          id: `fac-standalone-${idx}-${objName}`,
          name: objName,
          shortName: objName,
          region: over.region || 'Не указан',
          weatherStation: over.weatherStation || 'Метеостанция не привязана',
          weatherStationId: over.weatherStationId,
          weatherStationDistanceKm: over.weatherStationDistanceKm,
          weatherStationSource: over.weatherStationSource,
          latitude: over.latitude,
          longitude: over.longitude,
          weatherArchive: over.weatherArchive,
          weatherObservations: over.weatherObservations,
          customWeatherStations: over.customWeatherStations,
          rdCodes: [],
        });
      }
    });

    return merged;
  }, [projectLineList, serverFacilities, facilityGeoOverrides]);

  const currentFacility = useMemo(
    () =>
      derivedFacilities.find((f) => f.name === selectedObjectName) ||
      derivedFacilities[0] ||
      EMPTY_FACILITY_FALLBACK,
    [derivedFacilities, selectedObjectName]
  );

  const refreshSiteWeather = useCallback(async () => {
    setSiteWeather((prev) => ({ ...prev, loading: true }));
    const res = await fetchAmbientTemperatureAuto(
      currentFacility.latitude,
      currentFacility.longitude
    );
    setSiteWeather({
      tempC: res.tempC,
      source: res.source,
      loading: false,
    });
  }, [currentFacility.latitude, currentFacility.longitude]);

  useEffect(() => {
    refreshSiteWeather();
  }, [refreshSiteWeather, currentFacility.id]);

  const handleSaveFacilityLocation = useCallback(
    (
      facilityName: string,
      loc: FacilityGeoOverride
    ) => {
      recordUndoSnapshot(`Смена метеопункта объекта ${facilityName}`);

      setFacilityGeoOverrides((prev) => ({
        ...prev,
        [facilityName]: {
          ...prev[facilityName],
          region: loc.region,
          weatherStation: loc.weatherStation,
          weatherStationId: loc.weatherStationId,
          weatherStationDistanceKm: loc.weatherStationDistanceKm,
          weatherStationSource: loc.weatherStationSource,
          weatherLastCheckStatus: loc.weatherLastCheckStatus,
          weatherLastCheckedAt: loc.weatherLastCheckedAt,
          weatherLastErrorMessage: loc.weatherLastErrorMessage,
          latitude: loc.latitude,
          longitude: loc.longitude,
          weatherArchive:
            loc.weatherArchive ?? prev[facilityName]?.weatherArchive,
          weatherObservations:
            loc.weatherObservations ?? prev[facilityName]?.weatherObservations,
          customWeatherStations:
            loc.customWeatherStations ?? prev[facilityName]?.customWeatherStations,
        },
      }));
    },
    [recordUndoSnapshot]
  );

  const handleBulkUpdateJointsTemperaturesFromStation = useCallback(
    (facilityName: string, confirm: boolean) => {
      if (!confirm) {
        return { updatedCount: 0, message: 'Действие отменено пользователем' };
      }
      const fac = derivedFacilities.find((f) => f.name === facilityName);
      if (!fac || !fac.weatherArchive || Object.keys(fac.weatherArchive).length === 0) {
        return {
          updatedCount: 0,
          message: 'У объекта нет загруженного архива наблюдений метеостанции',
        };
      }
      const archive = fac.weatherArchive;
      let count = 0;
      recordUndoSnapshot(
        `Массовое обновление температур стыков объекта ${facilityName} по метеостанции`
      );
      setJoints((prev) =>
        prev.map((j) => {
          if (j.objectName !== facilityName) return j;
          if (
            j.weldingDate &&
            archive[j.weldingDate] !== undefined &&
            archive[j.weldingDate].trim() !== ''
          ) {
            count++;
            return {
              ...j,
              ambientTemp: archive[j.weldingDate],
              weatherSource: fac.weatherStation || 'Метеостанция объекта',
            };
          }
          return j;
        })
      );
      return {
        updatedCount: count,
        message: `Успешно обновлено ${count} стыков по фактическим наблюдениям станции`,
      };
    },
    [derivedFacilities, recordUndoSnapshot, setJoints]
  );

  const handleCreateStandaloneObject = useCallback(
    (objectName: string) => {
      const clean = objectName.trim();
      if (!clean) return;
      recordUndoSnapshot(`Создание объекта строительства «${clean}»`);

      // Автоматическое сопоставление с реальным реестром метеостанций WMO/Росгидромета
      const resolved = resolveFacilityDefaultLocation(clean);

      setFacilityGeoOverrides((prev) => ({
        ...prev,
        [clean]: {
          region: resolved.region,
          weatherStation: resolved.weatherStation,
          weatherStationId: resolved.weatherStationId,
          latitude: resolved.latitude,
          longitude: resolved.longitude,
          weatherArchive: {},
          weatherObservations: {},
        },
      }));
      setSelectedObjectName(clean);
      setSelectedRdCode('ALL');
    },
    [recordUndoSnapshot, setSelectedObjectName, setSelectedRdCode]
  );

  const activeLocationFacility: FacilityObject | null = useMemo(() => {
    if (!locationModalFacilityName) return null;
    return (
      derivedFacilities.find((f) => f.name === locationModalFacilityName) ||
      currentFacility ||
      null
    );
  }, [locationModalFacilityName, derivedFacilities, currentFacility]);

  return {
    facilityGeoOverrides,
    setFacilityGeoOverrides,
    locationModalFacilityName,
    setLocationModalFacilityName,
    siteWeather,
    refreshSiteWeather,
    derivedFacilities,
    currentFacility,
    activeLocationFacility,
    handleSaveFacilityLocation,
    handleBulkUpdateJointsTemperaturesFromStation,
    handleCreateStandaloneObject,
  };
}
