import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import { createMockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import type { ModelInfo } from '../viewer/modelSet.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ModelsPanel } from './ModelsPanel.js';
import { isolatedModel, isolateVisibility } from './modelRows.js';

function info(id: string, patch: Partial<ModelInfo> = {}): ModelInfo {
  return { id, urn: id, name: id, visible: true, status: 'ready', ...patch };
}

describe('model rows', () => {
  it('isolates one model and shows all again on a second isolate', () => {
    const models = [info('a'), info('b'), info('c', { status: 'error' })];
    expect(isolatedModel(models)).toBeNull();
    expect(isolateVisibility(models, 'a')).toEqual({ a: true, b: false });
    const after = [info('a'), info('b', { visible: false })];
    expect(isolatedModel(after)).toBe('a');
    expect(isolateVisibility(after, 'a')).toEqual({ a: true, b: true });
  });
});

async function load(urns: string[]): Promise<ViewerAdapter> {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = await createMockViewerAdapter(host);
  await adapter.loadModels(urns.map((urn) => ({ urn, name: urn })));
  return adapter;
}

describe('ModelsPanel', () => {
  it('lists models with status, hides, isolates and removes them', async () => {
    const adapter = await load(['urn-a', 'urn-b', 'urn-processing']);
    const onRemove = vi.fn();
    render(<ModelsPanel adapter={adapter} onRemove={onRemove} />);
    expect(screen.getByText('urn-a')).toBeInTheDocument();
    expect(screen.getByText(/Still processing/)).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Ready' })).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Failed' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide urn-a' }));
    await waitFor(() =>
      expect(adapter.getModels().find((m) => m.id === 'urn-a')?.visible).toBe(
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Show urn-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Isolate urn-b' }));
    await waitFor(() =>
      expect(adapter.getModels().map((m) => m.visible)).toEqual([
        false,
        true,
        true,
      ]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Isolate urn-a' }));
    const flipped = await screen.findByRole('button', {
      name: 'Show all models',
    });
    expect(flipped).toHaveAttribute('aria-pressed', 'true');
    expect(flipped).toHaveTextContent('Show all');
    fireEvent.click(flipped);
    await waitFor(() =>
      expect(adapter.getModels().map((m) => m.visible)).toEqual([
        true,
        true,
        true,
      ]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Isolate urn-b' }));
    await screen.findByRole('button', { name: 'Show all models' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove urn-b' }));
    expect(onRemove).toHaveBeenCalledWith('urn-b');
  });

  it('retries a failed model and offers no retry when it cannot work', async () => {
    const adapter = await load(['urn-a', 'urn-processing', 'urn-nogeom']);
    const add = vi.spyOn(adapter, 'addModel');
    render(<ModelsPanel adapter={adapter} />);
    expect(
      screen.queryByRole('button', { name: 'Retry urn-nogeom' }),
    ).toBeNull();
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: 'Retry urn-processing' }),
      );
    });
    expect(add).toHaveBeenCalledWith({
      urn: 'urn-processing',
      name: 'urn-processing',
    });
  });

  it('shows a hint without a viewer', () => {
    render(<ModelsPanel adapter={null} />);
    expect(screen.getByText(/Open a model/)).toBeInTheDocument();
  });
});
