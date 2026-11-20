import { describe, expect, it } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import {
  DEFAULT_HEALTH_KPI_OPTIONS,
  healthKpis,
  sanitizeHealthKpiOptions,
} from './healthKpis.js';

const row = (dbId: number, properties: PropertyRow['properties']) => ({
  dbId,
  modelId: 'm',
  name: String(dbId),
  properties,
});

const options = {
  ...DEFAULT_HEALTH_KPI_OPTIONS,
  threshold: 50,
};

function tile(
  tiles: ReturnType<typeof healthKpis>,
  id: string,
): ReturnType<typeof healthKpis>[number] {
  const found = tiles.find((item) => item.id === id);
  if (!found) throw new Error(`missing tile ${id}`);
  return found;
}

describe('healthKpis', () => {
  it('counts elements and reports the offenders of each check', () => {
    const tiles = healthKpis(
      [
        row(1, {
          Level: 'L1',
          'Classification Code': 'A',
          Name: 'Door 1',
          Mark: 'D1',
        }),
        row(2, {
          Level: null,
          'Classification Code': 'A',
          Name: 'Door 1',
          Mark: 'D2',
        }),
        row(3, {
          Level: 'L2',
          'Classification Code': '',
          Name: 'Door 3',
          Mark: 'D2',
        }),
      ],
      options,
    );

    expect(tile(tiles, 'elements')).toMatchObject({
      value: 3,
      share: 1,
      tone: 'neutral',
      offenders: [],
    });
    const level = tile(tiles, 'missing:Level');
    expect(level).toMatchObject({ value: 1, tone: 'good' });
    expect(level.share).toBeCloseTo(1 / 3);
    expect(level.text).toMatch(/within the 50% threshold/);
    expect(level.offenders).toEqual([{ modelId: 'm', dbId: 2 }]);

    const classification = tile(tiles, 'missing:Classification Code');
    expect(classification.offenders).toEqual([{ modelId: 'm', dbId: 3 }]);

    const empty = tile(tiles, 'empty');
    expect(empty).toMatchObject({ value: 2, tone: 'neutral' });
    expect(empty.offenders).toEqual([
      { modelId: 'm', dbId: 2 },
      { modelId: 'm', dbId: 3 },
    ]);

    expect(tile(tiles, 'duplicate:Name')).toMatchObject({
      value: 2,
      tone: 'bad',
    });
    expect(tile(tiles, 'duplicate:Name').offenders).toEqual([
      { modelId: 'm', dbId: 1 },
      { modelId: 'm', dbId: 2 },
    ]);
    expect(tile(tiles, 'duplicate:Mark').offenders).toEqual([
      { modelId: 'm', dbId: 2 },
      { modelId: 'm', dbId: 3 },
    ]);
  });

  it('turns a tile red only above the threshold and says so', () => {
    const rows = [
      row(1, { Level: 'L1', Name: 'a' }),
      row(2, { Level: null, Name: 'b' }),
      row(3, { Level: null, Name: 'c' }),
      row(4, { Level: null, Name: 'd' }),
    ];
    const strict = tile(
      healthKpis(rows, { ...options, threshold: 20, mustHave: ['Level'] }),
      'missing:Level',
    );
    expect(strict.share).toBe(0.75);
    expect(strict.tone).toBe('bad');
    expect(strict.text).toBe('Above the 20% threshold');

    const loose = tile(
      healthKpis(rows, { ...options, threshold: 80, mustHave: ['Level'] }),
      'missing:Level',
    );
    expect(loose.tone).toBe('good');
    expect(loose.text).toMatch(/within the 80% threshold/);
  });

  it('is sane on an empty model, an all-empty property and one value', () => {
    expect(healthKpis([], options)).toHaveLength(
      1 + options.mustHave.length + 1 + options.unique.length,
    );
    for (const item of healthKpis([], options)) {
      expect(item.value).toBe(0);
      expect(item.offenders).toEqual([]);
    }

    const allEmpty = healthKpis(
      [row(1, { Level: null }), row(2, { Level: null })],
      { ...options, mustHave: ['Level'], unique: ['Name'] },
    );
    const missing = tile(allEmpty, 'missing:Level');
    expect(missing).toMatchObject({ value: 2, share: 1, tone: 'bad' });
    expect(missing.offenders).toHaveLength(2);
    expect(tile(allEmpty, 'duplicate:Name')).toMatchObject({ value: 0 });

    const single = healthKpis(
      [row(1, { Name: 'Same' }), row(2, { Name: 'Same' })],
      { ...options, mustHave: [], unique: ['Name'] },
    );
    expect(tile(single, 'duplicate:Name')).toMatchObject({
      value: 2,
      share: 1,
      tone: 'bad',
    });
  });

  it('ignores blank values when it looks for duplicates', () => {
    const tiles = healthKpis(
      [row(1, { Name: '' }), row(2, { Name: null }), row(3, { Name: 'a' })],
      { ...options, mustHave: [], unique: ['Name'] },
    );
    expect(tile(tiles, 'duplicate:Name').value).toBe(0);
  });

  it('reports a numeric measure with its unit and a mixed family', () => {
    const numeric = healthKpis(
      [
        row(1, { Weight: '500 mm', Name: 'a' }),
        row(2, { Weight: '2 m', Name: 'b' }),
      ],
      { ...options, mustHave: [], unique: [], measure: 'Weight' },
    );
    const values = tile(numeric, 'numeric:Weight');
    expect(values.value).toBe(2);
    expect(values.tone).toBe('neutral');
    expect(values.text).toContain('2.5 m');

    const mixed = healthKpis(
      [
        row(1, { Weight: '2 m', Name: 'a' }),
        row(2, { Weight: '3 kg', Name: 'b' }),
      ],
      { ...options, mustHave: [], unique: [], measure: 'Weight' },
    );
    const mixedTile = tile(mixed, 'numeric:Weight');
    expect(mixedTile.tone).toBe('bad');
    expect(mixedTile.text).toBe('Mixed units (kg, m), not summed');
  });

  it('returns nothing when the tiles are switched off', () => {
    expect(healthKpis([row(1, {})], { ...options, enabled: false })).toEqual(
      [],
    );
  });
});

describe('sanitizeHealthKpiOptions', () => {
  it('fills every missing field with a default', () => {
    expect(sanitizeHealthKpiOptions({})).toEqual(DEFAULT_HEALTH_KPI_OPTIONS);
    expect(sanitizeHealthKpiOptions(null)).toEqual(DEFAULT_HEALTH_KPI_OPTIONS);
  });

  it('keeps valid choices and clamps the threshold', () => {
    expect(
      sanitizeHealthKpiOptions({
        enabled: false,
        mustHave: [' Level ', 'Level', ''],
        unique: 'Name',
        threshold: 500,
        measure: ' Weight ',
      }),
    ).toEqual({
      enabled: false,
      mustHave: ['Level'],
      unique: DEFAULT_HEALTH_KPI_OPTIONS.unique,
      threshold: 100,
      measure: 'Weight',
    });
    expect(sanitizeHealthKpiOptions({ threshold: -1 }).threshold).toBe(10);
  });

  it('lets an empty list switch a check off', () => {
    expect(sanitizeHealthKpiOptions({ mustHave: [] }).mustHave).toEqual([]);
  });
});
