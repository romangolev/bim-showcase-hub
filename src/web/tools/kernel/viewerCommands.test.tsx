import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS } from '../../commands/registry.js';
import { installMemoryStorage } from '../../test/mockApi.js';
import type { ViewerAdapter } from '../../viewer/ViewerAdapter.js';
import { ActiveViewerContext } from '../../viewer/ViewerContext.js';
import { exportEntry } from './exportKit.js';
import { persistedSetting } from './persistedSetting.js';
import { ToolRegistry } from './ToolRegistry.js';
import { useViewerTools } from './useViewerTools.js';
import {
  readEnabled,
  type ToolContext,
  type ToolContribution,
  type ToolSettings,
  ViewerTool,
} from './ViewerTool.js';

class ExportingTool extends ViewerTool<ToolSettings> {
  readonly id = 'demo';
  readonly title = 'Demo export';
  readonly description = 'demo';
  readonly exportTitle = 'Export demo';
  readonly settings = persistedSetting<ToolSettings>(
    'test.demo',
    { enabled: true },
    (raw) => ({ enabled: readEnabled(raw) }),
  );
  readonly started = vi.fn();

  contribute(ctx: ToolContext): ToolContribution {
    return {
      exports: [
        exportEntry(
          ctx,
          this.id,
          { id: 'export-demo', icon: 'x', tooltip: 'Export demo' },
          async () => this.started(),
        ),
      ],
    };
  }
}

function fakeAdapter() {
  return {
    registerToolGroup: vi.fn(() => () => undefined),
    getModelSelection: vi.fn(() => [{ modelId: 'm', dbId: 1 }]),
    isolateModelIds: vi.fn(),
    showAll: vi.fn(),
  } as unknown as ViewerAdapter;
}

function wrapperFor(adapter: ViewerAdapter | null) {
  return ({ children }: { children: ReactNode }) => (
    <ActiveViewerContext.Provider
      value={{
        adapter,
        activeKey: 'k',
        publish: () => undefined,
        withdraw: () => undefined,
      }}
    >
      {children}
    </ActiveViewerContext.Provider>
  );
}

const options = {
  active: true,
  suffix: 'k',
  fileName: () => '',
  report: vi.fn(),
};

beforeEach(() => {
  installMemoryStorage();
  COMMANDS.register('viewer:k', () => []);
});

describe('viewer command contribution', () => {
  it('registers live export and adapter commands while the viewer is active', () => {
    const adapter = fakeAdapter();
    const tool = new ExportingTool();
    const registry = new ToolRegistry().register(tool);
    const { unmount } = renderHook(
      () => useViewerTools(registry, { ...options, adapter }),
      { wrapper: wrapperFor(adapter) },
    );
    const list = COMMANDS.list();
    const exportCommand = list.find((c) => c.id === 'demo.export');
    expect(exportCommand?.disabled).toBeUndefined();
    void exportCommand?.run({ openModal: () => undefined });
    expect(tool.started).toHaveBeenCalledOnce();
    list
      .find((c) => c.id === 'viewer.isolate')
      ?.run({
        openModal: () => undefined,
      });
    expect(adapter.isolateModelIds).toHaveBeenCalledWith([
      { modelId: 'm', dbId: 1 },
    ]);
    unmount();
    expect(COMMANDS.list()).toHaveLength(0);
  });

  it('contributes nothing for a viewer that is not the active one', () => {
    const adapter = fakeAdapter();
    const registry = new ToolRegistry().register(new ExportingTool());
    renderHook(() => useViewerTools(registry, { ...options, adapter }), {
      wrapper: wrapperFor(fakeAdapter()),
    });
    expect(COMMANDS.list()).toHaveLength(0);
  });
});
