import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelSummaryPanel } from '../panels/ModelSummaryPanel.js';
import {
  SETTINGS_STORAGE_KEY,
  SettingsProvider,
  useSettings,
} from '../settings/index.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import { useTheme } from '../theme/ThemeContext.js';
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

describe('ViewerPane export status badge', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows an aria-live badge after export and dismisses it after 4s', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
    });
    const { factory } = trackedFactory();
    const onReady = vi.fn();
    const { container } = render(
      <ViewerPane urn="abc" factory={factory} onReady={onReady} />,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const live = screen.getByRole('status');
    expect(live).toHaveAttribute('aria-live', 'polite');
    expect(live).toBeEmptyDOMElement();
    const exportButton = await screen.findByRole('button', {
      name: 'Export to Excel',
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(exportButton);
    await waitFor(() => expect(live).toHaveTextContent(/^Exported \d+ rows/));
    expect(live.querySelector('.badge .badge__dot')).not.toBeNull();
    expect(live.querySelector('.badge')).toHaveAttribute('data-variant', 'ok');
    expect(container.querySelector('.bsh-viewer-status')).toBe(live);
    act(() => {
      vi.advanceTimersByTime(3900);
    });
    expect(live).not.toBeEmptyDOMElement();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(live).toBeEmptyDOMElement();
  });

  it('formats the exported row count with separators and shows errors in the error variant', async () => {
    const { factory, created } = trackedFactory();
    const onReady = vi.fn();
    render(<ViewerPane urn="abc" factory={factory} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const adapter = created[0] as ViewerAdapter;
    vi.spyOn(adapter, 'getLeafProperties').mockRejectedValue(new Error('boom'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Export to Excel' }),
    );
    const live = screen.getByRole('status');
    await waitFor(() => expect(live).toHaveTextContent('Export failed'));
    expect(live.querySelector('.badge')).toHaveAttribute(
      'data-variant',
      'error',
    );
  });
});

describe('ViewerPane geometry export badge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the latest export, whichever kind it is, and warns about skipped fragments', async () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: () => 'blob:x',
      revokeObjectURL: () => {},
    });
    const { factory, created } = trackedFactory();
    const onReady = vi.fn();
    render(<ViewerPane urn="abc" factory={factory} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const live = screen.getByRole('status');
    fireEvent.click(
      screen.getByRole('button', { name: 'Export geometry (GLB)' }),
    );
    await waitFor(() => expect(live).toHaveTextContent(/^Exported .* meshes/));
    expect(live.querySelector('.badge')).toHaveAttribute('data-variant', 'ok');
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));
    await waitFor(() => expect(live).toHaveTextContent(/^Exported \d+ rows/));

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
    await waitFor(() => expect(live).toHaveTextContent('4 fragments skipped'));
    expect(live.querySelector('.badge')).toHaveAttribute(
      'data-variant',
      'error',
    );
  });
});

describe('ViewerPane IFC export badge', () => {
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

  it('shows an Exported badge after clicking Export IFC', async () => {
    stubDownload();
    const { factory } = trackedFactory();
    const onReady = vi.fn();
    render(<ViewerPane urn="abc" factory={factory} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const live = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Export IFC' }));
    await waitFor(() =>
      expect(live).toHaveTextContent(/^Exported .* elements/),
    );
    expect(live.querySelector('.badge')).toHaveAttribute('data-variant', 'ok');
  });

  it('shows the latest export when an IFC export follows an Excel export', async () => {
    stubDownload();
    const { factory } = trackedFactory();
    const onReady = vi.fn();
    render(<ViewerPane urn="abc" factory={factory} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    const live = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));
    await waitFor(() => expect(live).toHaveTextContent(/^Exported \d+ rows/));
    fireEvent.click(screen.getByRole('button', { name: 'Export IFC' }));
    await waitFor(() =>
      expect(live).toHaveTextContent(/^Exported .* elements/),
    );
  });

  it('removes the IFC button when the ifcExport setting is off', async () => {
    installMemoryStorage();
    window.localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        paintBrushes: true,
        excelExport: true,
        glbExport: true,
        ifcExport: false,
      }),
    );
    const { factory } = trackedFactory();
    const onReady = vi.fn();
    render(
      <SettingsProvider>
        <ViewerPane urn="abc" factory={factory} onReady={onReady} />
      </SettingsProvider>,
    );
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

function SettingsFlip() {
  const { setSetting } = useSettings();
  return (
    <button type="button" onClick={() => setSetting('paintBrushes', false)}>
      flip paint
    </button>
  );
}

function SettingsFlipExcel() {
  const { setSetting } = useSettings();
  return (
    <button type="button" onClick={() => setSetting('excelExport', false)}>
      flip excel
    </button>
  );
}

function IfcProbes() {
  const { settings, setSetting } = useSettings();
  return (
    <>
      <button
        type="button"
        onClick={() =>
          setSetting('ifc', { ...settings.ifc, projectName: 'Changed' })
        }
      >
        change ifc settings
      </button>
      <button type="button" onClick={() => setSetting('ifcExport', false)}>
        flip ifc
      </button>
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
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ paintBrushes: false, excelExport: true }),
    );
    const { factory } = trackedFactory();
    const onReady = vi.fn();
    render(
      <SettingsProvider>
        <ViewerPane urn="abc" factory={factory} onReady={onReady} />
      </SettingsProvider>,
    );
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(
      await screen.findByRole('button', { name: 'Export to Excel' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Paint selection' }),
    ).toBeNull();
  });

  it('re-registers the tools on a setting change without reloading the model', async () => {
    installMemoryStorage();
    const { factory, created } = trackedFactory();
    const onReady = vi.fn();
    render(
      <SettingsProvider>
        <SettingsFlip />
        <ViewerPane urn="abc" factory={factory} onReady={onReady} />
      </SettingsProvider>,
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
      <SettingsProvider>
        <SettingsFlip />
        <SettingsFlipExcel />
        <ViewerPane urn="abc" factory={factory} onReady={onReady} />
      </SettingsProvider>,
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
      <SettingsProvider>
        <IfcProbes />
        <ViewerPane urn="abc" factory={factory} onReady={onReady} />
      </SettingsProvider>,
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
