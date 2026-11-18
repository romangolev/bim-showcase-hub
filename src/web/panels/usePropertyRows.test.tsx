import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import type { ReadOptions } from '../viewer/propertyReads.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { usePropertyRows } from './usePropertyRows.js';

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

describe('usePropertyRows progress and cancel', () => {
  it('exposes read progress while loading', async () => {
    const { adapter, reads, release } = slowAdapter();
    const { result } = renderHook(() => usePropertyRows(adapter, ['Name']));
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

  it('cancels the read when the hook unmounts', async () => {
    const { adapter, reads } = slowAdapter();
    const { unmount } = renderHook(() => usePropertyRows(adapter, ['Name']));
    await waitFor(() => expect(reads).toHaveLength(1));
    expect(reads[0]?.signal?.aborted).toBe(false);
    unmount();
    expect(reads[0]?.signal?.aborted).toBe(true);
  });
});

describe('usePropertyRows partial failure', () => {
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
    const { result } = renderHook(() => usePropertyRows(adapter, ['Name']));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current).toMatchObject({ failed: ['Struct'] });
    expect(result.current.rows).toHaveLength(1);
  });
});
