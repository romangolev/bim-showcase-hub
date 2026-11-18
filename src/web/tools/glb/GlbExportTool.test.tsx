import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasks } from '../../tasks/taskStore.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import type { ToolContext } from '../kernel/ViewerTool.js';

const last = () => tasks.getSnapshot().tasks.at(-1);
const exportGeometryToGlb = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('../../extensions/glbExport.js', async (original) => ({
  ...(await original<typeof import('../../extensions/glbExport.js')>()),
  exportGeometryToGlb,
}));

const { GLB_SETTINGS, GLB_SETTINGS_KEY, GlbExportTool, glbFileNameFrom } =
  await import('./GlbExportTool.js');
const { exportFileName } = await import('../../extensions/excelExport.js');

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  exportGeometryToGlb.mockClear();
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

describe('GLB settings', () => {
  it('defaults to enabled and keeps only a real boolean', () => {
    expect(GLB_SETTINGS.sanitize(undefined)).toEqual({ enabled: true });
    expect(GLB_SETTINGS.sanitize({ enabled: false })).toEqual({
      enabled: false,
    });
    expect(GLB_SETTINGS.sanitize({ enabled: 'no' })).toEqual({ enabled: true });
    expect(GLB_SETTINGS.sanitize('junk')).toEqual({ enabled: true });
  });
});

describe('GlbExportTool', () => {
  const tool = new GlbExportTool();

  it('describes the tool and its key', () => {
    expect(tool.id).toBe('glb');
    expect(tool.title).toBe('Geometry export');
    expect(tool.settings.key).toBe(GLB_SETTINGS_KEY);
  });

  it('contributes one export and no paint', () => {
    const keyed = tool.contribute(context({ id: (base) => `${base}-k` }));
    expect(keyed.paint).toBeUndefined();
    expect(keyed.exports).toMatchObject([
      { id: 'export-glb-k', icon: 'bsh-ico-glb' },
    ]);
  });

  it('exports geometry under the model name and version', () => {
    const { exports } = tool.contribute(
      context({
        fileName: () => exportFileName('Snowdon Towers Sample.rvt', 'v3'),
      }),
    );
    exports?.[0]?.onExport();
    expect(exportGeometryToGlb).toHaveBeenCalledWith(
      adapter,
      expect.objectContaining({
        fileName: 'Snowdon-Towers-Sample-v3-geometry.glb',
      }),
    );
  });

  it('reports status to the task center with warnings and no cancel', () => {
    tool.contribute(context()).exports?.[0]?.onExport();
    const call = exportGeometryToGlb.mock.calls.at(-1)?.[1] as {
      onStatus: (status: unknown) => void;
    };
    call.onStatus({ phase: 'building' });
    expect(last()).toMatchObject({
      label: 'Exporting geometry (GLB)',
      state: 'running',
      detail: 'Building GLB',
      cancellable: false,
    });
    call.onStatus({
      phase: 'done',
      fileName: 'a.glb',
      triangleCount: 10,
      meshCount: 2,
      byteLength: 1,
      skipped: 3,
    });
    expect(last()?.state).toBe('warning');
    expect(last()?.detail).toContain('3 fragments skipped');
    tool
      .contribute(context({ adapter: {} as ViewerAdapter }))
      .exports?.[0]?.onExport();
    const next = exportGeometryToGlb.mock.calls.at(-1)?.[1] as {
      onStatus: (status: unknown) => void;
    };
    next.onStatus({ phase: 'error', message: 'Export failed: x' });
    expect(last()).toMatchObject({
      state: 'failed',
      detail: 'Export failed: x',
    });
  });

  it('keeps the busy state when the toolbar is rebuilt', async () => {
    let finish: () => void = () => undefined;
    exportGeometryToGlb.mockImplementationOnce(
      () =>
        new Promise<undefined>((resolve) => {
          finish = () => resolve(undefined);
        }),
    );
    const own = {} as ViewerAdapter;
    const first = tool.contribute(context({ adapter: own }));
    first.exports?.[0]?.onExport();
    tool.contribute(context({ adapter: own })).exports?.[0]?.onExport();
    expect(exportGeometryToGlb).toHaveBeenCalledTimes(1);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    tool.contribute(context({ adapter: own })).exports?.[0]?.onExport();
    expect(exportGeometryToGlb).toHaveBeenCalledTimes(2);
  });
});

describe('glbFileNameFrom', () => {
  it('replaces the properties suffix with a geometry suffix', () => {
    expect(glbFileNameFrom('Tower-v2-properties.xlsx')).toBe(
      'Tower-v2-geometry.glb',
    );
    expect(glbFileNameFrom('Tower.glb')).toBe('Tower-geometry.glb');
    expect(glbFileNameFrom('Tower')).toBe('Tower-geometry.glb');
  });

  it('falls back without a file name', () => {
    expect(glbFileNameFrom()).toBe('model-geometry.glb');
    expect(glbFileNameFrom('   ')).toBe('model-geometry.glb');
  });
});

describe('Geometry settings window', () => {
  it('holds only the enable switch and persists it', () => {
    render(new GlbExportTool().renderSettings());
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    fireEvent.click(screen.getByRole('switch', { name: 'Geometry export' }));
    expect(
      JSON.parse(window.localStorage.getItem(GLB_SETTINGS_KEY) ?? '{}'),
    ).toEqual({ enabled: false });
  });
});
