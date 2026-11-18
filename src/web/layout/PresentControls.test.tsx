import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { publishActiveAdapter } from '../viewer/activeAdapterStore.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { SNAPSHOT, SNAPSHOT_DEFAULTS } from '../viewer/snapshot.js';
import { saveViewpoint } from '../viewer/viewpoints.js';
import { PresentControls } from './PresentControls.js';

async function withViewpoints(count: number) {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.loadModels([{ urn: 'urn-a' }]);
  for (let i = 1; i <= count; i += 1) {
    adapter.setCamera({
      eye: [i, i, i],
      target: [0, 0, 0],
      up: [0, 1, 0],
      ortho: false,
    });
    saveViewpoint(`Point ${i}`, adapter.getState());
  }
  publishActiveAdapter(adapter);
  return adapter;
}

beforeEach(() => {
  installMemoryStorage();
  publishActiveAdapter(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PresentControls', () => {
  it('shows only the exit control without viewpoints', () => {
    const onExit = vi.fn();
    render(<PresentControls onExit={onExit} />);
    expect(screen.queryByText(/\//)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Exit presentation' }));
    expect(onExit).toHaveBeenCalled();
    expect(fireEvent.keyDown(document.body, { key: 'ArrowRight' })).toBe(true);
    expect(fireEvent.keyDown(document.body, { key: ' ' })).toBe(true);
  });

  it('cycles with the arrow keys and space and announces the position', async () => {
    const adapter = await withViewpoints(3);
    render(<PresentControls onExit={() => undefined} />);
    expect(screen.getByText('- / 3')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await waitFor(() => expect(adapter.getCamera()?.eye).toEqual([1, 1, 1]));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: ' ' });
    await waitFor(() => expect(adapter.getCamera()?.eye).toEqual([2, 2, 2]));
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    await waitFor(() => expect(screen.getByText('3 / 3')).toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Viewpoint 3 of 3: Point 3.',
    );
  });

  it('leaves keys typed in inputs alone', async () => {
    await withViewpoints(2);
    render(
      <>
        <input aria-label="field" />
        <PresentControls onExit={() => undefined} />
      </>,
    );
    fireEvent.keyDown(screen.getByLabelText('field'), { key: 'ArrowRight' });
    expect(screen.getByText('- / 2')).toBeInTheDocument();
  });

  it('auto-advances on the configured interval', async () => {
    await withViewpoints(2);
    SNAPSHOT.write({ ...SNAPSHOT_DEFAULTS, advanceSeconds: 5 });
    vi.useFakeTimers();
    render(<PresentControls onExit={() => undefined} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('reports a viewpoint whose models are closed', async () => {
    const adapter = await withViewpoints(1);
    const other = new MockViewerAdapter(document.createElement('div'));
    await other.loadModels([{ urn: 'urn-z' }]);
    publishActiveAdapter(other);
    render(<PresentControls onExit={() => undefined} />);
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('not open'),
    );
    expect(adapter).toBeTruthy();
  });
});
