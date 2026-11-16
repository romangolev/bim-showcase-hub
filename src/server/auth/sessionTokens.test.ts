import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../errors.js';
import {
  clearAuth,
  getAccessToken,
  isSignedIn,
  readUser,
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

describe('sessionTokens', () => {
  it('returns a live token without refreshing', async () => {
    const session: Record<string, unknown> = {};
    storeTokens(
      session,
      { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 },
      NOW,
    );
    const auth = fakeAuth();
    const token = await getAccessToken(session, auth, NOW + 1000);
    expect(token).toEqual({ accessToken: 'a', expiresIn: 3599 });
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('refreshes an expiring token and stores the result', async () => {
    const session: Record<string, unknown> = {};
    storeTokens(
      session,
      { accessToken: 'a', refreshToken: 'r', expiresIn: 3600 },
      NOW,
    );
    const auth = fakeAuth();
    const token = await getAccessToken(session, auth, NOW + 3_590_000);
    expect(auth.refresh).toHaveBeenCalledWith('r');
    expect(token.accessToken).toBe('new-access');
    const again = await getAccessToken(session, auth, NOW + 3_600_000);
    expect(again.accessToken).toBe('new-access');
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('clears the session and reports 401 when refresh fails', async () => {
    const session: Record<string, unknown> = {};
    storeTokens(
      session,
      { accessToken: 'a', refreshToken: 'r', expiresIn: 1 },
      NOW,
    );
    storeUser(session, { name: 'Sam', picture: null });
    const auth = fakeAuth({
      refresh: vi.fn().mockRejectedValue(new HttpError(401, 'Session expired')),
    });
    await expect(
      getAccessToken(session, auth, NOW + 10_000),
    ).rejects.toMatchObject({
      status: 401,
    });
    expect(isSignedIn(session)).toBe(false);
    expect(readUser(session)).toBeNull();
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
        NOW,
      );
      storeUser(session, { name: 'Sam', picture: null });
      const auth = fakeAuth({ refresh: vi.fn().mockRejectedValue(failure) });
      await expect(
        getAccessToken(session, auth, NOW + 10_000),
      ).rejects.toMatchObject({ status: 502 });
      expect(isSignedIn(session)).toBe(true);
      expect(readUser(session)).not.toBeNull();
    }
  });

  it('shares one refresh between concurrent callers', async () => {
    const sessions = [{}, {}].map(() => {
      const session: Record<string, unknown> = {};
      storeTokens(
        session,
        { accessToken: 'a', refreshToken: 'r-shared', expiresIn: 1 },
        NOW,
      );
      return session;
    });
    const auth = fakeAuth();
    const results = await Promise.all(
      sessions.map((s) => getAccessToken(s, auth, NOW + 10_000)),
    );
    expect(auth.refresh).toHaveBeenCalledTimes(1);
    expect(results.map((r) => r.accessToken)).toEqual([
      'new-access',
      'new-access',
    ]);
    for (const session of sessions) expect(isSignedIn(session)).toBe(true);
  });

  it('reports 401 when signed out', async () => {
    await expect(getAccessToken({}, fakeAuth())).rejects.toMatchObject({
      status: 401,
    });
  });

  it('clearAuth removes tokens and user', () => {
    const session: Record<string, unknown> = {};
    storeTokens(session, { accessToken: 'a', refreshToken: 'r', expiresIn: 5 });
    storeUser(session, { name: 'Sam', picture: 'p' });
    expect(readUser(session)).toEqual({ name: 'Sam', picture: 'p' });
    clearAuth(session);
    expect(isSignedIn(session)).toBe(false);
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
