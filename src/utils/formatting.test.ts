import { test, assert } from 'vitest';
import {
  formatDateDDMMYY,
  formatTimestampDDMMYY,
  formatDateRuLong,
  normalizeDateToISO,
  normalizeDecimalInput,
  parseDecimalNumber,
  formatNumberRu,
  formatLength,
  formatDN,
  formatDiameterWall,
  formatTemperature,
  formatInspectorShortName,
  formatWelderDisplay,
} from './formatting';

test('formatting: dates and timestamps formatting', () => {
  assert.equal(formatDateDDMMYY('2026-10-12'), '12.10.26');
  assert.equal(formatDateDDMMYY('15.04.2026'), '15.04.26');
  assert.equal(formatDateDDMMYY('18.10.26'), '18.10.26');
  assert.equal(formatTimestampDDMMYY('2026-10-21T09:15:12Z'), '21.10.26 09:15');
  assert.equal(formatDateRuLong('2026-10-12'), '12 октября 2026 г.');
  assert.equal(normalizeDateToISO('15.04.26'), '2026-04-15');
  assert.equal(normalizeDateToISO('15.04.2026'), '2026-04-15');
});

test('formatting: decimal numbers and Russian formatting', () => {
  assert.equal(normalizeDecimalInput('12,5'), '12.5');
  assert.equal(parseDecimalNumber('14,75'), 14.75);
  assert.equal(parseDecimalNumber(''), undefined);
  assert.equal(formatNumberRu(1271), '1 271'); // ru-RU non-breaking space
});

test('formatting: pipe geometry, length, and diameter formatting', () => {
  assert.equal(formatLength(11800), '11.8 м');
  assert.equal(formatLength(11800, { unit: 'mm' }), '11800 мм');
  assert.equal(formatLength(0.85), '0.85 м');
  assert.equal(formatDN(50, '2"'), 'DN 50 (2")');
  assert.equal(formatDN(100), 'DN 100');
  assert.equal(formatDiameterWall(219, 8), 'Ø 219 × 8 мм');
  assert.equal(formatDiameterWall(57), 'Ø 57 мм');
  assert.equal(formatTemperature(-15.4), '-15 °C');
  assert.equal(formatTemperature(22.1), '+22 °C');
  assert.equal(formatTemperature(null), '—');
});

test('formatting: personnel names and welder stamp display', () => {
  assert.equal(formatInspectorShortName('Иванов Иван Иванович'), 'Иванов И.И.');
  assert.equal(formatInspectorShortName('Петров'), 'Петров');
  assert.equal(formatInspectorShortName(''), '');
  assert.equal(formatWelderDisplay('С01', 'Иванов Иван Иванович'), 'С01 (Иванов И.И.)');
  assert.equal(formatWelderDisplay('С01', null), 'С01');
  assert.equal(formatWelderDisplay(null, 'Петров Петр Петрович'), 'Петров П.П.');
});
