import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { excelFileNameFrom } from '../tools/excel/ExcelExportTool.js';
import {
  DEFAULT_FILE_NAME,
  exportFileName,
  exportToXlsx,
} from './excelExport.js';
import {
  aboutRows,
  applyNamePattern,
  DEFAULT_EXCEL_SETTINGS,
  guardCell,
  readExcelSettings,
  toDelimited,
  toJsonRecords,
} from './exportFormats.js';

function row(dbId: number, name: string, modelId = 'm'): PropertyRow {
  return { dbId, name, modelId, properties: { Name: name, Category: 'Walls' } };
}

function adapterOf(
  rows: PropertyRow[],
  extra: Record<string, unknown> = {},
): never {
  return {
    getLeafProperties: () => Promise.resolve(rows),
    getModels: () => [
      { id: 'm', urn: 'm', name: 'm', visible: true, status: 'ready' },
    ],
    getModelSelection: () => [],
    ...extra,
  } as never;
}

function savedBlob(save: ReturnType<typeof vi.fn>): Blob {
  return save.mock.calls[0]?.[0] as Blob;
}

describe('guardCell', () => {
  it.each(['=1+1', '=SUM(A1)', '+cmd|x', '-2+3', '@x', '\tx', '\rx'])(
    'prefixes %j',
    (v) => {
      expect(guardCell(v)).toBe(`'${v}`);
    },
  );

  it('leaves safe text, plain numbers and non-strings alone', () => {
    expect(guardCell('Wall')).toBe('Wall');
    for (const v of ['-5', '+5', '-1.5e3', '-.5', '-5.5', '-']) {
      expect(guardCell(v)).toBe(v);
    }
    expect(guardCell(-5)).toBe(-5);
    expect(guardCell(true)).toBe(true);
  });
});

describe('serializers', () => {
  it('quotes delimiters and guards formulas in CSV and TSV', () => {
    expect(toDelimited(['a', 'b'], [['x,y', '=HYPERLINK("u")']], ',')).toBe(
      'a,b\r\n"x,y","\'=HYPERLINK(""u"")"',
    );
    expect(toDelimited(['a'], [['p\tq']], '\t')).toBe('a\r\n"p\tq"');
  });

  it('applies delimiter, decimal mark and header options', () => {
    expect(
      toDelimited(['a', 'b'], [[1.5, 'x']], ';', {
        decimal: ',',
        header: false,
      }),
    ).toBe('1,5;x');
    expect(toDelimited(['a', 'b'], [[1.5, 2]], ',', { decimal: ',' })).toBe(
      'a,b\r\n"1,5",2',
    );
  });

  it('names the exporter in the about rows unless switched off', () => {
    const info = { models: [], scope: 'all' as const, rowCount: 1 };
    expect(aboutRows(info).map(([key]) => key)).toContain('Exporter');
    expect(
      aboutRows({ ...info, exporter: false }).map(([key]) => key),
    ).not.toContain('Exporter');
  });

  it('adds version and path rows only when a model carries them', () => {
    const base = { scope: 'all' as const, rowCount: 1 };
    const plain = aboutRows({ ...base, models: [{ name: 'A', urn: 'u' }] });
    expect(plain.map(([key]) => key)).not.toContain('Version (from link)');
    const rows = aboutRows({
      ...base,
      models: [
        { name: 'A', urn: 'u', version: 'V2', path: 'Hub / Project' },
        { name: 'B', urn: 'w' },
      ],
    });
    expect(Object.fromEntries(rows)).toMatchObject({
      'Version (from link)': 'V2, ',
      'Path (from link)': 'Hub / Project, ',
    });
  });

  it('builds JSON records keyed by header', () => {
    expect(toJsonRecords(['a', 'b'], [[1, 'x']])).toEqual([{ a: 1, b: 'x' }]);
  });
});

