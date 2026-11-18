import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasks } from '../../tasks/taskStore.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import type { ToolContext } from '../kernel/ViewerTool.js';

const last = () => tasks.getSnapshot().tasks.at(-1);
const exportToXlsx = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('../../extensions/excelExport.js', async (original) => ({
  ...(await original<typeof import('../../extensions/excelExport.js')>()),
  exportToXlsx,
}));

const { ExcelExportTool, excelFileNameFrom } = await import(
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

  it('reports export status to the task center', () => {
    const { exports } = tool.contribute(context());
    exports?.[0]?.onExport();
    const call = exportToXlsx.mock.calls.at(-1)?.[1] as {
      onStatus: (status: unknown) => void;
      onProgress: (fraction: number) => void;
    };
    call.onStatus({ phase: 'reading' });
    call.onProgress(0.5);
    expect(last()).toMatchObject({
      label: 'Exporting Excel',
      state: 'running',
      progress: 0.5,
      detail: 'Reading element properties',
      cancellable: true,
    });
    call.onStatus({
      phase: 'done',
      fileName: 'a.xlsx',
      rowCount: 1234,
      missing: ['Annex.rvt'],
    });
    expect(last()).toMatchObject({ state: 'warning' });
    expect(last()?.detail).toContain('Exported 1234 elements to a.xlsx');
    expect(last()?.detail).toContain('Missing Annex.rvt');
  });

  it('aborts the read when the task is cancelled', () => {
    const { exports } = tool.contribute(context());
    exports?.[0]?.onExport();
    const call = exportToXlsx.mock.calls.at(-1)?.[1] as { signal: AbortSignal };
    expect(call.signal.aborted).toBe(false);
    const task = last();
    if (task) tasks.cancel(task.id);
    expect(call.signal.aborted).toBe(true);
    expect(last()?.state).toBe('cancelled');
  });

  it('fails the task and retries a failed export', async () => {
    exportToXlsx.mockImplementationOnce(() => Promise.reject(new Error('x')));
    const own = {} as ViewerAdapter;
    tool.contribute(context({ adapter: own })).exports?.[0]?.onExport();
    await vi.waitFor(() => expect(last()?.state).toBe('failed'));
    const calls = exportToXlsx.mock.calls.length;
    const task = last();
    if (task) tasks.retry(task.id);
    expect(exportToXlsx.mock.calls.length).toBe(calls + 1);
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
