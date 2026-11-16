import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
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
import { resetRegion } from './region.js';
import type { ViewerAdapter, ViewerAdapterFactory } from './ViewerAdapter.js';
import { ViewerPane } from './ViewerPane.js';

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
    fireEvent.click(screen.getByRole('button', { name: 'Restore positions' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Restore positions' }));
    expect(onOffsetsChange).toHaveBeenCalledWith(null);
  });
});
