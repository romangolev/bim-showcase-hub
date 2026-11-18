import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { usePropertyCatalog } from './usePropertyCatalog.js';

describe('usePropertyCatalog', () => {
  it('stays idle without an adapter', () => {
    const { result } = renderHook(() => usePropertyCatalog(null));
    expect(result.current).toMatchObject({ status: 'idle', catalog: [] });
  });

  it('lists the discovered properties once the models are ready', async () => {
    const adapter = new MockViewerAdapter(document.createElement('div'));
    await adapter.loadModels([{ urn: 'urn-a' }]);
    const { result } = renderHook(() => usePropertyCatalog(adapter));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.catalog.map((info) => info.name)).toContain('Level');
    adapter.destroy();
  });
});
