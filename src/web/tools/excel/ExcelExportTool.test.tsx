import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasks } from '../../tasks/taskStore.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import { listSets, saveSelectionSet } from '../../viewer/selectionSets.js';
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
const { DEFAULT_EXPORT_PROPERTIES, DEFAULT_FILE_NAME } = await import(
  '../../extensions/excelExport.js'
);
const { exportFileName, exportStem } = await import('../kernel/exportKit.js');

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

  it('keeps the chosen columns', () => {
    expect(
      readExcelToolSettings({ properties: ['Name', 'Level'] }).properties,
    ).toEqual(['Name', 'Level']);
  });
});

describe('set scope in the settings', () => {
  it('keeps a well-formed set scope and rejects a malformed one', () => {
    expect(readExcelToolSettings({ scope: 'set:ss-1' }).scope).toBe('set:ss-1');
    expect(readExcelToolSettings({ scope: 'set:' }).scope).toBe('all');
  });

  it('keeps scope and model choice on disk and resets set and model on scrub', () => {
    const tool = new ExcelExportTool();
    const settings = {
      ...DEFAULT_EXCEL_TOOL_SETTINGS,
      scope: 'set:ss-1' as const,
      modelScope: 'urn-a',
    };
    expect(tool.scrub(settings)).toMatchObject({
      scope: 'all',
      modelScope: 'all',
    });
    expect(tool.scrub({ ...settings, scope: 'selected' as const }).scope).toBe(
      'selected',
    );
  });

  it('resets the chosen columns on scrub', () => {
    const settings = {
      ...DEFAULT_EXCEL_TOOL_SETTINGS,
      modelScope: 'urn-a',
      properties: ['Name'],
    };
    expect(new ExcelExportTool().scrub(settings).properties).toEqual(
      DEFAULT_EXPORT_PROPERTIES,
    );
  });

  it('lists saved sets in the Rows select and shows a deleted set', () => {
    saveSelectionSet('Walls', [{ modelId: 'a', dbId: 1 }]);
    const id = listSets()[0]?.id ?? '';
    window.localStorage.setItem(
      EXCEL_SETTINGS_KEY,
      JSON.stringify({ scope: `set:${id}` }),
    );
    render(new ExcelExportTool().renderSettings());
    const rows = screen.getByLabelText('Rows') as HTMLSelectElement;
    expect(rows.value).toBe(`set:${id}`);
    expect([...rows.options].map((option) => option.textContent)).toContain(
      'Set: Walls',
    );
    fireEvent.change(rows, { target: { value: 'selected' } });
    expect(stored().scope).toBe('selected');
  });

  it('shows a deleted set visibly', () => {
    window.localStorage.setItem(
      EXCEL_SETTINGS_KEY,
      JSON.stringify({ scope: 'set:gone' }),
    );
    render(new ExcelExportTool().renderSettings());
    expect(screen.getByLabelText('Rows')).toHaveDisplayValue(
      'Deleted set (using all elements)',
    );
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
        fileName: () =>
          exportFileName(
            exportStem('Snowdon Towers Sample.rvt', 'v3'),
            DEFAULT_FILE_NAME,
            '-properties',
            'xlsx',
          ),
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

  it('exports the stored property columns', () => {
    const live = { ...DEFAULT_EXCEL_TOOL_SETTINGS, properties: ['Name'] };
    const { exports } = tool.contribute(
      context({ current: () => live as never }),
    );
    exports?.[0]?.onExport();
    expect(exportToXlsx).toHaveBeenCalledWith(
      adapter,
      expect.objectContaining({
        propertyNames: ['Name'],
        groupBy: 'Category',
        emptyText: '',
      }),
    );
  });

  it('reports export status to the task center', () => {
    const { exports } = tool.contribute(context());
    exports?.[0]?.onExport();
    const call = exportToXlsx.mock.calls.at(-1)?.[1] as {
      onStatus: (status: unknown) => void;
      onProgress: (progress: {
        phase: string;
        loaded: number;
        total: number;
        partial: boolean;
      }) => void;
    };
    call.onStatus({ phase: 'reading' });
    call.onProgress({
      phase: 'rows',
      loaded: 500,
      total: 1000,
      partial: true,
    });
    expect(last()).toMatchObject({
      label: 'Exporting Excel',
      state: 'running',
      progress: 0.5,
      detail: '500 of 1,000 elements',
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

  it('asks before a big export only when the threshold is passed', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const ask = (confirmAbove: number) => {
      const { exports } = tool.contribute(
        context({
          adapter: {} as ViewerAdapter,
          current: () =>
            ({ ...DEFAULT_EXCEL_TOOL_SETTINGS, confirmAbove }) as never,
        }),
      );
      exports?.[0]?.onExport();
      const call = exportToXlsx.mock.calls.at(-1)?.[1] as {
        confirm?: (rows: number) => boolean;
      };
      call.confirm?.(1500);
    };
    ask(1000);
    expect(confirm).toHaveBeenCalledTimes(1);
    ask(0);
    expect(confirm).toHaveBeenCalledTimes(1);
    confirm.mockRestore();
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

  it('persists the format', () => {
    renderWindow();
    fireEvent.change(screen.getByLabelText('Format'), {
      target: { value: 'csv' },
    });
    expect(stored().format).toBe('csv');
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

  it('persists the group-by column and the empty-cell choice', () => {
    renderWindow();
    fireEvent.change(screen.getByLabelText('Group by'), {
      target: { value: 'Level' },
    });
    fireEvent.change(screen.getByLabelText('Empty cells'), {
      target: { value: '(empty)' },
    });
    expect(stored()).toMatchObject({
      groupBy: 'Level',
      emptyLabel: '(empty)',
    });
    fireEvent.change(screen.getByLabelText('Group by'), {
      target: { value: '' },
    });
    expect(stored().groupBy).toBeNull();
  });

  it('persists the confirmation threshold and 0 for never asking', () => {
    renderWindow();
    const field = screen.getByLabelText('Ask before exporting over rows');
    fireEvent.change(field, { target: { value: '5000' } });
    fireEvent.blur(field);
    expect(stored().confirmAbove).toBe(5000);
    fireEvent.change(field, { target: { value: '0' } });
    fireEvent.blur(field);
    expect(stored().confirmAbove).toBe(0);
  });
});
