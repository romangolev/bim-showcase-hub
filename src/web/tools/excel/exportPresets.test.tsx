import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../../shared/types.js';
import {
  DEFAULT_EXPORT_PROPERTIES,
  describeStatus,
  exportToXlsx,
} from '../../extensions/excelExport.js';
import { DEFAULT_NAME_PATTERN } from '../../extensions/exportFormats.js';
import {
  clearSaved,
  exportSaved,
  importSaved,
  upsertSaved,
} from '../../store/savedStore.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import { ExcelExportTool } from './ExcelExportTool.js';
import {
  DEFAULT_EXCEL_TOOL_SETTINGS,
  EXCEL_SETTINGS_KEY,
} from './excelSettings.js';
import {
  EXPORT_PRESETS,
  presetFromSettings,
  presetSettings,
  sanitizeExportPreset,
} from './exportPresets.js';

const DEFAULTS = {
  properties: DEFAULT_EXPORT_PROPERTIES,
  format: 'xlsx' as const,
  scope: 'all' as const,
  namePattern: DEFAULT_NAME_PATTERN,
  includeHeader: true,
};

function stored(): Record<string, unknown> {
  return JSON.parse(
    window.localStorage.getItem(EXCEL_SETTINGS_KEY) ?? '{}',
  ) as Record<string, unknown>;
}

function row(dbId: number, properties: Record<string, string>): PropertyRow {
  return { dbId, name: String(dbId), modelId: 'm', properties };
}

function adapterOf(rows: PropertyRow[]): never {
  return {
    getLeafProperties: () => Promise.resolve(rows),
    getModels: () => [
      { id: 'm', urn: 'm', name: 'm', visible: true, status: 'ready' },
    ],
    getModelSelection: () => [],
  } as never;
}

beforeEach(() => {
  installMemoryStorage();
});

describe('sanitizeExportPreset', () => {
  it('defaults to the standard columns and an Excel file', () => {
    expect(sanitizeExportPreset(undefined)).toEqual(DEFAULTS);
  });

  it('fills the fields an older or partial item does not carry', () => {
    expect(sanitizeExportPreset({ properties: ['Name', 'Level'] })).toEqual({
      ...DEFAULTS,
      properties: ['Name', 'Level'],
    });
  });

  it('keeps valid choices and falls back on bad ones', () => {
    expect(
      sanitizeExportPreset({
        format: 'csv',
        scope: 'set:ss-1',
        namePattern: '{model}-x',
        includeHeader: false,
      }),
    ).toMatchObject({
      format: 'csv',
      scope: 'set:ss-1',
      namePattern: '{model}-x',
      includeHeader: false,
    });
    expect(
      sanitizeExportPreset({
        format: 'xml',
        scope: 'nope',
        namePattern: '',
        includeHeader: 'yes',
      }),
    ).toEqual(DEFAULTS);
  });
});

