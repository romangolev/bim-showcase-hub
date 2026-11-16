import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { usePropertyRows } from '../panels/usePropertyRows.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import { useModels, useReadySignature } from './useModels.js';

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
    const { result } = renderHook(() => ({
      models: useModels(adapter),
      signature: useReadySignature(adapter),
    }));
    expect(result.current.models.map((m) => m.name)).toEqual(['Arch']);
    expect(result.current.signature).toBe('urn-a');
    await act(async () => {
      await adapter.addModel({ urn: 'urn-b', name: 'MEP' });
    });
    expect(result.current.models.map((m) => m.name)).toEqual(['Arch', 'MEP']);
    expect(result.current.signature).toBe('urn-a\nurn-b');
  });

  it('returns no models without an adapter', () => {
    const { result } = renderHook(() => useModels(null));
    expect(result.current).toEqual([]);
  });
});

describe('usePropertyRows with a model set', () => {
  it('re-reads when a model is added or removed', async () => {
    const adapter = create();
    await adapter.loadModels([{ urn: 'urn-a' }]);
    const { result } = renderHook(() => usePropertyRows(adapter, ['Category']));
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
