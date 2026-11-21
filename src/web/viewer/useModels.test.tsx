import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useScopedRows } from '../panels/useScopedRows.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import { useModels } from './useModels.js';

const adapters: MockViewerAdapter[] = [];

function create(): MockViewerAdapter {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  adapters.push(adapter);
  return adapter;
}

afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.destroy();
});

describe('useModels', () => {
  it('follows the model set of the adapter', async () => {
    const adapter = create();
    await adapter.loadModels([{ urn: 'urn-a', name: 'Arch' }]);
    const { result } = renderHook(() => useModels(adapter));
    expect(result.current.map((m) => m.name)).toEqual(['Arch']);
    await act(async () => {
      await adapter.addModel({ urn: 'urn-b', name: 'MEP' });
    });
    expect(result.current.map((m) => m.name)).toEqual(['Arch', 'MEP']);
  });

  it('renders once on mount and never shows the previous adapter models', async () => {
    const first = create();
    const second = create();
    await first.loadModels([{ urn: 'urn-a', name: 'Arch' }]);
    await second.loadModels([{ urn: 'urn-b', name: 'MEP' }]);
    const seen: string[][] = [];
    const { rerender } = renderHook(
      ({ adapter }) => {
        const models = useModels(adapter);
        seen.push(models.map((m) => m.name));
        return models;
      },
      { initialProps: { adapter: first } },
    );
    expect(seen).toEqual([['Arch']]);
    rerender({ adapter: second });
    expect(seen.slice(1).every((names) => names[0] === 'MEP')).toBe(true);
    expect(seen.at(-1)).toEqual(['MEP']);
  });

  it('returns no models without an adapter', () => {
    const { result } = renderHook(() => useModels(null));
    expect(result.current).toEqual([]);
  });
});

describe('useScopedRows with a model set', () => {
  it('re-reads when a model is added or removed', async () => {
    const adapter = create();
    await adapter.loadModels([{ urn: 'urn-a' }]);
    const { result } = renderHook(() =>
      useScopedRows(adapter, { names: ['Category'] }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const single = result.current.rows.length;
    expect(single).toBeGreaterThan(0);
    await act(async () => {
      await adapter.addModel({ urn: 'urn-b' });
    });
    await waitFor(() => expect(result.current.rows).toHaveLength(single * 2));
    act(() => adapter.removeModel('urn-a'));
    await waitFor(() => expect(result.current.rows).toHaveLength(single));
    expect(result.current.rows.every((row) => row.modelId === 'urn-b')).toBe(
      true,
    );
  });
});
