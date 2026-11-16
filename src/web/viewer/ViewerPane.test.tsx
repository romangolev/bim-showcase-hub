import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ModelSummaryPanel } from '../panels/ModelSummaryPanel.js';
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
      <ViewerProvider>
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Export to Excel' }));
    const live = screen.getByRole('status');
    await waitFor(() => expect(live).toHaveTextContent('Export failed'));
    expect(live.querySelector('.badge')).toHaveAttribute(
      'data-variant',
      'error',
    );
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
