import { beforeEach, describe, expect, it } from 'vitest';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import {
  exportSaved,
  importSaved,
  readSaved,
  SAVED_KEY,
} from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { COUNT_COLUMN, DEFAULT_SUMMARY_VIEW } from './modelSummary.js';
import {
  applySummaryPreset,
  BUILT_IN_SUMMARY_PRESETS,
  MAX_PRESET_PROPERTIES,
  missingPresetProperties,
  SUMMARY_PRESETS,
  sanitizeSummaryPreset,
  saveSummaryPreset,
} from './summaryPresets.js';

const KNOWN = [
  'Category',
  'Level',
  'Family',
  'Type Name',
  'Assembly Code',
  'Classification Code',
  'Name',
];

beforeEach(() => {
  installMemoryStorage();
});

describe('sanitizeSummaryPreset', () => {
  it('keeps the view whole, including fields this build does not know', () => {
    const view = {
      ...DEFAULT_SUMMARY_VIEW,
      futureField: { nested: [1, 'two', null] },
    };
    expect(
      sanitizeSummaryPreset({ properties: ['Category', 'Level'], view }),
    ).toEqual({ properties: ['Category', 'Level'], view });
  });

  it('dedupes property names and caps the list', () => {
    const many = Array.from(
      { length: MAX_PRESET_PROPERTIES + 5 },
      (_, index) => `P${index}`,
    );
    const clean = sanitizeSummaryPreset({
      properties: ['Level', 'Level', ...many],
      view: DEFAULT_SUMMARY_VIEW,
    });
    expect(clean?.properties).toHaveLength(MAX_PRESET_PROPERTIES);
    expect(clean?.properties.slice(0, 2)).toEqual([
      'Level',
      ...many.slice(0, 1),
    ]);
  });

  it('rejects anything that is not a complete preset', () => {
    const view = DEFAULT_SUMMARY_VIEW;
    expect(sanitizeSummaryPreset(null)).toBeNull();
    expect(sanitizeSummaryPreset({ view })).toBeNull();
    expect(sanitizeSummaryPreset({ properties: [], view })).toBeNull();
    expect(sanitizeSummaryPreset({ properties: 'Level', view })).toBeNull();
    expect(
      sanitizeSummaryPreset({ properties: ['Level', 3], view }),
    ).toBeNull();
    expect(sanitizeSummaryPreset({ properties: [''], view })).toBeNull();
    expect(sanitizeSummaryPreset({ properties: ['Level'] })).toBeNull();
    expect(
      sanitizeSummaryPreset({ properties: ['Level'], view: 'text' }),
    ).toBeNull();
  });

  it('rejects a view that is not JSON-safe', () => {
    expect(
      sanitizeSummaryPreset({
        properties: ['Level'],
        view: { level: undefined },
      }),
    ).toBeNull();
    expect(
      sanitizeSummaryPreset({
        properties: ['Level'],
        view: { level: Number.POSITIVE_INFINITY },
      }),
    ).toBeNull();
    expect(
      sanitizeSummaryPreset({
        properties: ['Level'],
        view: { level: () => 'nope' },
      }),
    ).toBeNull();
  });

  it('rejects an oversized view', () => {
    expect(
      sanitizeSummaryPreset({
        properties: ['Level'],
        view: { text: 'x'.repeat(100_001) },
      }),
    ).toBeNull();
  });
});

describe('summary preset storage', () => {
  it('round-trips a preset and its unknown view fields', () => {
    const view = { ...DEFAULT_SUMMARY_VIEW, futureField: 42 };
    expect(saveSummaryPreset('Mine', ['Category', 'Level'], view)).toBe(true);
    const item = SUMMARY_PRESETS.list()[0];
    expect(item?.name).toBe('Mine');
    expect(item?.data).toEqual({
      properties: ['Category', 'Level'],
      view,
    });
  });

  it('writes the whole view into the summary settings', () => {
    const view = { ...DEFAULT_SUMMARY_VIEW, futureField: 'kept' };
    expect(
      applySummaryPreset({ properties: ['Level', 'Category'], view }),
    ).toBe(true);
    expect(PANE_SETTINGS.summary.properties.read()).toEqual([
      'Level',
      'Category',
    ]);
    const stored = JSON.parse(
      window.localStorage.getItem('bsh.summary.view.v1') ?? '{}',
    ) as Record<string, unknown>;
    expect(stored.futureField).toBe('kept');
  });

  it('survives a JSON export and import round trip with unknown fields', () => {
    const view = { ...DEFAULT_SUMMARY_VIEW, futureField: 'kept' };
    expect(saveSummaryPreset('Shared', ['Category'], view)).toBe(true);
    const file = exportSaved('summary-preset');
    window.localStorage.removeItem(SAVED_KEY);
    const result = importSaved(file);
    expect(result.accepted).toBe(1);
    expect(SUMMARY_PRESETS.list()[0]?.data).toEqual({
      properties: ['Category'],
      view,
    });
  });

  it('applies a partial view without writing an unusable one', () => {
    expect(
      applySummaryPreset({ properties: ['Level'], view: { futureField: 1 } }),
    ).toBe(true);
    expect(PANE_SETTINGS.summary.view.read()).toMatchObject({
      layout: 'flat',
      groupBy: [],
      columns: [COUNT_COLUMN],
      text: '',
    });
  });

  it('skips a corrupt stored preset instead of half-building it', () => {
    window.localStorage.setItem(
      SAVED_KEY,
      JSON.stringify({
        version: 2,
        items: [
          {
            id: 'broken-1',
            kind: 'summary-preset',
            name: 'Broken',
            version: 1,
            updatedAt: 1,
            data: { properties: [{ nested: true }], view: {} },
          },
          {
            id: 'broken-2',
            kind: 'summary-preset',
            name: 'Also broken',
            version: 1,
            updatedAt: 1,
            data: { properties: ['Level'] },
          },
        ],
      }),
    );
    expect(SUMMARY_PRESETS.list()).toEqual([]);
    expect(readSaved('summary-preset')).toHaveLength(2);
  });
});

describe('built-in summary presets', () => {
  it('offers the named starters built from real property names', () => {
    const names = BUILT_IN_SUMMARY_PRESETS.map((preset) => preset.name);
    expect(names).toEqual(
      expect.arrayContaining(['Doors check', 'Rooms by level']),
    );
    for (const preset of BUILT_IN_SUMMARY_PRESETS) {
      expect(preset.data.properties.every((name) => KNOWN.includes(name))).toBe(
        true,
      );
      expect(sanitizeSummaryPreset(preset.data)).not.toBeNull();
    }
  });
});

describe('missingPresetProperties', () => {
  it('names exactly the properties a model lacks', () => {
    expect(
      missingPresetProperties(
        ['Category', 'Family', 'Type Name'],
        ['Category', 'Level', 'Assembly Code', 'Classification Code', 'Name'],
      ),
    ).toEqual(['Family', 'Type Name']);
  });
});
