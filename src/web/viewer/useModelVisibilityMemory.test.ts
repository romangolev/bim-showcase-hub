import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import { useModels } from './useModels.js';
import {
  MODEL_VISIBILITY_KEY,
  useModelVisibilityMemory,
} from './useModelVisibilityMemory.js';

const adapters: MockViewerAdapter[] = [];

async function create(urns: string[]): Promise<MockViewerAdapter> {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  adapters.push(adapter);
  await adapter.loadModels(urns.map((urn) => ({ urn, name: urn })));
  return adapter;
}

function mount(adapter: MockViewerAdapter) {
  return renderHook(() => {
    const models = useModels(adapter);
    useModelVisibilityMemory(adapter, models);
    return models;
  });
}

beforeEach(() => {
  installMemoryStorage();
});
afterEach(() => {
  for (const adapter of adapters.splice(0)) adapter.destroy();
});

describe('useModelVisibilityMemory', () => {
  it('saves hidden models and restores them on a fresh adapter', async () => {
    const first = await create(['urn-a', 'urn-b', 'urn-c']);
    const view = mount(first);
    await waitFor(() => expect(view.result.current).toHaveLength(3));
    act(() => first.setModelVisible('urn-a', false));
    act(() => first.setModelVisible('urn-c', false));
    await waitFor(() =>
      expect(
        JSON.parse(window.localStorage.getItem(MODEL_VISIBILITY_KEY) ?? '{}'),
      ).toEqual({ 'urn-a\nurn-b\nurn-c': ['urn-a', 'urn-c'] }),
    );
    view.unmount();

    const second = await create(['urn-c', 'urn-b', 'urn-a']);
    const again = mount(second);
    await waitFor(() =>
      expect(again.result.current.map((m) => [m.urn, m.visible])).toEqual([
        ['urn-c', false],
        ['urn-b', true],
        ['urn-a', false],
      ]),
    );
  });

  it('forgets the set when everything is shown again and ignores single models', async () => {
    const adapter = await create(['urn-a', 'urn-b']);
    const view = mount(adapter);
    await waitFor(() => expect(view.result.current).toHaveLength(2));
    act(() => adapter.setModelVisible('urn-a', false));
    await waitFor(() =>
      expect(window.localStorage.getItem(MODEL_VISIBILITY_KEY)).toContain(
        'urn-a',
      ),
    );
    act(() => adapter.setModelVisible('urn-a', true));
    await waitFor(() =>
      expect(window.localStorage.getItem(MODEL_VISIBILITY_KEY)).toBe('{}'),
    );
    window.localStorage.clear();
    const single = await create(['urn-a']);
    mount(single);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(window.localStorage.getItem(MODEL_VISIBILITY_KEY)).toBeNull();
  });

  it('survives corrupt storage', async () => {
    window.localStorage.setItem(MODEL_VISIBILITY_KEY, '{nope');
    const adapter = await create(['urn-a', 'urn-b']);
    const view = mount(adapter);
    await waitFor(() => expect(view.result.current).toHaveLength(2));
    expect(view.result.current.every((model) => model.visible)).toBe(true);
  });
});
