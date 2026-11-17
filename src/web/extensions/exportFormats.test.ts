import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { exportToXlsx } from './excelExport.js';
import {
  applyNamePattern,
  filterByScope,
  guardCell,
  toDelimited,
  toJsonRecords,
} from './exportFormats.js';
import { excelFileNameFrom } from './viewerTools.js';

function row(dbId: number, name: string, modelId = 'm'): PropertyRow {
  return { dbId, name, modelId, properties: { Name: name, Category: 'Walls' } };
}

function adapterOf(
  rows: PropertyRow[],
  extra: Record<string, unknown> = {},
): never {
  return {
    getLeafProperties: () => Promise.resolve(rows),
    getModelSelection: () => [],
    ...extra,
  } as never;
}

function savedBlob(save: ReturnType<typeof vi.fn>): Blob {
  return save.mock.calls[0]?.[0] as Blob;
}

describe('guardCell', () => {
  it.each(['=1+1', '+SUM(A1)', '-2+3', '@A1', '\tx'])('prefixes %j', (v) => {
    expect(guardCell(v)).toBe(`'${v}`);
  });

  it('leaves safe text, plain numbers and non-strings alone', () => {
    expect(guardCell('Wall')).toBe('Wall');
    expect(guardCell('-5.5')).toBe('-5.5');
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

  it('builds JSON records keyed by header', () => {
    expect(toJsonRecords(['a', 'b'], [[1, 'x']])).toEqual([{ a: 1, b: 'x' }]);
  });
});

describe('scope and file name', () => {
  const rows = [row(1, 'a'), row(2, 'b'), row(1, 'c', 'n')];

  it('keeps all rows or only the listed model elements', () => {
    expect(filterByScope(rows, 'all', [])).toHaveLength(3);
    expect(
      filterByScope(rows, 'selected', [
        { modelId: 'm', dbId: 2 },
        { modelId: 'n', dbId: 1 },
      ]).map((r) => r.name),
    ).toEqual(['b', 'c']);
    expect(filterByScope(rows, 'isolated', [])).toEqual([]);
  });

  it('fills the pattern and sanitises the result', () => {
    const date = new Date('2026-11-17T10:00:00Z');
    expect(applyNamePattern('{model}_{date}', 'House 1', 'csv', date)).toBe(
      'House-1_2026-11-17.csv',
    );
    expect(applyNamePattern(' ', 'x', 'json')).toMatch(/^x-properties\.json$/);
    expect(
      excelFileNameFrom('House-v2-properties.xlsx', {
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

  it('copies TSV to the clipboard hook', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    const status = await exportToXlsx(adapterOf(data), {
      propertyNames: ['Name'],
      format: 'copy',
      copy,
      save: vi.fn(),
    });
    expect(copy).toHaveBeenCalledWith("dbId\tName\r\n1\t'=cmd\r\n2\tDoor");
    expect(status).toMatchObject({ phase: 'done', rowCount: 2 });
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
