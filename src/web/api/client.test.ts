import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchAuthUrl,
  fetchChildren,
  postSignOut,
  subscribeUnauthorized,
} from './client.js';
import { ROOT_SCOPE } from './scope.js';

async function primeSignedIn() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{"nodes":[]}', { status: 200 })),
  );
  await fetchChildren(ROOT_SCOPE);
}

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

  it('retries a 401 once before notifying', async () => {
    await primeSignedIn();
    const fetchMock = vi.fn(
      async () => new Response('{"error":"nope"}', { status: 401 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const listener = vi.fn();
    const unsubscribe = subscribeUnauthorized(listener);
    await expect(fetchChildren(ROOT_SCOPE)).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryInit = fetchMock.mock.calls[1] as unknown as [
      string,
      RequestInit,
    ];
    expect(retryInit[1].headers).toMatchObject({ 'X-Auth-Retry': '1' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('neither retries nor notifies on a 403', async () => {
    await primeSignedIn();
    const fetchMock = vi.fn(
      async () => new Response('{"error":"Forbidden"}', { status: 403 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const listener = vi.fn();
    const unsubscribe = subscribeUnauthorized(listener);
    await expect(fetchChildren(ROOT_SCOPE)).rejects.toMatchObject({
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('never retries a POST', async () => {
    await primeSignedIn();
    const fetchMock = vi.fn(async () => new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    const listener = vi.fn();
    const unsubscribe = subscribeUnauthorized(listener);
    await expect(postSignOut()).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not retry once the user is known to be signed out', async () => {
    await primeSignedIn();
    const fetchMock = vi.fn(async () => new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchAuthUrl()).rejects.toBeDefined();
    fetchMock.mockClear();
    await expect(fetchAuthUrl()).rejects.toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not notify when the retry succeeds', async () => {
    await primeSignedIn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response('{"nodes":[]}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const listener = vi.fn();
    const unsubscribe = subscribeUnauthorized(listener);
    await fetchChildren(ROOT_SCOPE);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

describe('rate limits', () => {
  it('exposes Retry-After on a 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: 'Rate limited' }), {
            status: 429,
            headers: { 'Retry-After': '3' },
          }),
      ),
    );
    await expect(fetchChildren(ROOT_SCOPE)).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 3000,
    });
  });

  it('leaves retryAfterMs empty when a 429 carries no Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429 })),
    );
    await expect(fetchChildren(ROOT_SCOPE)).rejects.toMatchObject({
      retryAfterMs: null,
    });
  });
});
