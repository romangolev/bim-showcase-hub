import { describe, expect, it, vi } from 'vitest';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import {
  MAX_SEARCH_RESULTS,
  NAMED_RESULTS,
  runElementSearch,
  SEARCH_SPEC,
} from './elementSearch.js';

describe('runElementSearch', () => {
  it('caps the results and names the first ones', async () => {
    const items = Array.from({ length: MAX_SEARCH_RESULTS + 5 }, (_, dbId) => ({
      modelId: 'm',
      dbId,
    }));
    const adapter = {
      searchElements: vi.fn().mockResolvedValue({ items, failedModels: ['x'] }),
      getElementsProperties: vi.fn(async (list: { dbId: number }[]) =>
        list.map((item) => ({
          dbId: item.dbId,
          name: `E${item.dbId}`,
          properties: [],
        })),
      ),
    } as unknown as ViewerAdapter;
    const out = await runElementSearch(adapter, {
      text: 'door',
      attributes: [],
    });
    expect(out.items).toHaveLength(MAX_SEARCH_RESULTS);
    expect(out.truncated).toBe(true);
    expect(out.failedModels).toEqual(['x']);
    expect(adapter.getElementsProperties).toHaveBeenCalledWith(
      items.slice(0, NAMED_RESULTS),
    );
    expect(out.names.get('m:3')).toBe('E3');
  });

  it('passes the chosen attributes to the adapter only when there are some', async () => {
    const searchElements = vi
      .fn()
      .mockResolvedValue({ items: [], failedModels: [] });
    const adapter = {
      searchElements,
      getElementsProperties: vi.fn(async () => []),
    } as unknown as ViewerAdapter;
    await runElementSearch(adapter, { text: 'wall', attributes: [] });
    expect(searchElements).toHaveBeenCalledWith('wall', {
      attributes: undefined,
      signal: undefined,
    });
    await runElementSearch(adapter, { text: 'wall', attributes: ['Name'] });
    expect(searchElements).toHaveBeenLastCalledWith('wall', {
      attributes: ['Name'],
      signal: undefined,
    });
  });
});

describe('SEARCH_SPEC', () => {
  it('keeps the text and at most twenty attribute names of 120 characters', () => {
    const many = Array.from(
      { length: 25 },
      (_, index) => `${index}${'a'.repeat(130)}`,
    );
    const spec = SEARCH_SPEC.sanitize({ text: 7, attributes: many });
    expect(spec.text).toBe('');
    expect(spec.attributes).toHaveLength(20);
    expect(spec.attributes[0]).toHaveLength(120);
  });

  it('drops non-string attributes', () => {
    const spec = SEARCH_SPEC.sanitize({
      text: 'door',
      attributes: ['Name', 3, ''],
    });
    expect(spec).toEqual({ text: 'door', attributes: ['Name'] });
  });
});
