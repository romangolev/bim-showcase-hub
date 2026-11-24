import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasks } from '../../tasks/taskStore.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import type { ToolContext } from '../kernel/ViewerTool.js';

const last = () => tasks.getSnapshot().tasks.at(-1);
const exportToIfc = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('../../extensions/ifcExport.js', async (original) => ({
  ...(await original<typeof import('../../extensions/ifcExport.js')>()),
  exportToIfc,
}));

const { IfcExportTool, ifcFileNameFrom } = await import('./IfcExportTool.js');
const { DEFAULT_IFC_TOOL_SETTINGS, IFC_SETTINGS_KEY, readIfcToolSettings } =
  await import('./ifcSettings.js');
const { DEFAULT_FILE_NAME } = await import('../../extensions/excelExport.js');
const { exportFileName, exportStem } = await import('../kernel/exportKit.js');

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  exportToIfc.mockClear();
});

const adapter = {} as ViewerAdapter;

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    adapter,
    id: (base) => base,
    fileName: () => '',
    current: (tool) => tool.settings.initial,
    ...overrides,
  };
}

function stored() {
  return JSON.parse(window.localStorage.getItem(IFC_SETTINGS_KEY) ?? '{}');
}

describe('readIfcToolSettings', () => {
  it('defaults to enabled with the default IFC options', () => {
    expect(readIfcToolSettings(undefined)).toEqual(DEFAULT_IFC_TOOL_SETTINGS);
    expect(readIfcToolSettings('junk')).toEqual(DEFAULT_IFC_TOOL_SETTINGS);
  });

  it('validates the IFC fields one by one and keeps the enabled flag', () => {
    expect(
      readIfcToolSettings({
        enabled: false,
        projectName: '  Tower ',
        siteName: '   ',
        lengthUnit: 'mm',
        psetExclude: ['A', 3, ' '],
        classOverrides: { Walls: 'IfcWall', Doors: 'Nope' },
      }),
    ).toMatchObject({
      enabled: false,
      projectName: 'Tower',
      siteName: 'Site',
      lengthUnit: 'mm',
      psetExclude: ['A'],
      classOverrides: { Walls: 'IfcWall' },
    });
  });
});

describe('IfcExportTool', () => {
  const tool = new IfcExportTool();

  it('contributes one export with the viewer suffix and no paint', () => {
    const keyed = tool.contribute(context({ id: (base) => `${base}-k` }));
    expect(keyed.paint).toBeUndefined();
    expect(keyed.exports).toMatchObject([
      { id: 'export-ifc-k', icon: 'bsh-ico-ifc' },
    ]);
  });

  it('exports under the model name and the live settings getter', () => {
    const live = { ...DEFAULT_IFC_TOOL_SETTINGS, projectName: 'Live' };
    tool
      .contribute(
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
      )
      .exports?.[0]?.onExport();
    const options = exportToIfc.mock.calls[0]?.[1] as {
      fileName: string;
      settings: () => unknown;
    };
    expect(options.fileName).toBe('Snowdon-Towers-Sample-v3.ifc');
    expect(options.settings()).toBe(live);
  });

  it('releases the export when starting it throws', () => {
    const own = {} as ViewerAdapter;
    const throwing = tool.contribute(
      context({
        adapter: own,
        fileName: () => {
          throw new Error('boom');
        },
      }),
    );
    expect(() => throwing.exports?.[0]?.onExport()).not.toThrow();
    tool.contribute(context({ adapter: own })).exports?.[0]?.onExport();
    expect(exportToIfc).toHaveBeenCalledTimes(1);
  });

  it('leaves no unhandled rejection and can run again', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    exportToIfc.mockImplementationOnce(() => Promise.reject(new Error('boom')));
    const own = {} as ViewerAdapter;
    tool.contribute(context({ adapter: own })).exports?.[0]?.onExport();
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    tool.contribute(context({ adapter: own })).exports?.[0]?.onExport();
    expect(exportToIfc).toHaveBeenCalledTimes(2);
  });

  it('blanks the author and organisation on sign-out and keeps the rest', () => {
    expect(
      tool.scrub({
        ...DEFAULT_IFC_TOOL_SETTINGS,
        author: 'Ann',
        organisation: 'Org',
        projectName: 'Keep',
        enabled: false,
      }),
    ).toMatchObject({
      author: '',
      organisation: '',
      projectName: 'Keep',
      enabled: false,
    });
  });
});

