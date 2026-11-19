import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import {
  buildExportSheets,
  exportToXlsx,
  totalsRow,
  xlsxCell,
  xlsxSheet,
} from './excelExport.js';

const written: unknown[] = [];

vi.mock('write-excel-file/browser', () => ({
  default: (sheets: unknown) => {
    written.push(sheets);
    return { toBlob: () => Promise.resolve(new Blob(['x'])) };
  },
}));

function row(
  dbId: number,
  properties: Record<string, string | number>,
  modelId = 'm',
): PropertyRow {
  return { dbId, name: String(dbId), modelId, properties };
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

async function textOf(blob: Blob): Promise<string> {
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(
    await blob.arrayBuffer(),
  );
}

describe('totalsRow', () => {
  const header = ['dbId', 'Name', 'Area', 'Level'];
  const rows = [
    [1, 'Wall', '12.5', 'L1'],
    [2, 'Door', '7.5', 'L1'],
    [3, 'Window', '', 'L1'],
  ];

  it('sums numeric columns and counts text columns', () => {
    expect(totalsRow(header, rows)).toEqual([
      'Total (3)',
      '3 values',
      20,
      '3 values',
    ]);
  });

  it('labels the row and leaves the id column blank', () => {
    expect(
      totalsRow(
        ['Model', 'dbId', 'Qty'],
        [
          ['A', 1, 4],
          ['B', 2, 6],
        ],
      ),
    ).toEqual(['Total (2)', '', 10]);
  });

  it('leaves empty columns blank and returns null without rows', () => {
    expect(totalsRow(['dbId', 'Empty'], [[1, '']])).toEqual(['Total (1)', '']);
    expect(totalsRow(['dbId'], [])).toBeNull();
  });

  it('keeps codes with leading zeros as text and counts them', () => {
    expect(totalsRow(['dbId', 'Code'], [[1, '0012']])).toEqual([
      'Total (1)',
      '1 value',
    ]);
  });

  it('leaves identifier columns blank instead of summing them', () => {
    expect(
      totalsRow(
        ['dbId', 'Type Id', 'Workset ID', 'Area'],
        [
          [1, '123456', '7', '10'],
          [2, '123457', '8', '20'],
        ],
      ),
    ).toEqual(['Total (2)', '', '', 30]);
  });
});

describe('xlsxCell', () => {
  it('writes plain numbers and numeric text as numbers with a format', () => {
    expect(xlsxCell('12.5')).toEqual({
      value: 12.5,
      type: Number,
      format: '#,##0.00',
    });
    expect(xlsxCell(42)).toEqual({
      value: 42,
      type: Number,
      format: '#,##0',
    });
  });

  it('leaves text, guarded values and codes alone', () => {
    expect(xlsxCell('Wall')).toBe('Wall');
    expect(xlsxCell('0012')).toBe('0012');
    expect(xlsxCell("'=SUM(A1)")).toBe("'=SUM(A1)");
    expect(xlsxCell(true)).toBe(true);
  });

  it('marks a bold cell', () => {
    expect(xlsxCell('Name', true)).toEqual({
      value: 'Name',
      fontWeight: 'bold',
    });
    expect(xlsxCell(3, true)).toMatchObject({ value: 3, fontWeight: 'bold' });
  });

  it('writes an identifier cell as text', () => {
    expect(xlsxCell('123456', false, true)).toBe('123456');
    expect(xlsxCell(123456, false, true)).toBe('123456');
  });
});

describe('xlsxSheet', () => {
  it('adds a bold header, formatted cells and a bold totals row', () => {
    const [sheet] = buildExportSheets(
      [row(1, { Category: 'Walls', Name: 'Wall', Area: '10' })],
      ['Name', 'Area'],
      null,
    );
    if (!sheet) throw new Error('no sheet');
    const built = xlsxSheet(sheet);
    expect(built).toMatchObject({ sheet: 'Elements', stickyRowsCount: 1 });
    expect(built.data[0]?.[0]).toEqual({ value: 'dbId', fontWeight: 'bold' });
    expect(built.data[1]?.[2]).toEqual({
      value: 10,
      type: Number,
      format: '#,##0',
    });
    expect(built.data.at(-1)?.[0]).toEqual({
      value: 'Total (1)',
      fontWeight: 'bold',
    });
  });

  it('keeps an identifier column as text in the sheet', () => {
    const [sheet] = buildExportSheets(
      [row(1, { 'Type Id': '11001', Area: '10' })],
      ['Type Id', 'Area'],
      null,
    );
    if (!sheet) throw new Error('no sheet');
    const built = xlsxSheet(sheet);
    expect(built.data[1]?.[1]).toBe('11001');
    expect(built.data[1]?.[2]).toMatchObject({ value: 10, type: Number });
    expect(built.data.at(-1)?.[1]).toEqual({
      value: '',
      fontWeight: 'bold',
    });
  });
});

describe('exportToXlsx and the totals row', () => {
  it('writes the totals row and keeps it out of the row count', async () => {
    const status = await exportToXlsx(
      adapterOf([
        row(1, { Name: 'Wall', Area: '10', Level: 'L1' }),
        row(2, { Name: 'Door', Area: '20.5', Level: 'L1' }),
      ]),
      {
        propertyNames: ['Name', 'Area', 'Level'],
        groupBy: null,
        format: 'xlsx',
        fileName: 'a.xlsx',
        save: () => undefined,
      },
    );
    expect(status).toMatchObject({ phase: 'done', rowCount: 2 });
    const sheets = written.at(-1) as Array<{ data: unknown[][] }>;
    expect(sheets[0]?.data.at(-1)).toEqual([
      { value: 'Total (2)', fontWeight: 'bold' },
      { value: '2 values', fontWeight: 'bold' },
      { value: 30.5, type: Number, format: '#,##0.00', fontWeight: 'bold' },
      { value: '2 values', fontWeight: 'bold' },
    ]);
  });

  it('writes a totals row on every grouped sheet', async () => {
    const status = await exportToXlsx(
      adapterOf([
        row(1, { Category: 'Walls', Name: 'Wall', Area: '10' }),
        row(2, { Category: 'Walls', Name: 'Door', Area: '15' }),
        row(3, { Category: 'Floors', Name: 'Slab', Area: '5' }),
      ]),
      {
        propertyNames: ['Category', 'Name', 'Area'],
        groupBy: 'Category',
        format: 'xlsx',
        fileName: 'a.xlsx',
        save: () => undefined,
      },
    );
    expect(status).toMatchObject({ phase: 'done', rowCount: 3 });
    const sheets = written.at(-1) as Array<{
      sheet: string;
      data: unknown[][];
    }>;
    expect(sheets.map((sheet) => sheet.sheet)).toEqual(['Walls', 'Floors']);
    expect(sheets[0]?.data.at(-1)?.[0]).toEqual({
      value: 'Total (2)',
      fontWeight: 'bold',
    });
    expect(sheets[0]?.data.at(-1)?.[3]).toMatchObject({ value: 25 });
    expect(sheets[1]?.data.at(-1)?.[0]).toEqual({
      value: 'Total (1)',
      fontWeight: 'bold',
    });
  });

  it('keeps an identifier column as text and out of the totals', async () => {
    await exportToXlsx(
      adapterOf([
        row(1, { Name: 'Wall', 'Type Id': '11001' }),
        row(2, { Name: 'Door', 'Type Id': '11002' }),
      ]),
      {
        propertyNames: ['Name', 'Type Id'],
        groupBy: null,
        format: 'xlsx',
        fileName: 'a.xlsx',
        save: () => undefined,
      },
    );
    const sheets = written.at(-1) as Array<{ data: unknown[][] }>;
    expect(sheets[0]?.data[1]?.[2]).toBe('11001');
    expect(sheets[0]?.data.at(-1)).toEqual([
      { value: 'Total (2)', fontWeight: 'bold' },
      { value: '2 values', fontWeight: 'bold' },
      { value: '', fontWeight: 'bold' },
    ]);
  });

  it('leaves the totals row out of CSV', async () => {
    const saved: Blob[] = [];
    const status = await exportToXlsx(
      adapterOf([
        row(1, { Name: 'Wall', Area: '10' }),
        row(2, { Name: 'Door', Area: '20.5' }),
      ]),
      {
        propertyNames: ['Name', 'Area'],
        groupBy: null,
        format: 'csv',
        fileName: 'a.csv',
        save: (blob) => {
          saved.push(blob);
        },
      },
    );
    expect(status).toMatchObject({ phase: 'done', rowCount: 2 });
    const text = await textOf(saved[0] as Blob);
    expect(text).toContain('dbId,Name,Area');
    expect(text).toContain('1,Wall,10');
    expect(text).not.toContain('Total');
  });
});
