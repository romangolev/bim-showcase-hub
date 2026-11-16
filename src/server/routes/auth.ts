import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { SessionUser, ViewerToken } from '../../shared/types.js';
import {
  clearAuth,
  getAccessToken,
  isSignedIn,
  readUser,
  storeTokens,
  storeUser,
} from '../auth/sessionTokens.js';
import type { ApsAuth } from '../auth/types.js';
import type { ServerConfig } from '../config.js';
import { HttpError } from '../errors.js';
import { MOCK_USER, MOCK_VIEWER_TOKEN } from '../mock/index.js';
import { sessionOf } from './session.js';

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

export function authRouter(config: ServerConfig, auth: ApsAuth): Router {
  const router = Router();

  router.get('/session', (req, res) => {
    if (config.mock) {
      res.json(MOCK_USER satisfies SessionUser);
      return;
    }
    const session = sessionOf(req);
    const user = readUser(session);
    if (!user || !isSignedIn(session)) {
      throw new HttpError(401, 'Not signed in');
    }
    res.json(user satisfies SessionUser);
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
      throw new HttpError(400, 'Invalid state');
    }
    if (firstString(req.query.error)) {
      res.redirect('/?auth_error=access_denied');
      return;
    }
    const code = firstString(req.query.code);
    if (!code) {
      throw new HttpError(400, 'Missing code');
    }
    const tokens = await auth.exchangeCode(code);
    const user = await auth.getUser(tokens.accessToken);
    storeTokens(session, tokens);
    storeUser(session, user);
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
    const token = await getAccessToken(sessionOf(req), auth);
    const body: ViewerToken = {
      access_token: token.accessToken,
      expires_in: token.expiresIn,
    };
    res.json(body);
  });

  return router;
}
