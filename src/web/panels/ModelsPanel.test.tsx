import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import { colorLayersFor } from '../viewer/colorLayers.js';
import { createMockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { buildMockElements } from '../viewer/mockModel.js';
import type { ModelInfo } from '../viewer/modelSet.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { ModelsPanel } from './ModelsPanel.js';
import { isolatedModel, isolateVisibility } from './modelRows.js';
import { MODEL_TINTS } from './modelTint.js';

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

const loaded: ViewerAdapter[] = [];
let currentHost: HTMLElement | null = null;

async function load(urns: string[]): Promise<ViewerAdapter> {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = await createMockViewerAdapter(host);
  await adapter.loadModels(urns.map((urn) => ({ urn, name: urn })));
  loaded.push(adapter);
  currentHost = host;
  return adapter;
}

describe('ModelsPanel', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  afterEach(() => {
    for (const adapter of loaded.splice(0)) adapter.destroy();
    currentHost = null;
  });

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

  function tinted(modelId: string): number {
    return (
      currentHost?.querySelectorAll(
        `[data-model-id="${modelId}"] .bsh-mock__el--themed`,
      ).length ?? 0
    );
  }

  function firstNode(modelId: string): SVGElement | null {
    return (
      currentHost?.querySelector<SVGElement>(
        `[data-model-id="${modelId}"] [data-dbid]`,
      ) ?? null
    );
  }

  function painted(className: string): number {
    return currentHost?.querySelectorAll(`.${className}`).length ?? 0;
  }

  it('recolours the chosen model and nothing else', async () => {
    const adapter = await load(['urn-a', 'urn-b']);
    render(<ModelsPanel adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tint urn-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tint urn-a in Blue' }));
    await waitFor(() =>
      expect(tinted('urn-a')).toBe(buildMockElements().length),
    );
    expect(tinted('urn-b')).toBe(0);
    expect(firstNode('urn-a')?.style.fill).toBe('rgba(59, 130, 246, 0.5)');
  });

  it('changes the tint strength of one model', async () => {
    const adapter = await load(['urn-a', 'urn-b']);
    render(<ModelsPanel adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tint urn-a' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Tint urn-a in Green' }),
    );
    await waitFor(() => expect(tinted('urn-a')).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole('button', { name: 'Tint urn-a' }));
    fireEvent.change(screen.getByLabelText('Tint strength for urn-a'), {
      target: { value: '0.8' },
    });
    await waitFor(() =>
      expect(firstNode('urn-a')?.style.fill).toBe('rgba(34, 197, 94, 0.8)'),
    );
    expect(tinted('urn-b')).toBe(0);
  });

  it('clears one tint or all of them', async () => {
    const adapter = await load(['urn-a', 'urn-b']);
    render(<ModelsPanel adapter={adapter} />);
    for (const name of ['urn-a', 'urn-b']) {
      fireEvent.click(screen.getByRole('button', { name: `Tint ${name}` }));
      fireEvent.click(
        screen.getByRole('button', { name: `Tint ${name} in Purple` }),
      );
      await waitFor(() => expect(tinted(name)).toBeGreaterThan(0));
    }
    fireEvent.click(screen.getByRole('button', { name: 'Tint urn-a' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear colour' }));
    await waitFor(() => expect(tinted('urn-a')).toBe(0));
    expect(tinted('urn-b')).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Reset tints' }));
    await waitFor(() => expect(tinted('urn-b')).toBe(0));
  });

  it('resets only the tint layer', async () => {
    const adapter = await load(['urn-a']);
    const dbId = buildMockElements()[0]?.dbId ?? 0;
    colorLayersFor(adapter).setColors(
      'paint',
      [{ modelId: 'urn-a', dbId }],
      [1, 0, 0, 1],
    );
    render(<ModelsPanel adapter={adapter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tint urn-a' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Tint urn-a in Purple' }),
    );
    await waitFor(() => expect(tinted('urn-a')).toBeGreaterThan(1));
    fireEvent.click(screen.getByRole('button', { name: 'Reset tints' }));
    await waitFor(() => expect(tinted('urn-a')).toBe(1));
    const painted = currentHost?.querySelector<SVGElement>(
      `[data-model-id="urn-a"] [data-dbid="${dbId}"]`,
    );
    expect(painted?.style.fill).toBe('rgb(255, 0, 0)');
  });

  it('saves a palette with the model set', async () => {
    const adapter = await load(['urn-a']);
    render(<ModelsPanel adapter={adapter} setKey="tab-one" />);
    fireEvent.click(screen.getByRole('button', { name: 'Tint urn-a' }));
    fireEvent.change(screen.getByLabelText('Palette colour 1'), {
      target: { value: '#112233' },
    });
    expect(MODEL_TINTS.read().palettes['tab-one']?.[0]).toBe('#112233');
    fireEvent.click(
      screen.getByRole('button', { name: 'Use default palette' }),
    );
    expect(MODEL_TINTS.read().palettes['tab-one']).toBeUndefined();
  });

  it('ghosts every model but the first and resets', async () => {
    const adapter = await load(['urn-a', 'urn-b']);
    render(<ModelsPanel adapter={adapter} />);
    const toggle = screen.getByRole('checkbox', { name: 'Ghost others' });
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(painted('bsh-mock__el--dim')).toBe(buildMockElements().length),
    );
    fireEvent.click(toggle);
    await waitFor(() => expect(painted('bsh-mock__el--dim')).toBe(0));
    expect(painted('bsh-mock__el--hidden')).toBe(0);
  });
});
