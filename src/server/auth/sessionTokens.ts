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
}

export interface SessionCodec {
  seal(value: StoredTokens): string;
  open(sealed: unknown): StoredTokens | null;
}

const EXPIRY_SKEW_MS = 60_000;
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
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
          return value as StoredTokens;
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
    now - tokens.issuedAt >= SESSION_MAX_AGE_MS ||
    tokens.issuedAt - now > CLOCK_SKEW_MS
  ) {
    return null;
  }
  return tokens;
}

export function sessionExpiresAt(
  session: SessionStore,
  codec: SessionCodec,
  now: number = Date.now(),
): number | null {
  const tokens = readTokens(session, codec, now);
  return tokens ? tokens.issuedAt + SESSION_MAX_AGE_MS : null;
}

export function storeTokens(
  session: SessionStore,
  tokens: TokenSet,
  codec: SessionCodec,
  now: number = Date.now(),
  issuedAt: number = now,
): void {
  session.aps = codec.seal({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: now + tokens.expiresIn * 1000,
    issuedAt,
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

export function isSignedIn(
  session: SessionStore,
  codec: SessionCodec,
  now: number = Date.now(),
): boolean {
  return readTokens(session, codec, now) !== null;
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
  try {
    const refreshed = await refreshOnce(auth, tokens.refreshToken);
    storeTokens(session, refreshed, codec, now, tokens.issuedAt);
    return {
      accessToken: refreshed.accessToken,
      expiresIn: refreshed.expiresIn,
    };
  } catch (err) {
    const failure = toHttpError(err);
    if (failure.status === 401) {
      if (options.clearOnRejection) clearAuth(session);
      throw new HttpError(401, 'Session expired');
    }
    throw new HttpError(502, 'Upstream service error');
  }
}
