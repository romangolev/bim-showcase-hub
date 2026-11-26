import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../queryClient.js';
import { STACKED_QUERY } from './breakpoint.js';
import { preloadApp, preloadDockLayout } from './preload.js';

const loads = vi.hoisted(() => ({ provider: 0, dock: 0 }));

vi.mock('./LayoutProvider.js', () => {
  loads.provider += 1;
  return { LayoutProvider: () => null };
});

vi.mock('./DockLayout.js', () => {
  loads.dock += 1;
  return { DockLayout: () => null };
});

function stubViewport(stacked: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: stacked && query === STACKED_QUERY,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  loads.provider = 0;
  loads.dock = 0;
  queryClient.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('preloadApp', () => {
  it('starts the layout provider before the session answers', async () => {
    stubViewport(false);
    vi.stubGlobal('fetch', () => new Promise<Response>(() => {}));
    preloadApp();
    await vi.waitFor(() => expect(loads.provider).toBe(1));
    expect(loads.dock).toBe(0);
  });
});

describe('preloadDockLayout', () => {
  it('skips the dock chunk on a stacked viewport', async () => {
    stubViewport(true);
    preloadDockLayout();
    await Promise.resolve();
    expect(loads.dock).toBe(0);
  });

  it('loads the dock chunk on a wide viewport', async () => {
    stubViewport(false);
    preloadDockLayout();
    await vi.waitFor(() => expect(loads.dock).toBe(1));
  });
});
