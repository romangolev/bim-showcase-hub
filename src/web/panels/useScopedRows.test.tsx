import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import type { ReadOptions } from '../viewer/propertyReads.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { useScopedRows } from './useScopedRows.js';

function slowAdapter() {
  const reads: ReadOptions[] = [];
  let release: (rows: PropertyRow[]) => void = () => {};
  const adapter = {
    getModels: () => [
      { id: 'm', urn: 'm', name: 'm', visible: true, status: 'ready' },
    ],
    onModelsChange: () => () => {},
    getLeafProperties: vi.fn(
      (_names: string[], _ids?: readonly string[], options?: ReadOptions) => {
        reads.push(options ?? {});
        return new Promise<PropertyRow[]>((resolve) => {
          release = resolve;
        });
      },
    ),
  } as unknown as ViewerAdapter;
  return { adapter, reads, release: (rows: PropertyRow[]) => release(rows) };
}

describe('useScopedRows progress and cancel', () => {
  it('exposes read progress while loading', async () => {
    const { adapter, reads, release } = slowAdapter();
    const { result } = renderHook(() =>
      useScopedRows(adapter, { names: ['Name'] }),
    );
    await waitFor(() => expect(reads).toHaveLength(1));
    reads[0]?.onProgress?.({ done: 2, total: 8 });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: 'loading',
        progress: { done: 2, total: 8 },
      }),
    );
    release([{ dbId: 1, name: 'El', properties: { Name: 'n' } }]);
    await waitFor(() => expect(result.current.status).toBe('ready'));
  });

  it('cancel aborts the read and ends in a cancelled state', async () => {
    const { adapter, reads } = slowAdapter();
    const { result } = renderHook(() =>
      useScopedRows(adapter, { names: ['Name'] }),
    );
    await waitFor(() => expect(reads).toHaveLength(1));
    act(() => result.current.cancel());
    expect(reads[0]?.signal?.aborted).toBe(true);
    expect(result.current.status).toBe('cancelled');
  });

  it('cancels the read when the hook unmounts', async () => {
    const { adapter, reads } = slowAdapter();
    const { unmount } = renderHook(() =>
      useScopedRows(adapter, { names: ['Name'] }),
    );
    await waitFor(() => expect(reads).toHaveLength(1));
    expect(reads[0]?.signal?.aborted).toBe(false);
    unmount();
    expect(reads[0]?.signal?.aborted).toBe(true);
  });
});

describe('useScopedRows partial failure', () => {
  it('lists the models that failed next to the rows that loaded', async () => {
    const adapter = {
      getModels: () => [
        { id: 'a', urn: 'a', name: 'Arch', visible: true, status: 'ready' },
        { id: 'b', urn: 'b', name: 'Struct', visible: true, status: 'ready' },
      ],
      onModelsChange: () => () => {},
      getLeafProperties: vi.fn(
        async (_n: string[], ids?: readonly string[]) => {
          if (ids?.includes('b')) throw new Error('timeout');
          return [{ dbId: 1, name: 'El', properties: { Name: 'n' } }];
        },
      ),
    } as unknown as ViewerAdapter;
    const { result } = renderHook(() =>
      useScopedRows(adapter, { names: ['Name'] }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ failed: ['Struct'] });
    expect(result.current.rows).toHaveLength(1);
  });
});

describe('useScopedRows scope', () => {
  async function combined() {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([
      { urn: 'urn-a', name: 'Arch' },
      { urn: 'urn-b', name: 'MEP' },
    ]);
    return adapter;
  }

  it('narrows to one model without reading again', async () => {
    const adapter = await combined();
    const spy = vi.spyOn(adapter, 'getLeafProperties');
    const { result } = renderHook(() =>
      useScopedRows(adapter, { names: ['Category'] }),
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const all = result.current.rows.length;
    expect(result.current.models.options.map((o) => o.label)).toEqual([
      'All models',
      'Arch',
      'MEP',
    ]);
    const reads = spy.mock.calls.length;
    act(() => result.current.models.setScope('urn-b'));
    expect(result.current.rows).toHaveLength(all / 2);
    expect(result.current.total).toBe(all / 2);
    expect(spy.mock.calls.length).toBe(reads);
    adapter.removeModel('urn-b');
    await waitFor(() => expect(result.current.models.options).toEqual([]));
    await waitFor(() => expect(result.current.rows).toHaveLength(all / 2));
    adapter.destroy();
  });

  it('keeps only the selected elements and reports pending until they load', async () => {
    const adapter = await combined();
    const { result, rerender } = renderHook(
      ({ elements }: { elements: 'all' | 'selected' }) =>
        useScopedRows(adapter, { names: ['Category'], elements }),
      { initialProps: { elements: 'all' as 'all' | 'selected' } },
    );
    await waitFor(() => expect(result.current.status).toBe('ready'));
    const all = result.current.rows.length;
    const first = (await adapter.getVisible()).slice(0, 2);
    act(() => adapter.selectModelIds(first));
    rerender({ elements: 'selected' });
    expect(result.current.pending).toBe(true);
    expect(result.current.rows).toEqual([]);
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(result.current.total).toBe(all);
    adapter.destroy();
  });
});
