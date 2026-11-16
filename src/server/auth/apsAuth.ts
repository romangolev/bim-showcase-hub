import { createHash } from 'node:crypto';
import {
  AuthenticationClient,
  ResponseType,
  type Scopes,
  type ThreeLeggedToken,
} from '@aps_sdk/authentication';
import type { SessionUser } from '../../shared/types.js';
import type { ServerConfig } from '../config.js';
import { HttpError, toHttpError } from '../errors.js';
import type { ApsAuth, TokenSet } from './types.js';

type Client = Pick<
  AuthenticationClient,
  'authorize' | 'getThreeLeggedToken' | 'refreshToken' | 'getUserInfo'
>;

export function userIdOf(subject: string): string {
  return createHash('sha256')
    .update(`bsh-user:${subject}`)
    .digest('base64url')
    .slice(0, 32);
}

function toTokenSet(token: ThreeLeggedToken): TokenSet {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in,
  };
}

const REFRESH_REJECTION_STATUSES = [400, 401, 403];

function isRefreshRejection(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as { httpStatusCode?: unknown };
  if (typeof candidate.httpStatusCode !== 'function') return false;
  const status = (candidate.httpStatusCode as () => unknown)();
  return (
    typeof status === 'number' && REFRESH_REJECTION_STATUSES.includes(status)
  );
}

export function createApsAuth(
  config: ServerConfig,
  client: Client = new AuthenticationClient(),
): ApsAuth {
  const { clientId, clientSecret, callbackUrl } = config.aps;
  const scopes = config.aps.scopes as Scopes[];
  return {
    authorizeUrl: (state) =>
      client.authorize(clientId, ResponseType.Code, callbackUrl, scopes, {
        state,
      }),
    exchangeCode: async (code) => {
      try {
        return toTokenSet(
          await client.getThreeLeggedToken(clientId, code, callbackUrl, {
            clientSecret,
          }),
        );
      } catch (err) {
        throw toHttpError(err);
      }
    },
    refresh: async (refreshToken) => {
      try {
        return toTokenSet(
          await client.refreshToken(refreshToken, clientId, {
            clientSecret,
            scopes,
          }),
        );
      } catch (err) {
        throw isRefreshRejection(err)
          ? new HttpError(401, 'Session expired')
          : toHttpError(err);
      }
    },
    getUser: async (accessToken) => {
      try {
        const info = await client.getUserInfo(accessToken);
        const name =
          info.name ||
          [info.given_name, info.family_name].filter(Boolean).join(' ') ||
          info.preferred_username ||
          'Autodesk user';
        const user: SessionUser = { name, picture: info.picture ?? null };
        if (info.sub) user.id = userIdOf(info.sub);
        return user;
      } catch (err) {
        throw toHttpError(err);
      }
    },
  };
}
