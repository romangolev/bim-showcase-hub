import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';
import type { SessionUser } from '../../shared/types.js';
import { HttpError, toHttpError } from '../errors.js';
import type { ApsAuth, TokenSet } from './types.js';

export type SessionStore = Record<string, unknown>;

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  issuedAt: number;
  renewedAt: number;
}

export interface SessionCodec {
  seal(value: StoredTokens): string;
  open(sealed: unknown): StoredTokens | null;
}

const EXPIRY_SKEW_MS = 60_000;
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const CLOCK_SKEW_MS = 5 * 60 * 1000;
export const MAX_COOKIE_BYTES = 3800;
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function createSessionCodec(secret: string): SessionCodec {
  const key = Buffer.from(
    hkdfSync('sha256', secret, 'bim-hub-session', 'aps-tokens-v1', 32),
  );
  return {
    seal(value) {
      const iv = randomBytes(IV_BYTES);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([
        cipher.update(JSON.stringify(value), 'utf8'),
        cipher.final(),
      ]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString(
        'base64url',
      );
    },
    open(sealed) {
      if (typeof sealed !== 'string') return null;
      try {
        const raw = Buffer.from(sealed, 'base64url');
        if (raw.length <= IV_BYTES + TAG_BYTES) return null;
        const decipher = createDecipheriv(
          'aes-256-gcm',
          key,
          raw.subarray(0, IV_BYTES),
        );
        decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
        const json = Buffer.concat([
          decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)),
          decipher.final(),
        ]).toString('utf8');
        const value = JSON.parse(json) as Partial<StoredTokens>;
        if (
          typeof value.accessToken === 'string' &&
          typeof value.refreshToken === 'string' &&
          typeof value.expiresAt === 'number' &&
          typeof value.issuedAt === 'number'
        ) {
          return {
            accessToken: value.accessToken,
            refreshToken: value.refreshToken,
            expiresAt: value.expiresAt,
            issuedAt: value.issuedAt,
            renewedAt:
              typeof value.renewedAt === 'number'
                ? value.renewedAt
                : value.issuedAt,
          };
        }
        return null;
      } catch {
        return null;
      }
    },
  };
}

function readTokens(
  session: SessionStore,
  codec: SessionCodec,
  now: number = Date.now(),
): StoredTokens | null {
  const tokens = codec.open(session.aps);
  if (!tokens) return null;
  if (
    now >= expiryOf(tokens) ||
    tokens.issuedAt - now > CLOCK_SKEW_MS ||
    tokens.renewedAt - now > CLOCK_SKEW_MS
  ) {
    return null;
  }
  return tokens;
}

function expiryOf(tokens: StoredTokens): number {
  return Math.min(
    tokens.renewedAt + SESSION_MAX_AGE_MS,
    tokens.issuedAt + SESSION_ABSOLUTE_MAX_AGE_MS,
  );
}

export function sessionExpiresAt(
  session: SessionStore,
  codec: SessionCodec,
  now: number = Date.now(),
): number | null {
  const tokens = readTokens(session, codec, now);
  return tokens ? expiryOf(tokens) : null;
}

export function storeTokens(
  session: SessionStore,
  tokens: TokenSet,
  codec: SessionCodec,
  now: number = Date.now(),
  issuedAt: number = now,
  renewedAt: number = now,
): void {
  session.aps = codec.seal({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: now + tokens.expiresIn * 1000,
    issuedAt,
    renewedAt,
  });
}

export function sessionCookieBytes(session: SessionStore): number {
  return Buffer.from(JSON.stringify(session)).toString('base64').length;
}

export function storeUser(session: SessionStore, user: SessionUser): void {
  session.user = user.id
    ? { id: user.id, name: user.name, picture: user.picture }
    : { name: user.name, picture: user.picture };
}

