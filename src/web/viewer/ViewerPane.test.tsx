import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelSummaryPanel } from '../panels/ModelSummaryPanel.js';
import { tasks } from '../tasks/taskStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import { useTheme } from '../theme/ThemeContext.js';
import { EXCEL_SETTINGS } from '../tools/excel/excelSettings.js';
import { GLB_SETTINGS } from '../tools/glb/GlbExportTool.js';
import { IFC_SETTINGS } from '../tools/ifc/ifcSettings.js';
import {
  type PersistedSetting,
  usePersistedSetting,
} from '../tools/kernel/persistedSetting.js';
import { PAINT_SETTINGS } from '../tools/paint/paintSettings.js';
import { createMockViewerAdapter } from './MockViewerAdapter.js';
import type { ViewerAdapter, ViewerAdapterFactory } from './ViewerAdapter.js';
import { ViewerProvider } from './ViewerContext.js';
import { SETTLE_MS, ViewerPane } from './ViewerPane.js';

function trackedFactory() {
  const created: ViewerAdapter[] = [];
  const destroyed: ViewerAdapter[] = [];
  const factory: ViewerAdapterFactory = async (container) => {
    const adapter = await createMockViewerAdapter(container);
    const destroy = adapter.destroy.bind(adapter);
    adapter.destroy = () => {
      destroyed.push(adapter);
      destroy();
    };
    created.push(adapter);
    return adapter;
  };
  return { factory, created, destroyed };
}

describe('ViewerPane', () => {
  it('shows loading then mounts the adapter and calls onReady', async () => {
    const { factory } = trackedFactory();
    const onReady = vi.fn();
    render(<ViewerPane urn="abc" factory={factory} onReady={onReady} />);
    expect(screen.getByText('Loading model')).toBeInTheDocument();
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Loading model')).toBeNull();
    expect(document.querySelector('[data-dbid]')).not.toBeNull();
  });

  it('reports loading to the task center and finishes it', async () => {
    tasks.clearFinished();
    const { factory } = trackedFactory();
    const onReady = vi.fn();
    render(
      <ViewerPane urn="abc" name="A.rvt" factory={factory} onReady={onReady} />,
    );
    expect(tasks.getSnapshot().tasks.at(-1)).toMatchObject({
      label: 'Loading A.rvt',
      state: 'running',
    });
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(tasks.getSnapshot().tasks.at(-1)?.state).toBe('done');
  });

  it('fails the task when loading fails and cancels it on unmount', async () => {
    tasks.clearFinished();
    const broken: ViewerAdapterFactory = async () => {
      throw new Error('token failed');
    };
    render(<ViewerPane urn="abc" factory={broken} />);
    await screen.findByRole('alert');
    expect(tasks.getSnapshot().tasks.at(-1)).toMatchObject({
      state: 'failed',
      detail: 'token failed',
    });
    const slow: ViewerAdapterFactory = () => new Promise(() => {});
    const { unmount } = render(<ViewerPane urn="def" factory={slow} />);
    expect(tasks.getSnapshot().tasks.at(-1)?.state).toBe('running');
    unmount();
    expect(tasks.getSnapshot().tasks.at(-1)?.state).toBe('cancelled');
  });

  it('destroys the adapter on unmount', async () => {
    const { factory, created, destroyed } = trackedFactory();
    const onReady = vi.fn();
    const { unmount } = render(
      <ViewerPane urn="abc" factory={factory} onReady={onReady} />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    unmount();
    expect(destroyed).toEqual(created);
    expect(document.querySelector('.bsh-mock')).toBeNull();
  });

  it('is StrictMode safe and leaves a single live viewer', async () => {
    const { factory, created, destroyed } = trackedFactory();
    const onReady = vi.fn();
    const { container } = render(
      <StrictMode>
        <ViewerPane urn="abc" factory={factory} onReady={onReady} />
      </StrictMode>,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    await waitFor(() => expect(created.length - destroyed.length).toBe(1));
    expect(container.querySelectorAll('.bsh-mock')).toHaveLength(1);
  });

  it('shows an error state with retry when loading fails', async () => {
    const factory: ViewerAdapterFactory = async () => {
      throw new Error('token failed');
    };
    render(<ViewerPane urn="abc" factory={factory} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('could not be loaded');
    expect(alert).toHaveAttribute('title', 'token failed');
    expect(
      screen.getByRole('button', { name: 'Try again' }),
    ).toBeInTheDocument();
  });

  it('feeds panels through the shared provider', async () => {
    const { factory } = trackedFactory();
    render(
      <ViewerProvider active="abc">
        <ViewerPane urn="abc" factory={factory} />
        <ModelSummaryPanel propertyNames={['Level']} />
      </ViewerProvider>,
    );
    expect(await screen.findByText('Level 1')).toBeInTheDocument();
  });
});

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  observed: Element[] = [];
  disconnected = false;

  constructor(readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.push(target);
  }

  unobserve(): void {}

  disconnect(): void {
    this.disconnected = true;
  }

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver);
  }
}

