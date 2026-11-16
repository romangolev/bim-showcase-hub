import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchChildren, subscribeUnauthorized } from './client.js';
import { ROOT_SCOPE } from './scope.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('unauthorized notifications', () => {
  it('notifies subscribers when an API call answers 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"nope"}', { status: 401 })),
    );
    const listener = vi.fn();
    const unsubscribe = subscribeUnauthorized(listener);
    await expect(fetchChildren(ROOT_SCOPE)).rejects.toMatchObject({
      status: 401,
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await expect(fetchChildren(ROOT_SCOPE)).rejects.toBeDefined();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