export function readUser(session: SessionStore): SessionUser | null {
  const value = session.user as Partial<SessionUser> | undefined;
  if (value && typeof value.name === 'string') {
    const user: SessionUser = {
      name: value.name,
      picture: value.picture ?? null,
    };
    if (typeof value.id === 'string' && value.id) user.id = value.id;
    return user;
  }
  return null;
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

const REFRESH_REPLAY_WINDOW_MS = 2 * 60 * 1000;
const REFRESH_REPLAY_LIMIT = 500;

interface RefreshReplay {
  tokens: TokenSet;
  issuedAt: number;
  expiresAt: number;
}

const refreshReplays = new WeakMap<ApsAuth, Map<string, RefreshReplay>>();

function replaysFor(auth: ApsAuth): Map<string, RefreshReplay> {
  const existing = refreshReplays.get(auth);
  if (existing) return existing;
  const created = new Map<string, RefreshReplay>();
  refreshReplays.set(auth, created);
  return created;
}

function rememberRefresh(
  auth: ApsAuth,
  refreshToken: string,
  tokens: TokenSet,
  now: number,
): void {
  const replays = replaysFor(auth);
  replays.delete(refreshToken);
  replays.set(refreshToken, {
    tokens,
    issuedAt: now,
    expiresAt: now + tokens.expiresIn * 1000,
  });
  while (replays.size > REFRESH_REPLAY_LIMIT) {
    const oldest = replays.keys().next().value;
    if (oldest === undefined) return;
    replays.delete(oldest);
  }
}

function replayRefresh(
  auth: ApsAuth,
  refreshToken: string,
  now: number,
): TokenSet | null {
  const replays = refreshReplays.get(auth);
  if (!replays) return null;
  const entry = replays.get(refreshToken);
  if (!entry) return null;
  if (
    now - entry.issuedAt > REFRESH_REPLAY_WINDOW_MS ||
    now >= entry.expiresAt
  ) {
    replays.delete(refreshToken);
    return null;
  }
  return {
    ...entry.tokens,
    expiresIn: Math.floor((entry.expiresAt - now) / 1000),
  };
}

function refreshOnce(auth: ApsAuth, refreshToken: string): Promise<TokenSet> {
  const existing = inflightRefreshes.get(refreshToken);
  if (existing) return existing;
  const pending = auth.refresh(refreshToken).finally(() => {
    inflightRefreshes.delete(refreshToken);
  });
  inflightRefreshes.set(refreshToken, pending);
  return pending;
}

async function refreshTokens(
  auth: ApsAuth,
  refreshToken: string,
  now: number,
): Promise<TokenSet> {
  const replayed = replayRefresh(auth, refreshToken, now);
  if (replayed) return replayed;
  try {
    const refreshed = await refreshOnce(auth, refreshToken);
    rememberRefresh(auth, refreshToken, refreshed, now);
    return refreshed;
  } catch (err) {
    if (toHttpError(err).status !== 401) {
      throw new HttpError(502, 'Upstream service error');
    }
    const late = replayRefresh(auth, refreshToken, now);
    if (late) return late;
    throw new HttpError(401, 'Session expired');
  }
}

export async function getAccessToken(
  session: SessionStore,
  auth: ApsAuth,
  codec: SessionCodec,
  now: number = Date.now(),
  options: { clearOnRejection?: boolean } = {},
): Promise<AccessToken> {
  const tokens = readTokens(session, codec, now);
  if (!tokens) {
    throw new HttpError(401, 'Not signed in');
  }
  if (tokens.expiresAt - EXPIRY_SKEW_MS > now) {
    return {
      accessToken: tokens.accessToken,
      expiresIn: Math.floor((tokens.expiresAt - now) / 1000),
    };
  }
  let refreshed: TokenSet;
  try {
    refreshed = await refreshTokens(auth, tokens.refreshToken, now);
  } catch (err) {
    if (toHttpError(err).status === 401 && options.clearOnRejection) {
      clearAuth(session);
    }
    throw err;
  }
  storeTokens(session, refreshed, codec, now, tokens.issuedAt, now);
  if (sessionCookieBytes(session) > MAX_COOKIE_BYTES) {
    const user = readUser(session);
    if (user) storeUser(session, { ...user, picture: null });
  }
  if (sessionCookieBytes(session) > MAX_COOKIE_BYTES) {
    clearAuth(session);
    throw new HttpError(401, 'Session too large, sign in again');
  }
  return {
    accessToken: refreshed.accessToken,
    expiresIn: refreshed.expiresIn,
  };
}
