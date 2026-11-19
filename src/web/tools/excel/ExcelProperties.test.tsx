import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_EXPORT_PROPERTIES } from '../../extensions/excelExport.js';
import { sanitizePropertyNames } from '../../extensions/propertyNames.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import { publishActiveAdapter } from '../../viewer/activeAdapterStore.js';
import { MockViewerAdapter } from '../../viewer/MockViewerAdapter.js';
import { ExcelExportTool } from './ExcelExportTool.js';
import {
  DEFAULT_EXCEL_TOOL_SETTINGS,
  EXCEL_SETTINGS_KEY,
  readExcelToolSettings,
} from './excelSettings.js';

function stored(): Record<string, unknown> {
  return JSON.parse(
    window.localStorage.getItem(EXCEL_SETTINGS_KEY) ?? '{}',
  ) as Record<string, unknown>;
}

const adapters: MockViewerAdapter[] = [];

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  publishActiveAdapter(null);
  for (const adapter of adapters.splice(0)) adapter.destroy();
});

async function published(): Promise<MockViewerAdapter> {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  adapters.push(adapter);
  publishActiveAdapter(adapter);
  return adapter;
}

describe('export columns', () => {
  it('defaults to the standard columns', () => {
    expect(DEFAULT_EXCEL_TOOL_SETTINGS.properties).toEqual(
      DEFAULT_EXPORT_PROPERTIES,
    );
    expect(readExcelToolSettings(undefined).properties).toEqual(
      DEFAULT_EXPORT_PROPERTIES,
    );
  });

  it('keeps a chosen list, drops blanks and duplicates, and never empties', () => {
    const sanitize = (raw: unknown) =>
      sanitizePropertyNames(raw, DEFAULT_EXPORT_PROPERTIES);
    expect(sanitize(['Name', 'Name', 7, ' ', 'Level'])).toEqual([
      'Name',
      'Level',
    ]);
    expect(sanitize([])).toEqual(DEFAULT_EXPORT_PROPERTIES);
    expect(sanitize('Name')).toEqual(DEFAULT_EXPORT_PROPERTIES);
  });

  it('lists the discovered catalog and stores the chosen columns', async () => {
    await published();
    render(new ExcelExportTool().renderSettings());
    await screen.findByRole('checkbox', { name: 'Level' });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Assembly Code' }));
    await waitFor(() =>
      expect(stored().properties).toEqual([
        'Category',
        'Name',
        'Classification Code',
        'Level',
      ]),
    );
    expect(readExcelToolSettings(stored()).properties).toEqual([
      'Category',
      'Name',
      'Classification Code',
      'Level',
    ]);
  });

  it('keeps the last column and explains there is no model', () => {
    render(new ExcelExportTool().renderSettings());
    expect(screen.getByText('No model loaded')).toBeInTheDocument();
    const remove = screen.getByRole('button', { name: 'Remove Name' });
    expect(remove).not.toBeDisabled();
    for (const name of DEFAULT_EXPORT_PROPERTIES) {
      if (name === 'Name') continue;
      fireEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
    }
    expect(stored().properties).toEqual(['Name']);
    expect(screen.getByRole('button', { name: 'Remove Name' })).toBeDisabled();
  });
});
