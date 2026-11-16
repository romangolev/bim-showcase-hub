import type { SessionUser } from '../../shared/types.js';
import { HttpError, toHttpError } from '../errors.js';
import type { ApsAuth, TokenSet } from './types.js';

export type SessionStore = Record<string, unknown>;

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

const EXPIRY_SKEW_MS = 60_000;

function readTokens(session: SessionStore): StoredTokens | null {
  const value = session.aps as Partial<StoredTokens> | undefined;
  if (
    value &&
    typeof value.accessToken === 'string' &&
    typeof value.refreshToken === 'string' &&
    typeof value.expiresAt === 'number'
  ) {
    return value as StoredTokens;
  }
  return null;
}

export function storeTokens(
  session: SessionStore,
  tokens: TokenSet,
  now: number = Date.now(),
): void {
  session.aps = {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: now + tokens.expiresIn * 1000,
  } satisfies StoredTokens;
}

export function storeUser(session: SessionStore, user: SessionUser): void {
  session.user = { name: user.name, picture: user.picture };
}

export function readUser(session: SessionStore): SessionUser | null {
  const value = session.user as Partial<SessionUser> | undefined;
  if (value && typeof value.name === 'string') {
    return { name: value.name, picture: value.picture ?? null };
  }
  return null;
}

export function isSignedIn(session: SessionStore): boolean {
  return readTokens(session) !== null;
}

export function clearAuth(session: SessionStore): void {
  delete session.aps;
  delete session.user;
}

export interface AccessToken {
  accessToken: string;
  expiresIn: number;
}

const inflightRefreshes = new Map<string, Promise<TokenSet>>();

function refreshOnce(auth: ApsAuth, refreshToken: string): Promise<TokenSet> {
  const existing = inflightRefreshes.get(refreshToken);
  if (existing) return existing;
  const pending = auth.refresh(refreshToken).finally(() => {
    inflightRefreshes.delete(refreshToken);
  });
  inflightRefreshes.set(refreshToken, pending);
  return pending;
}

export async function getAccessToken(
  session: SessionStore,
  auth: ApsAuth,
  now: number = Date.now(),
): Promise<AccessToken> {
  const tokens = readTokens(session);
  if (!tokens) {
    throw new HttpError(401, 'Not signed in');
  }
  if (tokens.expiresAt - EXPIRY_SKEW_MS > now) {
    return {
      accessToken: tokens.accessToken,
      expiresIn: Math.floor((tokens.expiresAt - now) / 1000),
    };
  }
  try {
    const refreshed = await refreshOnce(auth, tokens.refreshToken);
    storeTokens(session, refreshed, now);
    return {
      accessToken: refreshed.accessToken,
      expiresIn: refreshed.expiresIn,
    };
  } catch (err) {
    const failure = toHttpError(err);
    if (failure.status === 401) {
      clearAuth(session);
      throw new HttpError(401, 'Session expired');
    }
    throw new HttpError(502, 'Upstream service error');
  }
}
