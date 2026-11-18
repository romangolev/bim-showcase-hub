export type StorageArea = 'local' | 'session';

export interface StorageAdapter {
  get(area: StorageArea, key: string): string | null;
  set(area: StorageArea, key: string, value: string): boolean;
  remove(area: StorageArea, key: string): void;
  keys(area: StorageArea): string[];
}

function area(which: StorageArea): Storage | null {
  try {
    return which === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export const browserAdapter: StorageAdapter = {
  get(which, key) {
    try {
      return area(which)?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set(which, key, value) {
    try {
      const storage = area(which);
      if (!storage) return false;
      storage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  },
  remove(which, key) {
    try {
      area(which)?.removeItem(key);
    } catch {
      return;
    }
  },
  keys(which) {
    try {
      const storage = area(which);
      if (!storage) return [];
      return Array.from(
        { length: storage.length },
        (_, index) => storage.key(index) ?? '',
      ).filter(Boolean);
    } catch {
      return [];
    }
  },
};

export function memoryAdapter(): StorageAdapter {
  const data: Record<StorageArea, Map<string, string>> = {
    local: new Map(),
    session: new Map(),
  };
  return {
    get: (which, key) => data[which].get(key) ?? null,
    set: (which, key, value) => {
      data[which].set(key, value);
      return true;
    },
    remove: (which, key) => {
      data[which].delete(key);
    },
    keys: (which) => [...data[which].keys()],
  };
}
