import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../../test/mockApi.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import type { ToolBadge, ToolContext } from '../kernel/ViewerTool.js';

const exportToXlsx = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('../../extensions/excelExport.js', async (original) => ({
  ...(await original<typeof import('../../extensions/excelExport.js')>()),
  exportToXlsx,
}));

const { ExcelExportTool, excelFileNameFrom, excelBadge } = await import(
  './ExcelExportTool.js'
);
const {
  DEFAULT_EXCEL_TOOL_SETTINGS,
  EXCEL_SETTINGS_KEY,
  readExcelToolSettings,
} = await import('./excelSettings.js');
const { exportFileName } = await import('../../extensions/excelExport.js');

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  exportToXlsx.mockClear();
});

const adapter = {} as ViewerAdapter;

function context(
  overrides: Partial<ToolContext> & { suffix?: string } = {},
): ToolContext {
  const { suffix, ...rest } = overrides;
  return {
    adapter,
    id: (base) => (suffix ? `${base}-${suffix}` : base),
    fileName: () => '',
    current: (tool) => tool.settings.initial,
    report: () => undefined,
    ...rest,
  };
}

function stored() {
  return JSON.parse(window.localStorage.getItem(EXCEL_SETTINGS_KEY) ?? '{}');
}

describe('readExcelToolSettings', () => {
  it('defaults to enabled with the default table options', () => {
    expect(readExcelToolSettings(undefined)).toEqual(
      DEFAULT_EXCEL_TOOL_SETTINGS,
    );
  });

  it('keeps valid values and the enabled flag, and falls back on bad ones', () => {
    expect(
      readExcelToolSettings({ enabled: false, format: 'csv', scope: 'nope' }),
    ).toMatchObject({ enabled: false, format: 'csv', scope: 'all' });
  });
});

describe('ExcelExportTool', () => {
  const tool = new ExcelExportTool();

  it('contributes one export with a stable id and the viewer suffix', () => {
    expect(tool.contribute(context())).toMatchObject({
      exports: [{ id: 'export-xlsx', icon: 'bsh-ico-export' }],
    });
    const keyed = tool.contribute(context({ suffix: 'k' }));
    expect(keyed.exports?.[0]?.id).toBe('export-xlsx-k');
    expect(keyed.paint).toBeUndefined();
  });

  it('exports under the model name and version with the live settings', () => {
    const live = { ...DEFAULT_EXCEL_TOOL_SETTINGS, format: 'csv' as const };
    const { exports } = tool.contribute(
      context({
        fileName: () => exportFileName('Snowdon Towers Sample.rvt', 'v3'),
        current: () => live as never,
      }),
    );
    exports?.[0]?.onExport();
    expect(exportToXlsx).toHaveBeenCalledWith(
      adapter,
      expect.objectContaining({
        fileName: 'Snowdon-Towers-Sample-v3-properties.csv',
        format: 'csv',
      }),
    );
  });

  it('reports export status as a badge', () => {
    const report = vi.fn();
    const { exports } = tool.contribute(context({ report }));
    exports?.[0]?.onExport();
    const call = exportToXlsx.mock.calls[0]?.[1] as {
      onStatus: (status: unknown) => void;
    };
    call.onStatus({ phase: 'reading' });
    call.onStatus({ phase: 'done', fileName: 'a.xlsx', rowCount: 1234 });
    expect(
      report.mock.calls.map(([badge, busy]) => [badge.text, busy]),
    ).toEqual([
      ['Reading element properties', true],
      ['Exported 1,234 rows', false],
    ]);
  });

  it('does not start a second export while one runs', () => {
    exportToXlsx.mockImplementationOnce(() => new Promise(() => undefined));
    const own = {} as ViewerAdapter;
    const first = tool.contribute(context({ adapter: own }));
    first.exports?.[0]?.onExport();
    const second = tool.contribute(context({ adapter: own }));
    second.exports?.[0]?.onExport();
    expect(exportToXlsx).toHaveBeenCalledTimes(1);
  });

  it('reads the fields of the old combined settings', () => {
    expect(tool.legacy.fields).toEqual(['excelExport', 'excel']);
    expect(
      readExcelToolSettings(
        tool.legacy.read({ excelExport: false, excel: { format: 'json' } }),
      ),
    ).toMatchObject({ enabled: false, format: 'json' });
    expect(readExcelToolSettings(tool.legacy.read({ excel: 'junk' }))).toEqual(
      DEFAULT_EXCEL_TOOL_SETTINGS,
    );
  });
});

describe('excelBadge', () => {
  it('flags errors and missing models', () => {
    const bad: ToolBadge = excelBadge({ phase: 'error', message: 'x' });
    expect(bad).toMatchObject({ text: 'Export failed', error: true });
    expect(
      excelBadge({ phase: 'done', fileName: 'a', rowCount: 1, missing: ['M'] })
        .error,
    ).toBe(true);
    expect(
      excelBadge({ phase: 'done', fileName: 'a', rowCount: 1 }).error,
    ).toBe(false);
  });
});

describe('excelFileNameFrom', () => {
  it('uses the pattern and the chosen format extension', () => {
    expect(
      excelFileNameFrom('House-v2-properties.xlsx', {
        ...DEFAULT_EXCEL_TOOL_SETTINGS,
        format: 'copy',
      }),
    ).toBe('House-v2-properties.xlsx');
  });
});

describe('Excel settings window', () => {
  const renderWindow = () => render(new ExcelExportTool().renderSettings());

  it('has the enable switch and persists the format', () => {
    renderWindow();
    fireEvent.change(screen.getByLabelText('Format'), {
      target: { value: 'csv' },
    });
    expect(stored().format).toBe('csv');
    fireEvent.click(screen.getByRole('switch', { name: 'Excel export' }));
    expect(stored().enabled).toBe(false);
  });

  it('persists the file name pattern and a checkbox', () => {
    renderWindow();
    fireEvent.change(screen.getByLabelText('File name pattern'), {
      target: { value: '{model}-x' },
    });
    fireEvent.click(
      screen.getByLabelText(/Add a Summary sheet to the Excel file/),
    );
    expect(stored()).toMatchObject({
      namePattern: '{model}-x',
      summarySheet: true,
    });
  });
});