describe('the export preset saved kind', () => {
  it('saves a preset at version 1 without the personal fields', () => {
    const saved = EXPORT_PRESETS.save('Weekly', DEFAULT_EXCEL_TOOL_SETTINGS);
    expect(saved).toMatchObject({ version: 1, name: 'Weekly' });
    expect(saved?.data).toEqual(DEFAULTS);
    expect(saved?.data).not.toHaveProperty('modelScope');
  });

  it('rejects an item that claims a newer kind version', () => {
    const newer = {
      id: 'ep-newer',
      kind: 'export-preset',
      name: 'Newer',
      version: 2,
      updatedAt: 1,
      data: { properties: ['Name'] },
    };
    expect(upsertSaved(newer)).toBe(false);
    expect(
      importSaved(
        JSON.stringify({ format: 'bsh-saved', version: 2, items: [newer] }),
      ),
    ).toMatchObject({ accepted: 0, rejected: 1 });
    expect(EXPORT_PRESETS.list()).toEqual([]);
  });

  it('round-trips a preset through the saved-items file', () => {
    EXPORT_PRESETS.save(
      'Team',
      presetFromSettings({
        ...DEFAULT_EXCEL_TOOL_SETTINGS,
        format: 'csv',
        properties: ['Name', 'Level'],
      }),
    );
    const file = exportSaved();
    expect(
      (JSON.parse(file) as { kinds: Record<string, number> }).kinds[
        'export-preset'
      ],
    ).toBe(1);
    clearSaved();
    expect(EXPORT_PRESETS.list()).toEqual([]);
    expect(importSaved(file)).toMatchObject({ accepted: 1, rejected: 0 });
    expect(EXPORT_PRESETS.list()[0]?.data).toMatchObject({
      format: 'csv',
      properties: ['Name', 'Level'],
    });
  });

  it('exports a preset column the model lacks as a blank cell and warns', async () => {
    const preset = presetFromSettings({
      ...DEFAULT_EXCEL_TOOL_SETTINGS,
      properties: ['Name', 'Ghost'],
    });
    const saved: Blob[] = [];
    const status = await exportToXlsx(adapterOf([row(1, { Name: 'Wall' })]), {
      propertyNames: presetSettings(preset).properties,
      groupBy: null,
      format: 'csv',
      fileName: 'a.csv',
      save: (blob) => {
        saved.push(blob);
      },
    });
    expect(status).toMatchObject({
      phase: 'done',
      rowCount: 1,
      missingColumns: ['Ghost'],
    });
    expect(describeStatus(status)).toContain('No values for Ghost');
    const text = await (saved[0] as Blob).text();
    expect(text).toContain('dbId,Name,Ghost');
    expect(text).toContain('1,Wall,');
  });
});

describe('presets in the Excel settings', () => {
  it('saves the current setup, applies it and deletes it', async () => {
    render(new ExcelExportTool().renderSettings());
    fireEvent.change(screen.getByLabelText('Format'), {
      target: { value: 'csv' },
    });
    fireEvent.change(screen.getByLabelText('Export preset name'), {
      target: { value: 'Weekly' },
    });
    fireEvent.click(screen.getByText('Save current setup'));
    expect(EXPORT_PRESETS.list()).toHaveLength(1);
    expect(EXPORT_PRESETS.list()[0]?.data).toMatchObject({ format: 'csv' });

    fireEvent.change(screen.getByLabelText('Format'), {
      target: { value: 'json' },
    });
    expect(stored().format).toBe('json');
    fireEvent.click(await screen.findByLabelText('Apply Weekly'));
    expect(stored()).toMatchObject({
      format: 'csv',
      properties: DEFAULT_EXPORT_PROPERTIES,
    });

    fireEvent.click(screen.getByLabelText('Delete Weekly'));
    expect(EXPORT_PRESETS.list()).toEqual([]);
  });

  it('reports a save that the browser refuses', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded');
    });
    render(new ExcelExportTool().renderSettings());
    fireEvent.change(screen.getByLabelText('Export preset name'), {
      target: { value: 'Weekly' },
    });
    fireEvent.click(screen.getByText('Save current setup'));
    expect(EXPORT_PRESETS.list()).toEqual([]);
    expect(screen.getByRole('alert').textContent).toMatch(
      /Could not save the preset/,
    );
  });

  it('lists a saved preset again after the window is reopened', () => {
    const first = render(new ExcelExportTool().renderSettings());
    fireEvent.change(screen.getByLabelText('Export preset name'), {
      target: { value: 'Weekly' },
    });
    fireEvent.click(screen.getByText('Save current setup'));
    first.unmount();
    render(new ExcelExportTool().renderSettings());
    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.getByLabelText('Apply Weekly')).toBeInTheDocument();
  });

  it('applies the stored scope and file name pattern', () => {
    EXPORT_PRESETS.save(
      'Selected',
      presetFromSettings({
        ...DEFAULT_EXCEL_TOOL_SETTINGS,
        scope: 'selected',
        namePattern: '{model}-selection',
      }),
    );
    render(new ExcelExportTool().renderSettings());
    fireEvent.click(screen.getByLabelText('Apply Selected'));
    expect(stored()).toMatchObject({
      scope: 'selected',
      namePattern: '{model}-selection',
    });
  });
});
