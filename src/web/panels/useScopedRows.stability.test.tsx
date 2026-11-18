import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { useScopedRows } from './useScopedRows.js';

type Item = { modelId: string; dbId: number };

function selectionAdapter() {
  let emit: (list: Item[]) => void = () => {};
  let resolveInitial: (list: Item[]) => void = () => {};
  const adapter = {
    getModels: () => [
      { id: 'm', urn: 'm', name: 'm', visible: true, status: 'ready' },
    ],
    onModelsChange: () => () => {},
    getLeafProperties: vi.fn(async () => [
      { dbId: 1, modelId: 'm', name: 'a', properties: { Name: 'a' } },
      { dbId: 2, modelId: 'm', name: 'b', properties: { Name: 'b' } },
    ]),
    getModelSelection: () =>
      new Promise<Item[]>((resolve) => {
        resolveInitial = resolve;
      }),
    onSelectionChange: (cb: typeof emit) => {
      emit = cb;
      return () => {};
    },
  } as unknown as ViewerAdapter;
  return {
    adapter,
    emit: (l: Item[]) => emit(l),
    resolveInitial: (l: Item[]) => resolveInitial(l),
  };
}

describe('useScopedRows stability and ordering', () => {
  it('keeps the rows array identity across unrelated re-renders', async () => {
    const { adapter } = selectionAdapter();
    const { result, rerender } = renderHook(() =>
      useScopedRows(adapter, { names: ['Name'] }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const before = result.current.rows;
    rerender();
    rerender();
    expect(result.current.rows).toBe(before);
  });

  it('keeps the rows array identity for a loaded selected scope', async () => {
    const { adapter, resolveInitial } = selectionAdapter();
    const { result, rerender } = renderHook(() =>
      useScopedRows(adapter, { names: ['Name'], elements: 'selected' }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => resolveInitial([{ modelId: 'm', dbId: 1 }]));
    await waitFor(() => expect(result.current.rows).toHaveLength(1));
    const before = result.current.rows;
    rerender();
    expect(result.current.rows).toBe(before);
  });

  it('ignores a stale initial selection that resolves after a newer event', async () => {
    const { adapter, emit, resolveInitial } = selectionAdapter();
    const { result } = renderHook(() =>
      useScopedRows(adapter, { names: ['Name'], elements: 'selected' }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => emit([{ modelId: 'm', dbId: 2 }]));
    await waitFor(() =>
      expect(result.current.rows.map((r) => r.dbId)).toEqual([2]),
    );
    await act(async () => {
      resolveInitial([{ modelId: 'm', dbId: 1 }]);
    });
    expect(result.current.rows.map((r) => r.dbId)).toEqual([2]);
  });
});
