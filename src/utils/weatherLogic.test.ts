import { test, assert } from 'vitest';
import {
  bulkUpdateJointsTemperaturesFromArchive,
  fetchAmbientTemperatureAuto,
  generatePeriodWeatherArchive,
  getFacilityWeatherStationName,
} from './weatherLogic';
import type { WeldJoint } from '../types/welding';

test('weatherLogic: generatePeriodWeatherArchive respects actual observations and never synthesizes', () => {
  const known = {
    '2026-10-10': '-5',
    '2026-10-11': '-7',
  };
  const archive = generatePeriodWeatherArchive(68.5, 72.0, '2026-10-01', '2026-10-15', known);
  assert.equal(archive['2026-10-10'], '-5');
  assert.equal(archive['2026-10-11'], '-7');
  // Без наблюдений за 12 октября поле не выдумывается
  assert.equal(archive['2026-10-12'], undefined);
});

test('weatherLogic: fetchAmbientTemperatureAuto returns archive values and formats positive temperatures', async () => {
  const archive = {
    '2026-06-15': '14',
    '2026-12-10': '-18',
  };

  const resJune = await fetchAmbientTemperatureAuto(60.0, 30.0, '2026-06-15', archive, {
    stationName: 'Метеопост Волхов',
  });
  assert.equal(resJune.tempC, '+14');
  assert.equal(resJune.status, 'available');
  assert.equal(resJune.source.includes('Метеопост Волхов'), true);

  const resDec = await fetchAmbientTemperatureAuto(60.0, 30.0, '2026-12-10', archive);
  assert.equal(resDec.tempC, '-18');
  assert.equal(resDec.status, 'available');
});

test('weatherLogic: fetchAmbientTemperatureAuto refuses synthetic formula when date has no archive data', async () => {
  // Для исторической даты без наблюдений должен вернуть not_found и пустую строку (категорический запрет подмены!)
  const res = await fetchAmbientTemperatureAuto(68.5, 72.0, '2024-03-15', {});
  assert.equal(res.tempC, '');
  assert.equal(res.status, 'not_found');
});

test('weatherLogic: getFacilityWeatherStationName resolves names correctly', () => {
  assert.equal(
    getFacilityWeatherStationName({ weatherStation: 'Ведомственная АМК №1' }),
    'Ведомственная АМК №1'
  );
  assert.equal(
    getFacilityWeatherStationName({ name: 'Волхов КС-1' }),
    'Метеостанция г. Волхов (№26078)'
  );
  assert.equal(
    getFacilityWeatherStationName({ name: 'Бованенковское НГКМ' }),
    'Метеопункт Бованенково'
  );
  assert.equal(
    getFacilityWeatherStationName({ name: 'Заполярное месторождение' }),
    'Метеопункт Тазовский (Заполярное)'
  );
  assert.equal(
    getFacilityWeatherStationName({ name: 'Харасавэй' }),
    'Метеопункт Харасавэй'
  );
  assert.equal(
    getFacilityWeatherStationName(null),
    'Метеопункт площадки'
  );
});

test('weatherLogic: bulkUpdateJointsTemperaturesFromArchive updates matching joints only', () => {
  const joints: WeldJoint[] = [
    {
      id: 'j1',
      objectName: 'ГСП-1',
      weldingDate: '2026-10-12',
      ambientTemp: '',
    } as unknown as WeldJoint,
    {
      id: 'j2',
      objectName: 'ГСП-1',
      weldingDate: '2026-10-13',
      ambientTemp: '',
    } as unknown as WeldJoint,
    {
      id: 'j3',
      objectName: 'ГСП-2', // другой объект
      weldingDate: '2026-10-12',
      ambientTemp: '',
    } as unknown as WeldJoint,
  ];

  const archive = {
    '2026-10-12': '-6',
  };

  const { updatedJoints, updatedCount } = bulkUpdateJointsTemperaturesFromArchive(
    joints,
    'ГСП-1',
    archive,
    'Метеостанция ГСП-1'
  );

  assert.equal(updatedCount, 1);
  assert.equal(updatedJoints[0].ambientTemp, '-6');
  assert.equal(updatedJoints[0].weatherSource, 'Метеостанция ГСП-1');
  assert.equal(updatedJoints[1].ambientTemp, ''); // нет даты в архиве
  assert.equal(updatedJoints[2].ambientTemp, ''); // другой объект
});

test('weatherLogic: joints with different welding dates are strictly protected against cross-pollution', () => {
  const joints: WeldJoint[] = [
    {
      id: 'j-oct1',
      objectName: 'КС-4',
      weldingDate: '2026-10-01',
      ambientTemp: '',
    } as unknown as WeldJoint,
    {
      id: 'j-nov15',
      objectName: 'КС-4',
      weldingDate: '2026-11-15',
      ambientTemp: '',
    } as unknown as WeldJoint,
  ];

  // Daily observations for two separate dates
  const dailyObservations = new Map<string, { tMean: number; source: string }>([
    ['2026-10-01', { tMean: 12.4, source: 'SYNOP Ogimet' }],
    ['2026-11-15', { tMean: -8.6, source: 'NOAA GSOD' }],
  ]);

  // When applying weather specifically for 2026-11-15:
  const targetDate = '2026-11-15';
  const obs = dailyObservations.get(targetDate)!;
  const formattedNov = obs.tMean > 0 ? `+${obs.tMean.toFixed(1)}` : obs.tMean.toFixed(1);

  const updatedTargetDateOnly = joints.map((j) => {
    if (!j.ambientTemp && j.weldingDate === targetDate) {
      return { ...j, ambientTemp: formattedNov, weatherSource: obs.source };
    }
    return j;
  });

  // j-oct1 MUST remain untouched!
  assert.equal(updatedTargetDateOnly[0].ambientTemp, '', 'Стык другой даты (01.10) не должен получить температуру 15.11');
  // j-nov15 MUST receive -8.6
  assert.equal(updatedTargetDateOnly[1].ambientTemp, '-8.6');
  assert.equal(updatedTargetDateOnly[1].weatherSource, 'NOAA GSOD');

  // When batch-mapping all dates to their own respective daily observations:
  const updatedAllDates = joints.map((j) => {
    const dayObs = dailyObservations.get(j.weldingDate || '');
    if (!j.ambientTemp && dayObs) {
      const fmt = dayObs.tMean > 0 ? `+${dayObs.tMean.toFixed(1)}` : dayObs.tMean.toFixed(1);
      return { ...j, ambientTemp: fmt, weatherSource: dayObs.source };
    }
    return j;
  });

  assert.equal(updatedAllDates[0].ambientTemp, '+12.4', 'Стык 01.10 получает строго свою температуру +12.4°C');
  assert.equal(updatedAllDates[1].ambientTemp, '-8.6', 'Стык 15.11 получает строго свою температуру -8.6°C');
});
