import { describe, expect, it } from 'vitest';
import { measurementsCsv, toMeasurements } from './measurements.js';

describe('toMeasurements', () => {
  it('keeps typed entries and formats numbers', () => {
    expect(
      toMeasurements([
        { id: 3, type: 'distance', distance: '3.50 m' },
        { type: 'area', area: 12.25, unit: 'm²' },
        { type: 'angle', angle: '90°' },
        null,
        { nothing: true },
      ]),
    ).toEqual([
      { id: '3', type: 'distance', value: '3.50 m' },
      { id: 'm1', type: 'area', value: '12.25 m²' },
      { id: 'm2', type: 'angle', value: '90°' },
    ]);
  });

  it('ignores entries that are not a list', () => {
    expect(toMeasurements(null)).toEqual([]);
    expect(toMeasurements({ type: 'distance' })).toEqual([]);
  });

  it('writes guarded CSV', () => {
    expect(
      measurementsCsv([{ id: '1', type: 'distance', value: '=1 m' }]),
    ).toBe("Type,Value\r\ndistance,'=1 m");
    expect(
      measurementsCsv([
        { id: '1', type: 'distance', value: '1 "pipe" x 2' },
        { id: '2', type: 'area', value: '12.25 m²' },
      ]),
    ).toBe('Type,Value\r\ndistance,"1 ""pipe"" x 2"\r\narea,12.25 m²');
    expect(measurementsCsv([])).toBe('Type,Value');
  });
});
