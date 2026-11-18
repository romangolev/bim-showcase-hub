import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import {
  DEFAULT_SETTINGS,
  readSettings,
  SETTINGS_STORAGE_KEY,
  SettingsProvider,
  useSettings,
  writeSettings,
} from './index.js';
import { readExcelSettings } from './settings.js';

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe('readSettings', () => {
  it('returns defaults when nothing is stored', () => {
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults for corrupt storage', () => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, '{nope');
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid booleans and defaults the rest', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ paintBrushes: false, excelExport: 'yes' }),
    );
    expect(readSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      paintBrushes: false,
    });
  });

  it('validates the nested IFC settings field by field', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ifcExport: false,
        ifc: {
          classOverrides: {
            Walls: 'IfcCovering',
            Bad: 'IfcNonsense',
            ' ': 'IfcWall',
          },
          psetExclude: [' Dimensions ', '', 7],
          psetInclude: 'nope',
          levelProperty: '',
          fallbackStorey: 'Ground',
          projectName: 'P',
          lengthUnit: 'km',
        },
      }),
    );
    const { ifc, ifcExport } = readSettings();
    expect(ifcExport).toBe(false);
    expect(ifc.classOverrides).toEqual({ Walls: 'IfcCovering' });
    expect(ifc.psetExclude).toEqual(['Dimensions']);
    expect(ifc.psetInclude).toEqual([]);
    expect(ifc.levelProperty).toBe('Level');
    expect(ifc.fallbackStorey).toBe('Ground');
    expect(ifc.projectName).toBe('P');
    expect(ifc.lengthUnit).toBe('m');
  });

  it('loads a record stored before the IFC settings existed', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        paintBrushes: true,
        excelExport: true,
        glbExport: false,
      }),
    );
    expect(readSettings()).toEqual({ ...DEFAULT_SETTINGS, glbExport: false });
  });
});

function Probe() {
  const { settings, setSetting } = useSettings();
  return (
    <button type="button" onClick={() => setSetting('paintBrushes', false)}>
      paint {String(settings.paintBrushes)}
    </button>
  );
}

describe('table export settings', () => {
  it('keeps valid choices and defaults the rest', () => {
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        excel: {
          format: 'csv',
          scope: 'nope',
          metadata: true,
          namePattern: '',
        },
      }),
    );
    expect(readSettings().excel).toEqual({
      ...DEFAULT_SETTINGS.excel,
      format: 'csv',
      metadata: true,
    });
  });
});

describe('settings edge cases', () => {
  it.each(['null', '"5"', '[]'])('defaults for non-object JSON %s', (raw) => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, raw);
    expect(readSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('swallows a throwing setItem', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeSettings(DEFAULT_SETTINGS)).not.toThrow();
  });
});

describe('SettingsProvider', () => {
  it('persists a changed setting', () => {
    render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
    fireEvent.click(screen.getByText('paint true'));
    expect(screen.getByText('paint false')).toBeTruthy();
    expect(
      JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? '{}'),
    ).toMatchObject({ paintBrushes: false });
  });

  it('works without a provider using defaults', () => {
    render(<Probe />);
    expect(screen.getByText('paint true')).toBeTruthy();
  });
});

describe('readExcelSettings', () => {
  it('keeps valid values and falls back on bad ones', () => {
    expect(
      readExcelSettings({
        csvDelimiter: ';',
        decimalMark: ',',
        includeHeader: false,
        exporterName: false,
        summarySheet: true,
      }),
    ).toMatchObject({
      csvDelimiter: ';',
      decimalMark: ',',
      includeHeader: false,
      exporterName: false,
      summarySheet: true,
    });
    expect(
      readExcelSettings({ csvDelimiter: '|', decimalMark: 'x' }),
    ).toMatchObject({ csvDelimiter: ',', decimalMark: '.' });
  });
});