describe('scope and file name', () => {
  it('fills the pattern and sanitises the result', () => {
    const date = new Date('2026-11-17T10:00:00Z');
    expect(applyNamePattern('{model}_{date}', 'House 1', 'csv', date)).toBe(
      'House-1_2026-11-17.csv',
    );
    expect(applyNamePattern('{model}', 'Tower $& Annex', 'csv')).toBe(
      'Tower-Annex.csv',
    );
    expect(applyNamePattern(' ', 'x', 'json')).toMatch(/^x-properties\.json$/);
    expect(applyNamePattern('{model}', 'Дом-1.rvt', 'csv')).toBe(
      'Дом-1.rvt.csv',
    );
    expect(
      excelFileNameFrom('House-properties-v2', {
        ...DEFAULT_EXCEL_SETTINGS,
        format: 'csv',
        scope: 'all',
        metadata: false,
        namePattern: '{model}-properties',
      }),
    ).toBe('House-properties-v2.csv');
    expect(
      excelFileNameFrom('House-v2-properties.xlsx', {
        ...DEFAULT_EXCEL_SETTINGS,
        format: 'csv',
        scope: 'all',
        metadata: false,
        namePattern: '{model}',
      }),
    ).toBe('House-v2.csv');
  });
});

describe('exportToXlsx formats', () => {
  const data = [row(1, '=cmd'), row(2, 'Door')];

  it('writes CSV with a BOM and a guarded cell', async () => {
    const save = vi.fn();
    await exportToXlsx(adapterOf(data), {
      propertyNames: ['Name'],
      format: 'csv',
      fileName: 'a.csv',
      save,
    });
    const blob = savedBlob(save);
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(
      await blob.arrayBuffer(),
    );
    expect(text.startsWith('﻿dbId,Name')).toBe(true);
    expect(text).toContain("1,'=cmd");
  });

  it('writes JSON with an about block when asked', async () => {
    const save = vi.fn();
    await exportToXlsx(adapterOf(data), {
      propertyNames: ['Name'],
      format: 'json',
      metadata: true,
      fileName: 'a.json',
      save,
    });
    const body = JSON.parse(await savedBlob(save).text());
    expect(body.about.Rows).toBe(2);
    expect(body.elements[1]).toEqual({ dbId: 2, Name: 'Door' });
  });

  it('passes delimiter, decimal mark and header to the CSV file', async () => {
    const save = vi.fn();
    await exportToXlsx(adapterOf(data), {
      propertyNames: ['Name'],
      format: 'csv',
      table: { delimiter: ';', header: false },
      fileName: 'a.csv',
      save,
    });
    const text = new TextDecoder('utf-8', { ignoreBOM: true }).decode(
      await savedBlob(save).arrayBuffer(),
    );
    expect(text).toBe("\uFEFF1;'=cmd\r\n2;Door");
  });

  it('adds a Summary sheet to the workbook when asked', async () => {
    const without = vi.fn();
    const withSheet = vi.fn();
    const base = { propertyNames: ['Name'], fileName: 'a.xlsx' };
    await exportToXlsx(adapterOf(data), { ...base, save: without });
    const status = await exportToXlsx(adapterOf(data), {
      ...base,
      summarySheet: true,
      save: withSheet,
    });
    expect(status).toMatchObject({ phase: 'done' });
    expect(savedBlob(withSheet).size).toBeGreaterThan(savedBlob(without).size);
  });

  it('copies TSV to the clipboard hook', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const status = await exportToXlsx(adapterOf(data), {
      propertyNames: ['Name'],
      format: 'copy',
      copy,
      save: vi.fn(),
    });
    expect(await copy.mock.calls[0]?.[0]).toBe(
      "dbId\tName\r\n1\t'=cmd\r\n2\tDoor",
    );
    expect(status).toMatchObject({ phase: 'done', rowCount: 2 });
  });

  it('reports an error when the clipboard is unavailable', async () => {
    const copy = vi.fn(() => {
      throw new TypeError(
        "Cannot read properties of undefined (reading 'write')",
      );
    });
    const onStatus = vi.fn();
    const status = await exportToXlsx(adapterOf(data), {
      propertyNames: ['Name'],
      format: 'copy',
      copy,
      onStatus,
      save: vi.fn(),
    });
    expect(status).toMatchObject({ phase: 'error' });
    expect(onStatus).toHaveBeenLastCalledWith(status);
  });

  it('copies with the configured delimiter and decimal mark', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    await exportToXlsx(adapterOf(data), {
      propertyNames: ['Name'],
      format: 'copy',
      table: { delimiter: ';', header: false },
      copy,
      save: vi.fn(),
    });
    expect(await copy.mock.calls[0]?.[0]).toBe("1;'=cmd\r\n2;Door");
  });

  it('exports only the selection and reports empty for none', async () => {
    const save = vi.fn();
    const some = await exportToXlsx(
      adapterOf(data, { getModelSelection: () => [{ modelId: 'm', dbId: 2 }] }),
      { propertyNames: ['Name'], format: 'csv', scope: 'selected', save },
    );
    expect(some).toMatchObject({ phase: 'done', rowCount: 1 });
    const none = await exportToXlsx(adapterOf(data), {
      propertyNames: ['Name'],
      scope: 'selected',
      save,
    });
    expect(none).toEqual({ phase: 'empty' });
  });

  it('exports only the visible elements', async () => {
    const save = vi.fn();
    const status = await exportToXlsx(
      adapterOf(data, { getVisible: async () => [{ modelId: 'm', dbId: 1 }] }),
      { propertyNames: ['Name'], format: 'csv', scope: 'visible', save },
    );
    expect(status).toMatchObject({ phase: 'done', rowCount: 1 });
  });

  it('exports one model when a model scope is set', async () => {
    const save = vi.fn();
    const rows = [row(1, 'A', 'a'), row(2, 'B', 'b')];
    const models = ['a', 'b'].map((id) => ({
      id,
      urn: id,
      name: id,
      visible: true,
      status: 'ready',
    }));
    const adapter = adapterOf(rows, {
      getModels: () => models,
      getLeafProperties: (_names: string[], ids?: string[]) =>
        Promise.resolve(
          rows.filter((r) => !ids || ids.includes(r.modelId ?? '')),
        ),
    });
    const one = await exportToXlsx(adapter, {
      propertyNames: ['Name'],
      format: 'csv',
      modelScope: 'b',
      save,
    });
    expect(one).toMatchObject({ phase: 'done', rowCount: 1 });
    const stale = await exportToXlsx(adapter, {
      propertyNames: ['Name'],
      format: 'csv',
      modelScope: 'gone',
      save,
    });
    expect(stale).toMatchObject({ phase: 'done', rowCount: 2 });
  });

  it('stops when the large-export confirmation is declined', async () => {
    const save = vi.fn();
    const status = await exportToXlsx(adapterOf(data), {
      propertyNames: ['Name'],
      format: 'csv',
      confirm: () => false,
      save,
    });
    expect(status).toEqual({ phase: 'cancelled' });
    expect(save).not.toHaveBeenCalled();
  });
});