describe('ViewerPane resize wiring', () => {
  afterEach(() => {
    FakeResizeObserver.instances = [];
    vi.unstubAllGlobals();
  });

  async function mounted() {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { factory, created } = trackedFactory();
    const onReady = vi.fn();
    const view = render(
      <ViewerPane urn="abc" factory={factory} onReady={onReady} />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const adapter = created[0] as ViewerAdapter;
    const spy = vi.spyOn(adapter, 'resize');
    return { view, spy };
  }

  it('observes the viewer container and resizes the adapter on size changes', async () => {
    const { spy } = await mounted();
    const observer = FakeResizeObserver.instances[0];
    expect(observer?.observed[0]).toHaveClass('bsh-viewer-surface');
    observer?.trigger();
    expect(spy).toHaveBeenCalledTimes(1);
    observer?.trigger();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('throttles bursts into one resize per animation frame', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { factory, created } = trackedFactory();
    const onReady = vi.fn();
    render(<ViewerPane urn="abc" factory={factory} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const spy = vi.spyOn(created[0] as ViewerAdapter, 'resize');
    frames.length = 0;
    const observer = FakeResizeObserver.instances[0];
    observer?.trigger();
    observer?.trigger();
    observer?.trigger();
    expect(frames).toHaveLength(1);
    frames[0]?.(0);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('resizes on window resize but not on a parent transitionend', async () => {
    const { view, spy } = await mounted();
    fireEvent.transitionEnd(view.container.firstElementChild as Element);
    expect(spy).not.toHaveBeenCalled();
    fireEvent(window, new Event('resize'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('resizes exactly once when the resize signal changes', async () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
    const { factory, created } = trackedFactory();
    const onReady = vi.fn();
    const view = render(
      <ViewerPane
        urn="abc"
        factory={factory}
        onReady={onReady}
        resizeSignal={0}
      />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const spy = vi.spyOn(created[0] as ViewerAdapter, 'resize');
    view.rerender(
      <ViewerPane
        urn="abc"
        factory={factory}
        onReady={onReady}
        resizeSignal={0}
      />,
    );
    expect(spy).not.toHaveBeenCalled();
    view.rerender(
      <ViewerPane
        urn="abc"
        factory={factory}
        onReady={onReady}
        resizeSignal={1}
      />,
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('re-calls resize once the layout has settled after the last event', async () => {
    const { spy } = await mounted();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const observer = FakeResizeObserver.instances[0];
      spy.mockClear();
      observer?.trigger();
      expect(spy).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(SETTLE_MS - 1);
      expect(spy).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1);
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cleans up the observer and listeners on unmount', async () => {
    const { view, spy } = await mounted();
    const observer = FakeResizeObserver.instances[0];
    const root = view.container.firstElementChild as Element;
    view.unmount();
    expect(observer?.disconnected).toBe(true);
    spy.mockClear();
    fireEvent(window, new Event('resize'));
    fireEvent.transitionEnd(root);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('ViewerPane export tasks', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubDownload() {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
    });
  }

  async function mountedPane() {
    const tracked = trackedFactory();
    const onReady = vi.fn();
    const view = render(
      <ViewerPane urn="abc" factory={tracked.factory} onReady={onReady} />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    return { ...tracked, view };
  }

  const latest = (label: string) =>
    tasks
      .getSnapshot()
      .tasks.filter((task) => task.label === label)
      .at(-1);

  it('reports an Excel export to the task center and leaves the pane status empty', async () => {
    stubDownload();
    const { view } = await mountedPane();
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(view.container.querySelector('.bsh-viewer-status')).toBe(live);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Export to Excel' }),
    );
    await waitFor(() =>
      expect(latest('Exporting Excel')?.detail).toMatch(
        /^Exported \d+ elements/,
      ),
    );
    expect(latest('Exporting Excel')?.state).toBe('done');
    expect(live).toBeEmptyDOMElement();
  });

  it('marks a failed Excel export as failed', async () => {
    const { created } = await mountedPane();
    const adapter = created[0] as ViewerAdapter;
    vi.spyOn(adapter, 'getLeafProperties').mockRejectedValue(new Error('boom'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Export to Excel' }),
    );
    await waitFor(() =>
      expect(latest('Exporting Excel')).toMatchObject({
        state: 'failed',
        detail: 'Export failed: boom',
      }),
    );
  });

  it('reports GLB exports and warns about skipped fragments in the detail', async () => {
    stubDownload();
    const { created } = await mountedPane();
    fireEvent.click(
      screen.getByRole('button', { name: 'Export geometry (GLB)' }),
    );
    await waitFor(() =>
      expect(latest('Exporting geometry (GLB)')?.detail).toMatch(
        /^Exported .* meshes/,
      ),
    );
    const adapter = created[0] as ViewerAdapter;
    vi.spyOn(adapter, 'getGeometryParts').mockResolvedValue({
      parts: [
        {
          name: '1',
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          indices: new Uint16Array([0, 1, 2]),
        },
      ],
      skipped: 4,
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Export geometry (GLB)' }),
    );
    await waitFor(() =>
      expect(latest('Exporting geometry (GLB)')?.detail).toContain(
        '4 fragments skipped',
      ),
    );
  });

  it('reports IFC exports after an Excel export', async () => {
    stubDownload();
    await mountedPane();
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));
    await waitFor(() => expect(latest('Exporting Excel')?.state).toBe('done'));
    fireEvent.click(screen.getByRole('button', { name: 'Export IFC' }));
    await waitFor(() =>
      expect(latest('Exporting IFC')?.detail).toMatch(/^Exported .* elements/),
    );
    expect(latest('Exporting IFC')?.state).toBe('done');
  });

  it('removes the IFC button when the IFC tool is switched off', async () => {
    installMemoryStorage();
    window.localStorage.setItem(
      IFC_SETTINGS.key,
      JSON.stringify({ enabled: false }),
    );
    const { factory } = trackedFactory();
    const onReady = vi.fn();
    render(<ViewerPane urn="abc" factory={factory} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: 'Export to Excel' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Export IFC' })).toBeNull();
  });
});

function ThemeSwitch() {
  const { toggleTheme } = useTheme();
  return (
    <button type="button" onClick={toggleTheme}>
      switch theme
    </button>
  );
}

describe('ViewerPane theme propagation', () => {
  it('applies the current theme on mount and on every change', async () => {
    installMemoryStorage();
    document.documentElement.dataset.theme = 'dark';
    const adapters: ViewerAdapter[] = [];
    const factory: ViewerAdapterFactory = async (container) => {
      const adapter = await createMockViewerAdapter(container);
      vi.spyOn(adapter, 'setTheme');
      adapters.push(adapter);
      return adapter;
    };
    const onReady = vi.fn();
    render(
      <>
        <ThemeSwitch />
        <ViewerPane urn="abc" factory={factory} onReady={onReady} />
      </>,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const adapter = adapters[0];
    expect(adapter?.setTheme).toHaveBeenCalledWith('dark');
    expect(
      document.querySelector('.bsh-mock')?.getAttribute('data-viewer-theme'),
    ).toBe('dark');
    fireEvent.click(screen.getByRole('button', { name: 'switch theme' }));
    await waitFor(() =>
      expect(adapter?.setTheme).toHaveBeenLastCalledWith('light'),
    );
    expect(
      document.querySelector('.bsh-mock')?.getAttribute('data-viewer-theme'),
    ).toBe('light');
    fireEvent.click(screen.getByRole('button', { name: 'switch theme' }));
    await waitFor(() =>
      expect(adapter?.setTheme).toHaveBeenLastCalledWith('dark'),
    );
  });
});

function Patch<T extends object>({
  label,
  setting,
  patch,
}: {
  label: string;
  setting: PersistedSetting<T>;
  patch: Partial<T>;
}) {
  const [, set] = usePersistedSetting(setting);
  return (
    <button type="button" onClick={() => set((c) => ({ ...c, ...patch }))}>
      {label}
    </button>
  );
}

function SettingsFlip() {
  return (
    <Patch
      label="flip paint"
      setting={PAINT_SETTINGS}
      patch={{ enabled: false }}
    />
  );
}

function SettingsFlipExcel() {
  return (
    <Patch
      label="flip excel"
      setting={EXCEL_SETTINGS}
      patch={{ enabled: false }}
    />
  );
}

function IfcProbes() {
  return (
    <>
      <Patch
        label="change ifc settings"
        setting={IFC_SETTINGS}
        patch={{ projectName: 'Changed' }}
      />
      <Patch
        label="flip ifc"
        setting={IFC_SETTINGS}
        patch={{ enabled: false }}
      />
    </>
  );
}

describe('ViewerPane tool settings', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('omits the paint tool when paint brushes are off and keeps export', async () => {
    installMemoryStorage();
    window.localStorage.setItem(
      PAINT_SETTINGS.key,
      JSON.stringify({ enabled: false }),
    );
    const { factory } = trackedFactory();
    const onReady = vi.fn();
    render(<ViewerPane urn="abc" factory={factory} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: 'Export to Excel' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Paint selection' }),
    ).toBeNull();
  });

  it('removes the geometry export when its tool is switched off', async () => {
    installMemoryStorage();
    window.localStorage.setItem(
      GLB_SETTINGS.key,
      JSON.stringify({ enabled: false }),
    );
    const { factory } = trackedFactory();
    const onReady = vi.fn();
    render(<ViewerPane urn="abc" factory={factory} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: 'Export to Excel' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Export geometry (GLB)' }),
    ).toBeNull();
  });

  it('re-registers the tools on a setting change without reloading the model', async () => {
    installMemoryStorage();
    const { factory, created } = trackedFactory();
    const onReady = vi.fn();
    render(
      <>
        <SettingsFlip />
        <ViewerPane urn="abc" factory={factory} onReady={onReady} />
      </>,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: 'Paint selection' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'flip paint' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Paint selection' }),
      ).toBeNull(),
    );
    expect(
      await screen.findByRole('button', { name: 'Export to Excel' }),
    ).toBeInTheDocument();
    expect(created).toHaveLength(1);
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('clears painted colours when paint brushes is switched off but not when only export changes', async () => {
    installMemoryStorage();
    const { factory, created } = trackedFactory();
    const onReady = vi.fn();
    render(
      <>
        <SettingsFlip />
        <SettingsFlipExcel />
        <ViewerPane urn="abc" factory={factory} onReady={onReady} />
      </>,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const adapter = created[0] as ViewerAdapter;
    const dbId = Number(
      document.querySelector('[data-dbid]')?.getAttribute('data-dbid'),
    );
    const modelId = adapter.getModels()[0]?.id ?? '';
    adapter.setModelThemingColor([{ modelId, dbId }], [1, 0, 0, 1]);
    const themed = () => document.querySelectorAll('.bsh-mock__el--themed');
    expect(themed().length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'flip excel' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Export to Excel' }),
      ).toBeNull(),
    );
    expect(themed().length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'flip paint' }));
    await waitFor(() => expect(themed()).toHaveLength(0));
  });

  it('does not re-register the tool group when IFC settings change', async () => {
    installMemoryStorage();
    const { factory, created } = trackedFactory();
    const onReady = vi.fn();
    render(
      <>
        <IfcProbes />
        <ViewerPane urn="abc" factory={factory} onReady={onReady} />
      </>,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: 'Export IFC' }),
    ).toBeInTheDocument();
    const spy = vi.spyOn(created[0] as ViewerAdapter, 'registerToolGroup');
    fireEvent.click(
      screen.getByRole('button', { name: 'change ifc settings' }),
    );
    expect(spy).toHaveBeenCalledTimes(0);
    fireEvent.click(screen.getByRole('button', { name: 'flip ifc' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Export IFC' })).toBeNull(),
    );
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('ViewerPane load stages', () => {
  it('shows the current stage while loading', async () => {
    let emit: (stage: 'manifest') => void = () => {};
    let release: () => void = () => {};
    const factory: ViewerAdapterFactory = async (container) => {
      const adapter = await createMockViewerAdapter(container);
      adapter.onLoadStage = (cb) => {
        emit = cb;
        return () => {};
      };
      const load = adapter.loadModels.bind(adapter);
      adapter.loadModels = async (sources) => {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        return load(sources);
      };
      return adapter;
    };
    render(<ViewerPane urn="abc" factory={factory} />);
    expect(await screen.findByText('Starting the viewer')).toBeTruthy();
    act(() => emit('manifest'));
    expect(screen.getByText('Reading the model manifest')).toBeTruthy();
    await act(async () => release());
    await waitFor(() =>
      expect(screen.queryByText('Reading the model manifest')).toBeNull(),
    );
  });
});
