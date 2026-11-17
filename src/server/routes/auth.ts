import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { SessionUser, ViewerToken } from '../../shared/types.js';
import {
  clearAuth,
  getAccessToken,
  isSignedIn,
  MAX_COOKIE_BYTES,
  readUser,
  type SessionCodec,
  sessionCookieBytes,
  storeTokens,
  storeUser,
} from '../auth/sessionTokens.js';
import type { ApsAuth } from '../auth/types.js';
import type { ServerConfig } from '../config.js';
import { HttpError } from '../errors.js';
import {
  MOCK_APP_CLIENT_ID,
  MOCK_USER,
  MOCK_VIEWER_TOKEN,
} from '../mock/index.js';
import { clearOnRejection, sessionOf } from './session.js';

function statesMatch(expected: unknown, received: unknown): boolean {
  if (typeof expected !== 'string' || typeof received !== 'string') {
    return false;
  }
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

function firstString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function authErrorUrl(code: string): string {
  return `/?auth_error=${code}`;
}

export function authRouter(
  config: ServerConfig,
  auth: ApsAuth,
  codec: SessionCodec,
): Router {
  const router = Router();

  router.use(['/session', '/viewer/token'], (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/session', (req, res) => {
    if (config.mock) {
      res.json({
        ...MOCK_USER,
        appClientId: MOCK_APP_CLIENT_ID,
      } satisfies SessionUser);
      return;
    }
    const session = sessionOf(req);
    const user = readUser(session);
    if (!user || !isSignedIn(session, codec)) {
      throw new HttpError(401, 'Not signed in');
    }
    res.json({
      ...user,
      appClientId: config.aps.clientId,
    } satisfies SessionUser);
  });

  router.get('/auth/url', (req, res) => {
    if (config.mock) {
      res.json({ url: '/' });
      return;
    }
    const state = randomBytes(24).toString('base64url');
    sessionOf(req).oauthState = state;
    res.json({ url: auth.authorizeUrl(state) });
  });

  router.get('/auth/callback', async (req, res) => {
    if (config.mock) {
      res.redirect('/');
      return;
    }
    const session = sessionOf(req);
    const expected = session.oauthState;
    delete session.oauthState;
    if (!statesMatch(expected, req.query.state)) {
      res.redirect(authErrorUrl('invalid_state'));
      return;
    }
    if (firstString(req.query.error)) {
      res.redirect(authErrorUrl('access_denied'));
      return;
    }
    const code = firstString(req.query.code);
    if (!code) {
      res.redirect(authErrorUrl('missing_code'));
      return;
    }
    try {
      const tokens = await auth.exchangeCode(code);
      const user = await auth.getUser(tokens.accessToken);
      storeTokens(session, tokens, codec);
      storeUser(session, user);
      if (sessionCookieBytes(session) > MAX_COOKIE_BYTES) {
        throw new Error('session too large');
      }
    } catch (error) {
      const label = error instanceof Error ? error.message : typeof error;
      console.error(`sign-in failed: ${label}`);
      clearAuth(session);
      res.redirect(authErrorUrl('upstream_error'));
      return;
    }
    res.redirect('/');
  });

  router.post('/auth/signout', (req, res) => {
    if (!config.mock && req.session) {
      clearAuth(sessionOf(req));
    }
    req.session = null;
    res.status(204).end();
  });

  router.get('/viewer/token', async (req, res) => {
    if (config.mock) {
      res.json(MOCK_VIEWER_TOKEN satisfies ViewerToken);
      return;
    }
    const token = await getAccessToken(
      sessionOf(req),
      auth,
      codec,
      Date.now(),
      clearOnRejection(req),
    );
    const body: ViewerToken = {
      access_token: token.accessToken,
      expires_in: token.expiresIn,
    };
    res.json(body);
  });

  return router;
}