describe('readExcelSettings', () => {
  it('returns the defaults for anything that is not a record', () => {
    expect(readExcelSettings(undefined)).toEqual(DEFAULT_EXCEL_SETTINGS);
    expect(readExcelSettings('x')).toEqual(DEFAULT_EXCEL_SETTINGS);
    expect(readExcelSettings([])).toEqual(DEFAULT_EXCEL_SETTINGS);
  });

  it('keeps valid choices and defaults the rest', () => {
    expect(
      readExcelSettings({
        format: 'csv',
        scope: 'nope',
        metadata: true,
        namePattern: '',
      }),
    ).toEqual({ ...DEFAULT_EXCEL_SETTINGS, format: 'csv', metadata: true });
  });

  it('accepts the visible scope and a model choice', () => {
    expect(
      readExcelSettings({ scope: 'visible', modelScope: 'urn-b' }),
    ).toMatchObject({ scope: 'visible', modelScope: 'urn-b' });
  });

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

describe('exportFileName', () => {
  it('sanitizes the model name and version', () => {
    expect(exportFileName('Tower: Phase/2*.rvt', 'v12')).toBe(
      'Tower-Phase-2-v12-properties.xlsx',
    );
    expect(exportFileName('Café plan.nwd')).toBe('Cafe-plan-properties.xlsx');
  });

  it('falls back without a file name', () => {
    expect(exportFileName()).toBe(DEFAULT_FILE_NAME);
    expect(exportFileName('', 'v2')).toBe(DEFAULT_FILE_NAME);
    expect(exportFileName('***.rvt')).toBe(DEFAULT_FILE_NAME);
  });
});
