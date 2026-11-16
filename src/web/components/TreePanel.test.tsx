import { createMemoryHistory } from '@tanstack/react-router';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.js';
import { createAppRouter } from '../routes/router.js';
import {
  createTestClient,
  mockFetch,
  stubLayout,
  treeRoutes,
} from '../test/mockApi.js';
import { TREE_WIDTH_KEY } from './useTreeWidth.js';

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
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

async function renderPanel() {
  mockFetch({ '/api/session': { name: 'Ada', picture: null }, ...treeRoutes });
  render(
    <App
      appRouter={createAppRouter(
        createMemoryHistory({ initialEntries: ['/'] }),
      )}
      client={createTestClient()}
    />,
  );
  return screen.findByRole('separator', { name: 'Resize document panel' });
}

beforeEach(() => {
  stubLayout();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TreePanel resizer', () => {
  it('exposes a keyboard focusable separator with value bounds', async () => {
    useStorage(memoryStorage());
    const separator = await renderPanel();
    expect(separator).toHaveAttribute('tabindex', '0');
    expect(separator).toHaveAttribute('aria-valuemin', '260');
    expect(separator).toHaveAttribute('aria-valuemax', '480');
    expect(separator).toHaveAttribute('aria-valuenow', '320');
  });

  it('resizes with the keyboard within bounds and persists the width', async () => {
    const storage = memoryStorage();
    useStorage(storage);
    const separator = await renderPanel();
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '336');
    expect(storage.getItem(TREE_WIDTH_KEY)).toBe('336');
    fireEvent.keyDown(separator, { key: 'End' });
    expect(separator).toHaveAttribute('aria-valuenow', '480');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '480');
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(separator).toHaveAttribute('aria-valuenow', '260');
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(separator).toHaveAttribute('aria-valuenow', '260');
    expect(
      screen
        .getByRole('complementary', { name: 'Documents' })
        .style.getPropertyValue('--tree-width'),
    ).toBe('260px');
  });

  it('restores a stored width and clamps invalid values', async () => {
    useStorage(memoryStorage({ [TREE_WIDTH_KEY]: '9999' }));
    const separator = await renderPanel();
    expect(separator).toHaveAttribute('aria-valuenow', '480');
  });

  it('survives storage that throws', async () => {
    const broken = memoryStorage();
    broken.getItem = () => {
      throw new Error('blocked');
    };
    broken.setItem = () => {
      throw new Error('blocked');
    };
    useStorage(broken);
    const separator = await renderPanel();
    expect(separator).toHaveAttribute('aria-valuenow', '320');
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(separator).toHaveAttribute('aria-valuenow', '336');
  });
});
