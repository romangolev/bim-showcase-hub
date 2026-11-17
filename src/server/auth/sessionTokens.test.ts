import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../errors.js';
import {
  CLOCK_SKEW_MS,
  clearAuth,
  createSessionCodec,
  getAccessToken,
  isSignedIn,
  MAX_COOKIE_BYTES,
  readUser,
  SESSION_MAX_AGE_MS,
  sessionCookieBytes,
  storeTokens,
  storeUser,
} from './sessionTokens.js';
import type { ApsAuth } from './types.js';

function fakeAuth(overrides: Partial<ApsAuth> = {}): ApsAuth {
  return {
    authorizeUrl: vi.fn(),
    exchangeCode: vi.fn(),
    refresh: vi.fn().mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 3600,
    }),
    getUser: vi.fn(),
    ...overrides,
  };
}

const NOW = 1_000_000;
const codec = createSessionCodec('test-secret');

describe('sessionTokens', () => {
  it('returns a live token without refreshing', async () => {
    const session: Record<string, unknown> = {};
    storeTokens(
      session,
      { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 },
      codec,
      NOW,
    );
    const auth = fakeAuth();
    const token = await getAccessToken(session, auth, codec, NOW + 1000);
    expect(token).toEqual({ accessToken: 'a', expiresIn: 3599 });
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('refreshes an expiring token and stores the result', async () => {
    const session: Record<string, unknown> = {};
    storeTokens(
      session,
      { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 },
      codec,
      NOW,
    );
    const auth = fakeAuth();
    const token = await getAccessToken(session, auth, codec, NOW + 3_590_000);
    expect(auth.refresh).toHaveBeenCalledWith('r');
    expect(token.accessToken).toBe('new-access');
    const again = await getAccessToken(session, auth, codec, NOW + 3_600_000);
    expect(again.accessToken).toBe('new-access');
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('reports 401 but keeps the session when refresh is rejected', async () => {
    const session: Record<string, unknown> = {};
    storeTokens(
      session,
      { accessToken: 'a', refreshToken: 'r', expiresIn: 1 },
      codec,
      NOW,
    );
    storeUser(session, { name: 'Sam', picture: null });
    const auth = fakeAuth({
      refresh: vi.fn().mockRejectedValue(new HttpError(401, 'Session expired')),
    });
    await expect(
      getAccessToken(session, auth, codec, NOW + 10_000),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(isSignedIn(session, codec, NOW + 10_000)).toBe(true);
    expect(readUser(session)).not.toBeNull();
  });

  it('keeps the session and reports 502 on transient refresh failures', async () => {
    for (const failure of [
      new Error('network down'),
      new HttpError(502, 'Upstream service error'),
      Object.assign(new Error('rate'), { httpStatusCode: () => 429 }),
    ]) {
      const session: Record<string, unknown> = {};
      storeTokens(
        session,
        { accessToken: 'a', refreshToken: 'r-transient', expiresIn: 1 },
        codec,
        NOW,
      );
      storeUser(session, { name: 'Sam', picture: null });
      const auth = fakeAuth({ refresh: vi.fn().mockRejectedValue(failure) });
      await expect(
        getAccessToken(session, auth, codec, NOW + 10_000),
      ).rejects.toMatchObject({ status: 502 });
      expect(isSignedIn(session, codec, NOW + 10_000)).toBe(true);
      expect(readUser(session)).not.toBeNull();
    }
  });

  it('shares one refresh between concurrent callers', async () => {
    const sessions = [{}, {}].map(() => {
      const session: Record<string, unknown> = {};
      storeTokens(
        session,
        { accessToken: 'a', refreshToken: 'r-shared', expiresIn: 1 },
        codec,
        NOW,
      );
      return session;
    });
    const auth = fakeAuth();
    const results = await Promise.all(
      sessions.map((s) => getAccessToken(s, auth, codec, NOW + 10_000)),
    );
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.accessToken)).toEqual([
      'new-access',
      'new-access',
    ]);
    for (const session of sessions)
      expect(isSignedIn(session, codec, NOW + 10_000)).toBe(true);
  });

  it('reports 401 when signed out', async () => {
    await expect(getAccessToken({}, fakeAuth(), codec)).rejects.toMatchObject({
      status: 401,
    });
  });

  it('clearAuth removes tokens and user', () => {
    const session: Record<string, unknown> = {};
    storeTokens(
      session,
      { accessToken: 'a', refreshToken: 'r', expiresIn: 5 },
      codec,
    );
    storeUser(session, { name: 'Sam', picture: 'p' });
    expect(readUser(session)).toEqual({ name: 'Sam', picture: 'p' });
    clearAuth(session);
    expect(isSignedIn(session, codec)).toBe(false);
  });
});

describe('session codec', () => {
  const tokens = { accessToken: 'secret-a', refreshToken: 'secret-r' };

  it('round trips and hides the tokens', () => {
    const session: Record<string, unknown> = {};
    storeTokens(session, { ...tokens, expiresIn: 3600 }, codec, NOW);
    expect(typeof session.aps).toBe('string');
    expect(session.aps).not.toContain('secret');
    expect(
      Buffer.from(session.aps as string, 'base64url').toString(),
    ).not.toContain('secret-a');
    expect(isSignedIn(session, codec, NOW)).toBe(true);
  });

  it('uses a fresh iv for every seal', () => {
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = {};
    storeTokens(a, { ...tokens, expiresIn: 1 }, codec, NOW);
    storeTokens(b, { ...tokens, expiresIn: 1 }, codec, NOW);
    expect(a.aps).not.toBe(b.aps);
  });

  it('rejects tampered, malformed and foreign-secret payloads', () => {
    const session: Record<string, unknown> = {};
    storeTokens(session, { ...tokens, expiresIn: 3600 }, codec, NOW);
    const sealed = session.aps as string;
    const raw = Buffer.from(sealed, 'base64url');
    raw[raw.length - 1] ^= 1;
    expect(isSignedIn({ aps: raw.toString('base64url') }, codec, NOW)).toBe(
      false,
    );
    expect(isSignedIn({ aps: 'not-base64-!!' }, codec, NOW)).toBe(false);
    expect(isSignedIn({ aps: '' }, codec, NOW)).toBe(false);
    expect(isSignedIn(session, createSessionCodec('other-secret'), NOW)).toBe(
      false,
    );
  });

  it('treats old plain-object cookies as signed out', () => {
    const session = {
      aps: { accessToken: 'a', refreshToken: 'r', expiresAt: NOW + 10_000 },
    };
    expect(isSignedIn(session, codec, NOW)).toBe(false);
  });

  it('ends the session after the absolute lifetime, even across refreshes', async () => {
    const session: Record<string, unknown> = {};
    storeTokens(session, { ...tokens, expiresIn: 1 }, codec, NOW);
    const auth = fakeAuth();
    await getAccessToken(session, auth, codec, NOW + 3_600_000);
    expect(isSignedIn(session, codec, NOW + SESSION_MAX_AGE_MS - 1)).toBe(true);
    expect(isSignedIn(session, codec, NOW + SESSION_MAX_AGE_MS)).toBe(false);
    await expect(
      getAccessToken(session, auth, codec, NOW + SESSION_MAX_AGE_MS),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('session robustness', () => {
  it('tolerates a small clock skew but not a large one', () => {
    const session: Record<string, unknown> = {};
    storeTokens(
      session,
      { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 },
      codec,
      NOW,
    );
    expect(isSignedIn(session, codec, NOW - CLOCK_SKEW_MS)).toBe(true);
    expect(isSignedIn(session, codec, NOW - CLOCK_SKEW_MS - 1)).toBe(false);
  });

  it('keeps a realistic session cookie under the size limit', () => {
    const session: Record<string, unknown> = {};
    storeTokens(
      session,
      {
        accessToken: 'a'.repeat(1500),
        refreshToken: 'r'.repeat(100),
        expiresIn: 3600,
      },
      codec,
      NOW,
    );
    storeUser(session, {
      id: 'u'.repeat(30),
      name: 'Sam Smith',
      picture: `https://example.test/${'p'.repeat(180)}`,
    });
    expect(sessionCookieBytes(session)).toBeLessThan(MAX_COOKIE_BYTES);
  });

  it('clears only when the retry flag is set on a rejection', async () => {
    for (const [flag, signedIn] of [
      [false, true],
      [true, false],
    ] as const) {
      const session: Record<string, unknown> = {};
      storeTokens(
        session,
        { accessToken: 'a', refreshToken: 'r-flag', expiresIn: 1 },
        codec,
        NOW,
      );
      const auth = fakeAuth({
        refresh: vi.fn().mockRejectedValue(new HttpError(401, 'x')),
      });
      await expect(
        getAccessToken(session, auth, codec, NOW + 10_000, {
          clearOnRejection: flag,
        }),
      ).rejects.toMatchObject({ status: 401 });
      expect(isSignedIn(session, codec, NOW + 10_000)).toBe(signedIn);
    }
  });
});

describe('session user', () => {
  it('keeps the stable id with the user and leaves it out when missing', () => {
    const session: Record<string, unknown> = {};
    storeUser(session, { id: 'u1', name: 'Sam', picture: null });
    expect(readUser(session)).toEqual({ id: 'u1', name: 'Sam', picture: null });
    storeUser(session, { name: 'Sam', picture: null });
    expect(readUser(session)).toEqual({ name: 'Sam', picture: null });
  });
});
