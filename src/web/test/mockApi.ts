import { QueryClient } from '@tanstack/react-query';
import { vi } from 'vitest';
import type { TreeNode } from '../../shared/types.js';

export type Handler = (
  url: string,
  init?: RequestInit,
) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function mockFetch(routes: Record<string, Handler | unknown>) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const route = routes[url];
    if (route === undefined) {
      return json({ error: `No mock for ${url}` }, 404);
    }
    if (typeof route === 'function') {
      return (route as Handler)(url, init);
    }
    return json(route);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function createTestClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

export function stubLayout(height = 600) {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    value: height,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    value: 320,
  });
}

export const hub: TreeNode = {
  id: 'h1',
  kind: 'hub',
  name: 'Studio hub',
  hasChildren: true,
  viewable: false,
};

export const project: TreeNode = {
  id: 'p1',
  kind: 'project',
  name: 'Riverside Tower',
  hasChildren: true,
  viewable: false,
  parentId: 'h1',
};

export const folder: TreeNode = {
  id: 'f1',
  kind: 'folder',
  name: 'Project Files',
  hasChildren: true,
  viewable: false,
  parentId: 'p1',
};

export const item: TreeNode = {
  id: 'i1',
  kind: 'item',
  name: 'Tower.rvt',
  hasChildren: true,
  viewable: false,
  parentId: 'f1',
};

export const viewableVersion: TreeNode = {
  id: 'v2',
  kind: 'version',
  name: 'v2: Coordination',
  hasChildren: false,
  viewable: true,
  urn: 'dXJuOmFkc2s',
  parentId: 'i1',
};

export const plainVersion: TreeNode = {
  id: 'v1',
  kind: 'version',
  name: 'v1: Concept',
  hasChildren: false,
  viewable: false,
  parentId: 'i1',
};

export const treeRoutes = {
  '/api/hubs': [hub],
  '/api/hubs/h1/projects': [project],
  '/api/hubs/h1/projects/p1/folders': [folder],
  '/api/projects/p1/folders/f1/contents': [item],
  '/api/projects/p1/items/i1/versions': [viewableVersion, plainVersion],
};

export function mockMatchMedia(initialWidth: number) {
  let width = initialWidth;
  const lists = new Set<{
    query: string;
    listeners: Set<() => void>;
  }>();
  const evaluate = (query: string) => {
    const max = /max-width:\s*(\d+)px/.exec(query);
    return max ? width <= Number(max[1]) : false;
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => {
      const entry = { query, listeners: new Set<() => void>() };
      lists.add(entry);
      return {
        get matches() {
          return evaluate(query);
        },
        media: query,
        addEventListener: (_: string, listener: () => void) =>
          entry.listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) =>
          entry.listeners.delete(listener),
      };
    }),
  );
  return {
    setWidth(next: number) {
      width = next;
      for (const entry of lists) {
        for (const listener of entry.listeners) {
          listener();
        }
      }
    },
  };
}

export function installMemoryStorage(): Storage {
  const data = new Map<string, string>();
  const storage: Storage = {
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
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return storage;
}
