import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import {
  createMockViewerAdapter,
  MockViewerAdapter,
} from './MockViewerAdapter.js';
import {
  CANCELLED_MESSAGE,
  MODEL_LIMIT_MESSAGE,
  ModelSetError,
  type ModelSource,
} from './modelSet.js';
import { claimRegion, resetRegion } from './region.js';
import type { ViewerAdapter, ViewerAdapterFactory } from './ViewerAdapter.js';
import {
  ADD_FAILED_MESSAGE,
  NOTICE_DISMISS_MS,
  ViewerPane,
} from './ViewerPane.js';

function tracked() {
  const created: ViewerAdapter[] = [];
  const factory: ViewerAdapterFactory = async (container) => {
    const adapter = await createMockViewerAdapter(container);
    created.push(adapter);
    return adapter;
  };
  return { factory, created };
}

const B: ModelSource = { urn: 'urn-b', name: 'B.rvt' };
const C: ModelSource = { urn: 'urn-c', name: 'C.nwd' };

function groups(): string[] {
  return [...document.querySelectorAll<SVGElement>('[data-model-id]')].map(
    (group) => group.dataset.modelId ?? '',
  );
}

describe('ViewerPane with several models', () => {
  it('loads every member into one viewer and lists them', async () => {
    const { factory, created } = tracked();
    const load = vi.spyOn(MockViewerAdapter.prototype, 'loadModels');
    render(
      <ViewerPane
        urn="urn-a"
        name="A.rvt"
        members={[B, C]}
        factory={factory}
      />,
    );
    const trigger = await screen.findByRole('button', {
      name: 'Models in this viewer (3)',
    });
    expect(created).toHaveLength(1);
    expect(load).toHaveBeenCalledWith([{ urn: 'urn-a', name: 'A.rvt' }, B, C]);
    expect(groups()).toEqual(['urn-a', 'urn-b', 'urn-c']);
    fireEvent.click(trigger);
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Show C.nwd' }),
    ).toHaveAttribute('aria-checked', 'true');
    load.mockRestore();
  });

  it('adds and removes members in place without a new viewer', async () => {
    const { factory, created } = tracked();
    const { rerender } = render(
      <ViewerPane urn="urn-a" members={[B]} factory={factory} />,
    );
    await screen.findByRole('button', { name: 'Models in this viewer (2)' });
    rerender(<ViewerPane urn="urn-a" members={[B, C]} factory={factory} />);
    await waitFor(() => expect(groups()).toEqual(['urn-a', 'urn-b', 'urn-c']));
    rerender(<ViewerPane urn="urn-a" members={[C]} factory={factory} />);
    await waitFor(() => expect(groups()).toEqual(['urn-a', 'urn-c']));
    expect(created).toHaveLength(1);
  });

  it('shows a failed member with its reason and keeps the others', async () => {
    const { factory } = tracked();
    const onRemoveModel = vi.fn();
    render(
      <ViewerPane
        urn="urn-a"
        members={[{ urn: 'urn-broken', name: 'Broken.rvt' }, C]}
        factory={factory}
        onRemoveModel={onRemoveModel}
      />,
    );
    const failed = await screen.findByRole('list', {
      name: 'Models that failed',
    });
    expect(failed).toHaveTextContent('Broken.rvt');
    expect(failed).toHaveTextContent('Mock model failed to load');
    expect(groups()).toEqual(['urn-a', 'urn-c']);
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemoveModel).toHaveBeenCalledWith('urn-broken');
  });

  it('retries a failed member from the list and the menu', async () => {
    const { factory } = tracked();
    const broken = { urn: 'urn-broken', name: 'Broken.rvt' };
    const add = vi.spyOn(MockViewerAdapter.prototype, 'addModel');
    render(<ViewerPane urn="urn-a" members={[broken, C]} factory={factory} />);
    await screen.findByRole('list', { name: 'Models that failed' });
    add.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Retry Broken.rvt' }));
    await waitFor(() => expect(add).toHaveBeenCalledWith(broken));
    fireEvent.click(
      screen.getByRole('button', { name: 'Models in this viewer (3)' }),
    );
    fireEvent.click(screen.getByRole('menuitem', { name: 'Retry Broken.rvt' }));
    await waitFor(() => expect(add).toHaveBeenCalledTimes(2));
    add.mockRestore();
  });

  it('retries a failed member once when the page region changes', async () => {
    const { factory } = tracked();
    const broken = { urn: 'urn-broken', name: 'Broken.rvt' };
    const add = vi.spyOn(MockViewerAdapter.prototype, 'addModel');
    render(<ViewerPane urn="urn-a" members={[broken]} factory={factory} />);
    await screen.findByRole('list', { name: 'Models that failed' });
    add.mockClear();
    await act(async () => {});
    act(() => {
      resetRegion();
      claimRegion('US');
    });
    expect(add).toHaveBeenCalledWith(broken);
    expect(
      screen.getByRole('list', { name: 'Models that failed' }),
    ).toBeTruthy();
    act(() => {
      resetRegion();
      claimRegion('US');
    });
    expect(add).toHaveBeenCalledTimes(1);
    add.mockRestore();
  });

  it('shows new member labels without reloading', async () => {
    const { factory } = tracked();
    const { rerender } = render(
      <ViewerPane urn="urn-a" members={[{ urn: 'urn-b' }]} factory={factory} />,
    );
    const trigger = await screen.findByRole('button', {
      name: 'Models in this viewer (2)',
    });
    rerender(
      <ViewerPane
        urn="urn-a"
        name="A.rvt"
        members={[{ urn: 'urn-b', name: 'Better B.rvt' }]}
        factory={factory}
      />,
    );
    fireEvent.click(trigger);
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Show Better B.rvt' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Show A.rvt' }),
    ).toBeInTheDocument();
  });

  it('toggles visibility and offers to add a model from the menu', async () => {
    const { factory } = tracked();
    const onAddModel = vi.fn();
    render(
      <ViewerPane
        urn="urn-a"
        members={[B]}
        factory={factory}
        onAddModel={onAddModel}
      />,
    );
    const trigger = await screen.findByRole('button', {
      name: 'Models in this viewer (2)',
    });
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Show B.rvt' }),
    );
    expect(
      document
        .querySelector('[data-model-id="urn-b"]')
        ?.getAttribute('display'),
    ).toBe('none');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add model...' }));
    expect(onAddModel).toHaveBeenCalledTimes(1);
  });

  it('does not lock the page region when the first load fails', async () => {
    resetRegion();
    const { factory } = tracked();
    const first = render(<ViewerPane urn="urn-broken" factory={factory} />);
    await screen.findByText('Model unavailable');
    first.unmount();
    const eu = btoa('urn:adsk.wipemea:fs.file:vf.eu?version=1')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const onReady = vi.fn();
    render(<ViewerPane urn={eu} factory={factory} onReady={onReady} />);
    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(screen.queryByText('Model in another region')).toBeNull();
    render(<ViewerPane urn="urn-us" factory={factory} />);
    expect(await screen.findByText('Model in another region')).toBeVisible();
    resetRegion();
  });

  it('stays quiet when an add is cancelled', async () => {
    const created: MockViewerAdapter[] = [];
    const factory: ViewerAdapterFactory = async (container) => {
      const adapter = new MockViewerAdapter(container);
      adapter.addModel = () =>
        Promise.reject(new ModelSetError('cancelled', CANCELLED_MESSAGE));
      created.push(adapter);
      return adapter;
    };
    const { rerender } = render(
      <ViewerPane urn="urn-a" members={[B]} factory={factory} />,
    );
    await screen.findByRole('button', { name: 'Models in this viewer (2)' });
    rerender(<ViewerPane urn="urn-a" members={[B, C]} factory={factory} />);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(CANCELLED_MESSAGE)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says when an add fails for another reason and lets the notice go', async () => {
    const factory: ViewerAdapterFactory = async (container) => {
      const adapter = new MockViewerAdapter(container);
      adapter.addModel = () => Promise.reject(new TypeError('boom'));
      return adapter;
    };
    const { rerender } = render(
      <ViewerPane urn="urn-a" members={[B]} factory={factory} />,
    );
    await screen.findByRole('button', { name: 'Models in this viewer (2)' });
    rerender(<ViewerPane urn="urn-a" members={[B, C]} factory={factory} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(ADD_FAILED_MESSAGE);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('dismisses the add notice on its own after a while', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { factory } = tracked();
      const five = ['b', 'c', 'd', 'e', 'f'].map((id) => ({
        urn: `urn-${id}`,
      }));
      const { rerender } = render(
        <ViewerPane urn="urn-a" members={five} factory={factory} />,
      );
      await screen.findByRole('button', { name: 'Models in this viewer (6)' });
      rerender(
        <ViewerPane
          urn="urn-a"
          members={[...five, { urn: 'urn-g' }]}
          factory={factory}
        />,
      );
      await screen.findByText(MODEL_LIMIT_MESSAGE);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(NOTICE_DISMISS_MS + 10);
      });
      expect(screen.queryByText(MODEL_LIMIT_MESSAGE)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('explains the cap when a seventh model is added', async () => {
    const { factory } = tracked();
    const five = ['b', 'c', 'd', 'e', 'f'].map((id) => ({ urn: `urn-${id}` }));
    const { rerender } = render(
      <ViewerPane urn="urn-a" members={five} factory={factory} />,
    );
    await screen.findByRole('button', { name: 'Models in this viewer (6)' });
    rerender(
      <ViewerPane
        urn="urn-a"
        members={[...five, { urn: 'urn-g' }]}
        factory={factory}
      />,
    );
    expect(await screen.findByText(MODEL_LIMIT_MESSAGE)).toBeInTheDocument();
    expect(groups()).toHaveLength(6);
  });
});

describe('ViewerPane with models far apart', () => {
  const FAR: ModelSource = { urn: 'urn-far', name: 'Far.nwd' };
  const offsetOf = () =>
    document.querySelector<SVGGElement>('[data-model-id="urn-far"]')?.dataset
      .offset;

  it('warns, brings models together for viewing and restores them', async () => {
    const { factory } = tracked();
    const onSpreadChange = vi.fn();
    render(
      <ViewerPane
        urn="urn-a"
        members={[FAR]}
        factory={factory}
        onSpreadChange={onSpreadChange}
      />,
    );
    const status = await screen.findByText(/Some models are far apart/);
    expect(status).toHaveTextContent(/about 1,00\d km/);
    const reported = onSpreadChange.mock.calls.at(-1)?.[0] as number;
    expect(reported).toBeGreaterThan(1_000_000);
    expect(reported).toBeLessThan(1_010_000);
    fireEvent.click(
      screen.getByRole('button', { name: 'Bring models together (view only)' }),
    );
    await waitFor(() => expect(offsetOf()).toBe('moved'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restore positions' }),
    );
    await waitFor(() => expect(offsetOf()).toBe('original'));
  });

  it('applies saved offsets and reports changes when controlled', async () => {
    const { factory } = tracked();
    const onOffsetsChange = vi.fn();
    render(
      <ViewerPane
        urn="urn-a"
        members={[FAR]}
        factory={factory}
        offsets={{ 'urn-far': [-1_000_000, 0, 0] }}
        onOffsetsChange={onOffsetsChange}
      />,
    );
    await waitFor(() => expect(offsetOf()).toBe('moved'));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Restore positions' }),
    );
    expect(onOffsetsChange).toHaveBeenCalledWith(null);
  });
});

describe('ViewerPane failure reasons', () => {
  it('explains a member that is still processing and offers retry', async () => {
    const { factory } = tracked();
    render(
      <ViewerPane
        urn="urn-a"
        members={[{ urn: 'urn-processing', name: 'Slow.rvt' }, C]}
        factory={factory}
      />,
    );
    const failed = await screen.findByRole('list', {
      name: 'Models that failed',
    });
    expect(failed).toHaveTextContent('Still processing');
    expect(screen.getByRole('button', { name: 'Retry Slow.rvt' })).toBeTruthy();
  });

  it('explains a member with nothing to show and offers only remove', async () => {
    const { factory } = tracked();
    render(
      <ViewerPane
        urn="urn-a"
        members={[{ urn: 'urn-nogeom', name: 'Empty.rvt' }, C]}
        factory={factory}
      />,
    );
    const failed = await screen.findByRole('list', {
      name: 'Models that failed',
    });
    expect(failed).toHaveTextContent('Nothing to show');
    expect(
      screen.queryByRole('button', { name: 'Retry Empty.rvt' }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('shows the reason when the only model cannot be opened', async () => {
    const { factory } = tracked();
    render(<ViewerPane urn="urn-noaccess" factory={factory} />);
    expect(await screen.findByText('No access')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });
});

describe('ViewerPane cost meter', () => {
  it('counts models against the cap and warns before the last slot', async () => {
    const { factory } = tracked();
    const five = ['b', 'c', 'd', 'e'].map((id) => ({ urn: `urn-${id}` }));
    render(<ViewerPane urn="urn-a" members={five} factory={factory} />);
    const chip = await screen.findByRole('button', {
      name: /Models in this viewer \(5\)/,
    });
    expect(chip.textContent).toContain('5 of 6 models');
    expect(chip.getAttribute('title')).toMatch(/parts \(estimate\)/);
    expect(screen.getByText(/One more model fits/)).toBeTruthy();
    expect(screen.queryByText(/parts \(estimate\)/)).toBeNull();
  });
});
