import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ModelSummaryPanel } from '../panels/ModelSummaryPanel.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { useTheme } from '../theme/ThemeContext.js';
import { createMockViewerAdapter } from './MockViewerAdapter.js';
import type { ViewerAdapter, ViewerAdapterFactory } from './ViewerAdapter.js';
import { ViewerProvider } from './ViewerContext.js';
import { ViewerPane } from './ViewerPane.js';

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
    expect(screen.getByRole('status')).toHaveTextContent('Loading model');
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('status')).toBeNull();
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
