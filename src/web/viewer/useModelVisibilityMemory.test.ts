import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryStorage } from '../test/mockApi.js';
import { MockViewerAdapter } from './MockViewerAdapter.js';
import type { ModelInfo } from './modelSet.js';
import { useModels } from './useModels.js';
import {
  MODEL_VISIBILITY_KEY,
  useModelVisibilityMemory,
} from './useModelVisibilityMemory.js';
import type { ViewerAdapter } from './ViewerAdapter.js';

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
        JSON.parse(window.localStorage.getItem(MODEL_VISIBILITY_KEY) ?? '[]'),
      ).toEqual(['urn-a', 'urn-c']),
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

  it('forgets a model when it is shown again and ignores single models', async () => {
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
      expect(window.localStorage.getItem(MODEL_VISIBILITY_KEY)).toBe('[]'),
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

function info(urn: string, visible = true, id = urn): ModelInfo {
  return { id, urn, name: urn, visible, status: 'ready' };
}

function fake() {
  const calls: Array<[string, boolean]> = [];
  const adapter = {
    setModelVisible: (id: string, visible: boolean) => {
      calls.push([id, visible]);
    },
  } as unknown as ViewerAdapter;
  return { adapter, calls };
}

function stored(): string[] {
  return JSON.parse(window.localStorage.getItem(MODEL_VISIBILITY_KEY) ?? '[]');
}

describe('per-model memory', () => {
  it('keeps hidden models hidden when another model is added or removed', () => {
    window.localStorage.setItem(MODEL_VISIBILITY_KEY, '["a"]');
    const { adapter, calls } = fake();
    const view = renderHook(
      ({ models }) => useModelVisibilityMemory(adapter, models),
      { initialProps: { models: [info('a'), info('b')] } },
    );
    expect(calls).toEqual([['a', false]]);
    view.rerender({ models: [info('a', false), info('b')] });
    view.rerender({ models: [info('a', false), info('b'), info('c')] });
    expect(calls).toEqual([['a', false]]);
    expect(stored()).toEqual(['a']);
    view.rerender({ models: [info('a', false), info('c')] });
    expect(stored()).toEqual(['a']);
  });

  it('restores a removed then re-added hidden model', () => {
    window.localStorage.setItem(MODEL_VISIBILITY_KEY, '["b"]');
    const { adapter, calls } = fake();
    const view = renderHook(
      ({ models }) => useModelVisibilityMemory(adapter, models),
      { initialProps: { models: [info('a'), info('b', false)] } },
    );
    view.rerender({ models: [info('a')] });
    view.rerender({ models: [info('a'), info('c')] });
    expect(stored()).toEqual(['b']);
    view.rerender({ models: [info('a'), info('c'), info('b')] });
    expect(calls.at(-1)).toEqual(['b', false]);
    expect(stored()).toEqual(['b']);
  });

  it('never drops entries of models that are not open and caps the list', () => {
    const many = Array.from({ length: 200 }, (_, index) => `old-${index}`);
    window.localStorage.setItem(MODEL_VISIBILITY_KEY, JSON.stringify(many));
    const { adapter } = fake();
    const view = renderHook(
      ({ models }) => useModelVisibilityMemory(adapter, models),
      { initialProps: { models: [info('a'), info('b')] } },
    );
    view.rerender({ models: [info('a', false), info('b')] });
    const list = stored();
    expect(list).toHaveLength(200);
    expect(list.at(-1)).toBe('a');
    expect(list).not.toContain('old-0');
    expect(list).toContain('old-1');
  });

  it('treats a URN open twice as hidden when any copy is hidden', () => {
    window.localStorage.setItem(MODEL_VISIBILITY_KEY, '["a"]');
    const { adapter, calls } = fake();
    const view = renderHook(
      ({ models }) => useModelVisibilityMemory(adapter, models),
      {
        initialProps: {
          models: [info('a', true, 'a1'), info('a', true, 'a2'), info('b')],
        },
      },
    );
    expect(calls).toEqual([
      ['a1', false],
      ['a2', false],
    ]);
    view.rerender({
      models: [info('a', false, 'a1'), info('a', true, 'a2'), info('b')],
    });
    expect(stored()).toEqual(['a']);
    view.rerender({
      models: [info('a', true, 'a1'), info('a', true, 'a2'), info('b')],
    });
    expect(stored()).toEqual([]);
  });

  it('reads storage once while nothing changes', () => {
    const { adapter } = fake();
    const spy = vi.spyOn(window.localStorage, 'getItem');
    const view = renderHook(
      ({ models }) => useModelVisibilityMemory(adapter, models),
      { initialProps: { models: [info('a'), info('b')] } },
    );
    view.rerender({ models: [info('a'), info('b')] });
    view.rerender({ models: [info('a'), info('b')] });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
