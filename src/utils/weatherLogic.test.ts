import { test, assert } from 'vitest';
import {
  bulkUpdateJointsTemperaturesFromArchive,
  estimateAmbientTempByCoordsAndDate,
  fetchAmbientTemperatureAuto,
  generatePeriodWeatherArchive,
  getFacilityWeatherStationName,
} from './weatherLogic';
import type { WeldJoint } from '../types/welding';

test('weatherLogic: estimateAmbientTempByCoordsAndDate differentiates temperate vs arctic climate curves', () => {
  // Волхов (59.93° с.ш., 32.34° в.д.) — Северо-Запад
  const tempVolkhovSummer = estimateAmbientTempByCoordsAndDate(59.93, 32.34, '2026-07-15');
  assert.equal(typeof tempVolkhovSummer, 'number');
  assert.equal(tempVolkhovSummer > 10, true, 'Летом в Волхове должна быть положительная умеренная температура');

  // Ямал / Харасавэй (71.18° с.ш., 66.78° в.д.) — Арктика
  const tempYamalWinter = estimateAmbientTempByCoordsAndDate(71.18, 66.78, '2026-01-15');
  assert.equal(typeof tempYamalWinter, 'number');
  assert.equal(tempYamalWinter < -20, true, 'Зимой на Ямале должна быть арктическая температура ниже -20°C');
});

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
