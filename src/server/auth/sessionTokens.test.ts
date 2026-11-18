import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../errors.js';
import {
  CLOCK_SKEW_MS,
  clearAuth,
  createSessionCodec,
  getAccessToken,
  MAX_COOKIE_BYTES,
  readUser,
  SESSION_ABSOLUTE_MAX_AGE_MS,
  SESSION_MAX_AGE_MS,
  sessionCookieBytes,
  sessionExpiresAt,
  storeTokens,
  storeUser,
} from './sessionTokens.js';
import type { ApsAuth } from './types.js';

const isSignedIn = (
  session: Parameters<typeof sessionExpiresAt>[0],
  codec: Parameters<typeof sessionExpiresAt>[1],
  now?: number,
) => sessionExpiresAt(session, codec, now) !== null;

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
    revoke: vi.fn(),
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

  it('ends the session 12 hours after the last refresh', async () => {
    const session: Record<string, unknown> = {};
    storeTokens(session, { ...tokens, expiresIn: 1 }, codec, NOW);
    const auth = fakeAuth();
    await getAccessToken(session, auth, codec, NOW + 3_600_000);
    const end = NOW + 3_600_000 + SESSION_MAX_AGE_MS;
    expect(isSignedIn(session, codec, end - 1)).toBe(true);
    expect(isSignedIn(session, codec, end)).toBe(false);
    await expect(
      getAccessToken(session, auth, codec, end),
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

  it.each([
    [800, 800],
    [1500, 0],
  ])(
    'keeps a %i char token cookie %i bytes under the limit',
    (length, headroom) => {
      const random = (n: number) =>
        randomBytes(n).toString('base64url').slice(0, n);
      const session: Record<string, unknown> = {};
      storeTokens(
        session,
        {
          accessToken: random(length),
          refreshToken: random(100),
          expiresIn: 3600,
        },
        codec,
        NOW,
      );
      storeUser(session, {
        id: random(30),
        name: 'Sam Smith',
        picture: `https://example.test/${random(180)}`,
      });
      expect(sessionCookieBytes(session)).toBeLessThan(
        MAX_COOKIE_BYTES - headroom,
      );
    },
  );

  it('keeps the new tokens and drops the picture when the cookie is too large', async () => {
    const session: Record<string, unknown> = {};
    storeTokens(
      session,
      { accessToken: 'a', refreshToken: 'old-r', expiresIn: 1 },
      codec,
      NOW,
    );
    storeUser(session, {
      name: 'Sam',
      picture: `https://example.test/${'x'.repeat(MAX_COOKIE_BYTES)}`,
    });
    const auth = fakeAuth();
    await expect(
      getAccessToken(session, auth, codec, NOW + 10_000),
    ).resolves.toMatchObject({ accessToken: 'new-access' });
    expect(readUser(session)).toEqual({ name: 'Sam', picture: null });
    expect(sessionCookieBytes(session)).toBeLessThanOrEqual(MAX_COOKIE_BYTES);
    await getAccessToken(session, auth, codec, NOW + 10_000 + 3_600_000);
    expect(auth.refresh).toHaveBeenLastCalledWith('new-refresh');
  });

  it('clears the session instead of keeping a dead token when still too large', async () => {
    const session: Record<string, unknown> = {};
    storeTokens(
      session,
      { accessToken: 'a', refreshToken: 'old-r', expiresIn: 1 },
      codec,
      NOW,
    );
    const auth = fakeAuth({
      refresh: vi.fn().mockResolvedValue({
        accessToken: 'x'.repeat(MAX_COOKIE_BYTES),
        refreshToken: 'new-refresh',
        expiresIn: 3600,
      }),
    });
    await expect(
      getAccessToken(session, auth, codec, NOW + 10_000),
    ).rejects.toMatchObject({ status: 401 });
    expect(isSignedIn(session, codec, NOW + 10_000)).toBe(false);
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

describe('rolling session', () => {
  const tokens = { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 };
  const fresh = () => {
    const session: Record<string, unknown> = {};
    storeTokens(session, tokens, codec, NOW);
    return session;
  };

  it('ends 12 hours after sign-in when no refresh is needed', async () => {
    const session = fresh();
    const auth = fakeAuth();
    await getAccessToken(session, auth, codec, NOW + 1000);
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(sessionExpiresAt(session, codec, NOW + 1000)).toBe(
      NOW + SESSION_MAX_AGE_MS,
    );
  });

  it('moves the expiry when a refresh happens', async () => {
    const session = fresh();
    const at = NOW + 3600_000 + 1;
    await getAccessToken(session, fakeAuth(), codec, at);
    expect(sessionExpiresAt(session, codec, at)).toBe(at + SESSION_MAX_AGE_MS);
  });

  it('never outlives the 7 day cap, however often it refreshes', async () => {
    const session = fresh();
    let at = NOW;
    while (at + 3600_000 < NOW + SESSION_ABSOLUTE_MAX_AGE_MS) {
      at += 3600_000;
      await getAccessToken(session, fakeAuth(), codec, at);
      expect(isSignedIn(session, codec, at)).toBe(true);
    }
    const cap = NOW + SESSION_ABSOLUTE_MAX_AGE_MS;
    expect(sessionExpiresAt(session, codec, at)).toBeLessThanOrEqual(cap);
    expect(isSignedIn(session, codec, cap - 1)).toBe(true);
    expect(isSignedIn(session, codec, cap)).toBe(false);
  });

  it('keeps the refreshed refresh token across parallel requests', async () => {
    const first = fresh();
    const second = { aps: first.aps };
    const auth = fakeAuth();
    const at = NOW + 3600_000 + 1;
    await Promise.all([
      getAccessToken(first, auth, codec, at),
      getAccessToken(second, auth, codec, at),
    ]);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    for (const session of [first, second]) {
      expect(codec.open(session.aps)?.refreshToken).toBe('new-refresh');
    }
  });

  it('treats a cookie without a renewal time as renewed at sign-in', () => {
    const sealed = codec.seal({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: NOW + 1000,
      issuedAt: NOW,
    } as never);
    expect(sessionExpiresAt({ aps: sealed }, codec, NOW)).toBe(
      NOW + SESSION_MAX_AGE_MS,
    );
  });
});
