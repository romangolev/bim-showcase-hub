import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MODEL_STORE_KEY,
  MODEL_STORE_LIMIT,
  recallModel,
  rememberModel,
} from './modelStore.js';

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

function useStorage(storage: Storage) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

beforeEach(() => {
  useStorage(memoryStorage());
});

afterEach(() => {
  window.localStorage.clear();
});

describe('modelStore', () => {
  it('round-trips file, version, crumbs and trail by urn', () => {
    rememberModel('urn-a', {
      file: 'Tower.rvt',
      v: 'v2',
      crumbs: ['Hub', 'Project'],
      trail: ['h1', 'p1'],
    });
    expect(recallModel('urn-a')).toEqual({
      file: 'Tower.rvt',
      v: 'v2',
      crumbs: ['Hub', 'Project'],
      trail: ['h1', 'p1'],
    });
  });

  it('returns null for unknown urns and ignores empty contexts', () => {
    rememberModel('urn-a', {});
    expect(recallModel('urn-a')).toBeNull();
    expect(recallModel('missing')).toBeNull();
  });

  it('keeps one entry per urn and moves it to the front', () => {
    rememberModel('urn-a', { file: 'A.rvt' });
    rememberModel('urn-b', { file: 'B.rvt' });
    rememberModel('urn-a', { file: 'A2.rvt' });
    const stored = JSON.parse(
      window.localStorage.getItem(MODEL_STORE_KEY) ?? '[]',
    ) as { urn: string }[];
    expect(stored.map((entry) => entry.urn)).toEqual(['urn-a', 'urn-b']);
    expect(recallModel('urn-a')?.file).toBe('A2.rvt');
  });

  it('caps the store to the most recent models', () => {
    for (let index = 0; index < MODEL_STORE_LIMIT + 5; index += 1) {
      rememberModel(`urn-${index}`, { file: `File ${index}.rvt` });
    }
    const stored = JSON.parse(
      window.localStorage.getItem(MODEL_STORE_KEY) ?? '[]',
    ) as unknown[];
    expect(stored).toHaveLength(MODEL_STORE_LIMIT);
    expect(recallModel('urn-0')).toBeNull();
    expect(recallModel(`urn-${MODEL_STORE_LIMIT + 4}`)?.file).toBe(
      `File ${MODEL_STORE_LIMIT + 4}.rvt`,
    );
  });

  it('survives corrupt and unavailable storage', () => {
    window.localStorage.setItem(MODEL_STORE_KEY, '{nope');
    expect(recallModel('urn-a')).toBeNull();
    window.localStorage.setItem(
      MODEL_STORE_KEY,
      JSON.stringify([{ urn: 1 }, { urn: 'urn-a', file: 'A.rvt' }]),
    );
    expect(recallModel('urn-a')?.file).toBe('A.rvt');
    const blocked = () => {
      throw new Error('blocked');
    };
    useStorage({ ...memoryStorage(), getItem: blocked, setItem: blocked });
    expect(() => rememberModel('urn-a', { file: 'A.rvt' })).not.toThrow();
    expect(recallModel('urn-a')).toBeNull();
  });
});
