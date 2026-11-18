import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '../test/render.js';
import { createMockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { buildMockElements } from '../viewer/mockModel.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { PropertiesPanel } from './PropertiesPanel.js';
import { groupProperties } from './propertiesView.js';

async function load(urns: string[]): Promise<ViewerAdapter> {
  const host = document.createElement('div');
  document.body.append(host);
  const adapter = await createMockViewerAdapter(host);
  await adapter.loadModels(urns.map((urn) => ({ urn, name: urn })));
  return adapter;
}

const first = buildMockElements()[0];

describe('groupProperties', () => {
  const props = [
    { category: 'Dim', name: 'Area', value: 12 },
    { category: 'Identity', name: 'Mark', value: 'W-1' },
    { category: 'Identity', name: 'Empty', value: null },
  ];

  it('groups by category in order and filters by name, value or category', () => {
    expect(groupProperties(props, '').map((g) => g.category)).toEqual([
      'Dim',
      'Identity',
    ]);
    expect(groupProperties(props, 'w-1')[0]?.items).toEqual([props[1]]);
    expect(groupProperties(props, 'dim')[0]?.items).toEqual([props[0]]);
    expect(groupProperties(props, 'zzz')).toEqual([]);
  });
});

describe('PropertiesPanel', () => {
  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('says so when no model is loaded', () => {
    render(<PropertiesPanel adapter={null} />);
    expect(screen.getByText('No model loaded')).toBeInTheDocument();
  });

  it('asks for a selection, then shows the selected element grouped by category', async () => {
    const adapter = await load(['urn-a']);
    render(<PropertiesPanel adapter={adapter} />);
    expect(await screen.findByText('Select an element')).toBeInTheDocument();
    const modelId = adapter.getModels()[0]?.id ?? '';
    act(() => {
      adapter.selectModelIds([{ modelId, dbId: first?.dbId ?? 0 }]);
    });
    expect(await screen.findByText('Identity Data')).toBeInTheDocument();
    expect(screen.getByText('Constraints')).toBeInTheDocument();
    expect(screen.getByText('Assembly Code')).toBeInTheDocument();
    expect(screen.queryByText('Select an element')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filter properties'), {
      target: { value: 'level' },
    });
    expect(screen.queryByText('Identity Data')).not.toBeInTheDocument();
    expect(screen.getByText('Constraints')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter properties'), {
      target: { value: 'nothing-like-this' },
    });
    expect(screen.getByText('No matching properties')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filter properties'), {
      target: { value: '' },
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Copy Level' }));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        first?.level ?? '',
      ),
    );

    act(() => adapter.clearSelection());
    expect(await screen.findByText('Select an element')).toBeInTheDocument();
  });

  it('shows only the selection of its own model', async () => {
    const adapter = await load(['urn-a', 'urn-b']);
    const [a, b] = adapter.getModels();
    render(
      <PropertiesPanel
        adapter={adapter}
        scope={{ value: a?.id ?? '', onChange: () => {} }}
      />,
    );
    act(() => {
      adapter.selectModelIds([
        { modelId: b?.id ?? '', dbId: first?.dbId ?? 0 },
      ]);
    });
    expect(await screen.findByText('Select an element')).toBeInTheDocument();
    act(() => {
      adapter.selectModelIds([
        { modelId: a?.id ?? '', dbId: first?.dbId ?? 0 },
      ]);
    });
    expect(await screen.findByText('Identity Data')).toBeInTheDocument();
  });

  it('reports a read failure', async () => {
    const adapter = await load(['urn-a']);
    vi.spyOn(adapter, 'getElementsProperties').mockRejectedValue(
      new Error('boom'),
    );
    render(<PropertiesPanel adapter={adapter} />);
    const modelId = adapter.getModels()[0]?.id ?? '';
    act(() => {
      adapter.selectModelIds([{ modelId, dbId: first?.dbId ?? 0 }]);
    });
    expect(
      await screen.findByText("We could not read this element's properties."),
    ).toBeInTheDocument();
  });

  it('reads the visible elements of a large selection in one call', async () => {
    const adapter = await load(['urn-a']);
    const modelId = adapter.getModels()[0]?.id ?? '';
    const many = vi.spyOn(adapter, 'getElementsProperties');
    render(<PropertiesPanel adapter={adapter} />);
    const all = buildMockElements().map((entry) => ({
      modelId,
      dbId: entry.dbId,
    }));
    act(() => {
      adapter.selectModelIds(all);
    });
    await waitFor(() => expect(many).toHaveBeenCalledTimes(1));
    expect(many.mock.calls[0]?.[0].length).toBeLessThanOrEqual(20);
  });

  it('does not warn about duplicate keys for identical properties', async () => {
    const adapter = await load(['urn-a']);
    const modelId = adapter.getModels()[0]?.id ?? '';
    vi.spyOn(adapter, 'getElementsProperties').mockResolvedValue([
      {
        dbId: first?.dbId ?? 0,
        name: 'Wall',
        properties: [
          { category: 'Text', name: 'Comments', value: '' },
          { category: 'Text', name: 'Comments', value: '' },
        ],
      },
    ]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PropertiesPanel adapter={adapter} />);
    act(() => {
      adapter.selectModelIds([{ modelId, dbId: first?.dbId ?? 0 }]);
    });
    await waitFor(() =>
      expect(screen.getAllByText('Comments')).toHaveLength(2),
    );
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });
});
