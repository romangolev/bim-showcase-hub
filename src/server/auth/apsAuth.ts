import {
  AuthenticationClient,
  ResponseType,
  type Scopes,
  type ThreeLeggedToken,
} from '@aps_sdk/authentication';
import type { ServerConfig } from '../config.js';
import { toHttpError } from '../errors.js';
import type { ApsAuth, TokenSet } from './types.js';

type Client = Pick<
  AuthenticationClient,
  'authorize' | 'getThreeLeggedToken' | 'refreshToken' | 'getUserInfo'
>;

function toTokenSet(token: ThreeLeggedToken): TokenSet {
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in,
  };
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
        throw toHttpError(err);
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
        return { name, picture: info.picture ?? null };
      } catch (err) {
        throw toHttpError(err);
      }
    },
  };
}