describe('export task', () => {
  it('reports progress, warnings and failure without a cancel button', () => {
    new IfcExportTool()
      .contribute(context({ adapter: {} as ViewerAdapter }))
      .exports?.[0]?.onExport();
    const call = exportToIfc.mock.calls.at(-1)?.[1] as {
      onStatus: (status: unknown) => void;
    };
    call.onStatus({ phase: 'reading' });
    expect(last()).toMatchObject({
      label: 'Exporting IFC',
      state: 'running',
      detail: 'Reading model',
      cancellable: false,
    });
    call.onStatus({
      phase: 'done',
      fileName: 'a.ifc',
      elementCount: 5,
      triangleCount: 9,
      byteLength: 1,
      levelsUnavailable: 1,
    });
    expect(last()?.state).toBe('warning');
    expect(last()?.detail).toContain('levels unavailable');
    new IfcExportTool()
      .contribute(context({ adapter: {} as ViewerAdapter }))
      .exports?.[0]?.onExport();
    const next = exportToIfc.mock.calls.at(-1)?.[1] as {
      onStatus: (status: unknown) => void;
    };
    next.onStatus({ phase: 'error', message: 'Export failed: x' });
    expect(last()).toMatchObject({ state: 'failed' });
  });
});

describe('export menu', () => {
  it('offers export, batch and settings in a dropdown and keeps palette export', () => {
    const openModal = vi.fn();
    const tool = new IfcExportTool();
    const ctx = context({ adapter: {} as ViewerAdapter, openModal });
    const menu = tool.contribute(ctx).exports?.[0]?.menu ?? [];
    expect(menu.map((item) => item.icon)).toEqual([
      'bsh-ico-ifc',
      'bsh-ico-ifc-batch',
      'bsh-ico-settings',
    ]);
    menu[1]?.run();
    menu[2]?.run();
    expect(openModal.mock.calls).toEqual([
      ['tool-ifc-batch'],
      ['tool-ifc-settings'],
    ]);
    expect(exportToIfc).not.toHaveBeenCalled();
    menu[0]?.run();
    expect(exportToIfc).toHaveBeenCalledTimes(1);
    const paletteCtx = context({ adapter: {} as ViewerAdapter, openModal });
    const palette = tool
      .commands(paletteCtx, tool.settings.initial)
      .find((command) => command.id === 'ifc.export');
    palette?.run({} as never);
    expect(exportToIfc).toHaveBeenCalledTimes(2);
  });

  it('has a plain export button without a modal host', () => {
    const spec = new IfcExportTool().contribute(context({})).exports?.[0];
    expect(spec?.menu).toBeUndefined();
  });

  it('registers the settings and batch modals', () => {
    expect(new IfcExportTool().modals().map((modal) => modal.id)).toEqual([
      'tool-ifc-settings',
      'tool-ifc-batch',
    ]);
  });
});

describe('ifcFileNameFrom', () => {
  it('swaps the extension and drops the properties suffix', () => {
    expect(ifcFileNameFrom('Tower-v2-properties.xlsx')).toBe('Tower-v2.ifc');
    expect(ifcFileNameFrom('Tower.ifc')).toBe('Tower.ifc');
  });

  it('falls back without a file name', () => {
    expect(ifcFileNameFrom('')).toBe('model.ifc');
    expect(ifcFileNameFrom()).toBe('model.ifc');
  });
});

describe('IFC settings window', () => {
  const renderWindow = () => render(new IfcExportTool().renderSettings());

  it('has the enable switch', () => {
    renderWindow();
    fireEvent.click(screen.getByRole('switch', { name: 'IFC export' }));
    expect(stored().enabled).toBe(false);
  });

  it('edits a text field and persists it', () => {
    renderWindow();
    fireEvent.change(screen.getByLabelText('Project name'), {
      target: { value: 'Tower' },
    });
    expect(stored().projectName).toBe('Tower');
  });

  it('changes the length unit', () => {
    renderWindow();
    fireEvent.change(screen.getByLabelText('Length unit'), {
      target: { value: 'mm' },
    });
    expect(stored().lengthUnit).toBe('mm');
  });

  it('commits a group list on blur and keeps commas while typing', () => {
    renderWindow();
    const field = screen.getByLabelText('Exclude property groups');
    fireEvent.change(field, { target: { value: 'Dimensions, ' } });
    expect(field).toHaveValue('Dimensions, ');
    fireEvent.blur(field);
    expect(stored().psetExclude).toEqual(['Dimensions']);
  });

  it('adds and removes a class override', () => {
    renderWindow();
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Revit Walls' },
    });
    fireEvent.change(screen.getByLabelText('IFC class'), {
      target: { value: 'IfcCovering' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add override' }));
    expect(screen.getByText('Revit Walls')).toBeInTheDocument();
    expect(stored().classOverrides).toEqual({ 'Revit Walls': 'IfcCovering' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Revit Walls' }));
    expect(screen.queryByText('Revit Walls')).toBeNull();
  });

  it('ignores an empty category when adding', () => {
    renderWindow();
    fireEvent.click(screen.getByRole('button', { name: 'Add override' }));
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(stored().classOverrides ?? {}).toEqual({});
  });
});
