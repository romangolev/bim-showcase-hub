import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApsAuth } from './auth/types.js';
import { loadConfig } from './config.js';
import type { DataService } from './data/types.js';
import { HttpError } from './errors.js';
import { createApp } from './index.js';
import { createMockDataService } from './mock/index.js';

function fakeAuth(overrides: Partial<ApsAuth> = {}): ApsAuth {
  return {
    authorizeUrl: (state) => `https://aps.test/authorize?state=${state}`,
    exchangeCode: vi.fn().mockResolvedValue({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 3600,
    }),
    refresh: vi.fn().mockResolvedValue({
      accessToken: 'access-2',
      refreshToken: 'refresh-2',
      expiresIn: 3600,
    }),
    getUser: vi.fn().mockResolvedValue({ name: 'Sam Smith', picture: null }),
    ...overrides,
  };
}

const realConfig = loadConfig({ SESSION_SECRET: 'test-secret' });

function realApp(
  auth = fakeAuth(),
  data: DataService = createMockDataService(),
) {
  return createApp(realConfig, { auth, data });
}

async function signIn(agent: ReturnType<typeof request.agent>) {
  const urlRes = await agent.get('/api/auth/url');
  const state = new URL(urlRes.body.url).searchParams.get('state');
  return agent.get('/api/auth/callback').query({ code: 'abc', state });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('session and auth', () => {
  it('returns 401 json when signed out', async () => {
    const res = await request(realApp()).get('/api/session');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Not signed in' });
  });

  it('protects data and viewer routes when signed out', async () => {
    const app = realApp();
    for (const url of ['/api/hubs', '/api/viewer/token']) {
      expect((await request(app).get(url)).status, url).toBe(401);
    }
  });

  it('issues a v2 authorize url carrying a state', async () => {
    const res = await request(realApp()).get('/api/auth/url');
    expect(res.status).toBe(200);
    expect(new URL(res.body.url).searchParams.get('state')).toBeTruthy();
  });

  it('completes the callback, then serves session, data and viewer token', async () => {
    const auth = fakeAuth();
    const agent = request.agent(realApp(auth));
    const cb = await signIn(agent);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toBe('/');
    expect(auth.exchangeCode).toHaveBeenCalledWith('abc');

    const session = await agent.get('/api/session');
    expect(session.status).toBe(200);
    expect(session.body).toEqual({
      name: 'Sam Smith',
      picture: null,
      appClientId: realConfig.aps.clientId,
    });

    const token = await agent.get('/api/viewer/token');
    expect(token.status).toBe(200);
    expect(token.body.access_token).toBe('access-1');
    expect(token.body.expires_in).toBeGreaterThan(0);

    expect((await agent.get('/api/hubs')).status).toBe(200);
  });

  it('returns the stable user id with the session', async () => {
    const auth = fakeAuth({
      getUser: vi.fn().mockResolvedValue({
        id: 'hashed-1',
        name: 'Sam Smith',
        picture: null,
      }),
    });
    const agent = request.agent(realApp(auth));
    await signIn(agent);
    const session = await agent.get('/api/session');
    expect(session.body).toMatchObject({
      id: 'hashed-1',
      name: 'Sam Smith',
      picture: null,
    });
  });

  it('sends no-store on session and token responses', async () => {
    const agent = request.agent(realApp());
    await signIn(agent);
    for (const url of ['/api/session', '/api/viewer/token']) {
      const res = await agent.get(url);
      expect(res.headers['cache-control'], url).toBe('no-store');
    }
    const signedOut = await request(realApp()).get('/api/session');
    expect(signedOut.headers['cache-control']).toBe('no-store');
  });

  it('does not expose tokens in the session response or cookie value', async () => {
    const agent = request.agent(realApp());
    const callback = await signIn(agent);
    const cookies = ([] as string[]).concat(
      callback.headers['set-cookie'] ?? [],
    );
    for (const c of cookies) {
      const value = decodeURIComponent(c.split(';')[0].split('=')[1]);
      const decoded = Buffer.from(value, 'base64').toString();
      expect(decoded).not.toContain('access-1');
      expect(decoded).not.toContain('refresh-1');
    }
    const session = await agent.get('/api/session');
    expect(JSON.stringify(session.body)).not.toContain('access-1');
  });

  it('returns the app client id only when signed in and never a secret', async () => {
    const config = loadConfig({
      SESSION_SECRET: 'test-session-secret',
      APS_CLIENT_ID: 'public-client-id',
      APS_CLIENT_SECRET: 'private-client-secret',
    });
    const app = createApp(config, {
      auth: fakeAuth(),
      data: createMockDataService(),
    });
    expect((await request(app).get('/api/session')).status).toBe(401);
    const agent = request.agent(app);
    await signIn(agent);
    const session = await agent.get('/api/session');
    expect(session.body.appClientId).toBe('public-client-id');
    const text = JSON.stringify(session.body);
    expect(text).not.toContain('private-client-secret');
    expect(text).not.toContain('test-session-secret');
  });

  it('rejects a callback with a wrong or missing state', async () => {
    const agent = request.agent(realApp());
    await agent.get('/api/auth/url');
    const wrong = await agent
      .get('/api/auth/callback')
      .query({ code: 'abc', state: 'forged' });
    expect(wrong.status).toBe(302);
    expect(wrong.headers.location).toBe('/?auth_error=invalid_state');
    const missing = await request(realApp())
      .get('/api/auth/callback')
      .query({ code: 'abc' });
    expect(missing.status).toBe(302);
    expect(missing.headers.location).toBe('/?auth_error=invalid_state');
  });

  it('consumes the state so it cannot be replayed', async () => {
    const agent = request.agent(realApp());
    const urlRes = await agent.get('/api/auth/url');
    const state = new URL(urlRes.body.url).searchParams.get('state');
    await agent.get('/api/auth/callback').query({ code: 'abc', state });
    const replay = await agent
      .get('/api/auth/callback')
      .query({ code: 'abc', state });
    expect(replay.status).toBe(302);
    expect(replay.headers.location).toBe('/?auth_error=invalid_state');
  });

  it('requires a code after a valid state', async () => {
    const agent = request.agent(realApp());
    const urlRes = await agent.get('/api/auth/url');
    const state = new URL(urlRes.body.url).searchParams.get('state');
    const res = await agent.get('/api/auth/callback').query({ state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/?auth_error=missing_code');
  });

  it('redirects with an upstream error when the code exchange fails', async () => {
    const auth = fakeAuth({
      exchangeCode: vi
        .fn()
        .mockRejectedValue(new HttpError(502, 'Upstream service error')),
    });
    const agent = request.agent(realApp(auth));
    const res = await signIn(agent);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/?auth_error=upstream_error');
    expect((await agent.get('/api/session')).status).toBe(401);
  });

  it('redirects home when the user denies access', async () => {
    const agent = request.agent(realApp());
    const urlRes = await agent.get('/api/auth/url');
    const state = new URL(urlRes.body.url).searchParams.get('state');
    const res = await agent
      .get('/api/auth/callback')
      .query({ error: 'access_denied', state });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/?auth_error=access_denied');
    expect((await agent.get('/api/session')).status).toBe(401);
  });

  it('signout clears the session', async () => {
    const agent = request.agent(realApp());
    await signIn(agent);
    const out = await agent.post('/api/auth/signout');
    expect(out.status).toBe(204);
    expect((await agent.get('/api/session')).status).toBe(401);
    expect((await agent.get('/api/hubs')).status).toBe(401);
  });

  it('signout is fine when never signed in', async () => {
    const res = await request(realApp()).post('/api/auth/signout');
    expect(res.status).toBe(204);
  });

  it('answers 401 and keeps the cookie when refresh is rejected', async () => {
    const auth = fakeAuth({
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
        expiresIn: 0,
      }),
      refresh: vi.fn().mockRejectedValue(new HttpError(401, 'Session expired')),
    });
    const agent = request.agent(realApp(auth));
    await signIn(agent);
    const res = await agent.get('/api/viewer/token');
    expect(res.status).toBe(401);
    expect((await agent.get('/api/session')).status).toBe(200);
  });

  it('clears the session when a retried request meets a refresh rejection', async () => {
    const auth = fakeAuth({
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
        expiresIn: 0,
      }),
      refresh: vi.fn().mockRejectedValue(new HttpError(401, 'Session expired')),
    });
    const agent = request.agent(realApp(auth));
    await signIn(agent);
    const res = await agent.get('/api/viewer/token').set('X-Auth-Retry', '1');
    expect(res.status).toBe(401);
    expect((await agent.get('/api/session')).status).toBe(401);
  });

  it('redirects with upstream_error when the session would be too large', async () => {
    const auth = fakeAuth({
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'a'.repeat(4000),
        refreshToken: 'r',
        expiresIn: 3600,
      }),
    });
    const res = await signIn(request.agent(realApp(auth)));
    expect(res.headers.location).toBe('/?auth_error=upstream_error');
  });

  it('answers 502 and keeps the session when refresh is transiently down', async () => {
    const auth = fakeAuth({
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'a',
        refreshToken: 'r',
        expiresIn: 0,
      }),
      refresh: vi.fn().mockRejectedValue(new Error('network')),
    });
    const agent = request.agent(realApp(auth));
    await signIn(agent);
    const res = await agent.get('/api/viewer/token');
    expect(res.status).toBe(502);
    expect((await agent.get('/api/session')).status).toBe(200);
  });

  it('refreshes an expired token for the viewer', async () => {
    const auth = fakeAuth({
      exchangeCode: vi.fn().mockResolvedValue({
        accessToken: 'stale',
        refreshToken: 'r',
        expiresIn: 0,
      }),
    });
    const agent = request.agent(realApp(auth));
    await signIn(agent);
    const res = await agent.get('/api/viewer/token');
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBe('access-2');
    expect(auth.refresh).toHaveBeenCalledWith('r');
  });

  it('passes the session access token to the data service', async () => {
    const listHubs = vi.fn().mockResolvedValue([]);
    const data = { ...createMockDataService(), listHubs } satisfies DataService;
    const agent = request.agent(realApp(fakeAuth(), data));
    await signIn(agent);
    await agent.get('/api/hubs');
    expect(listHubs).toHaveBeenCalledWith('access-1');
  });
});

describe('error handler', () => {
  it('turns thrown async errors into a generic 500 without leaking', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = {
      ...createMockDataService(),
      listHubs: () => Promise.reject(new Error('Bearer super-secret-token')),
    } satisfies DataService;
    const app = createApp(loadConfig({ MOCK_APS: '1' }), {
      auth: fakeAuth(),
      data,
    });
    const res = await request(app).get('/api/hubs');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify(res.body)).not.toContain('super-secret');
    expect(spy.mock.calls.flat().join(' ')).not.toContain('super-secret');
  });

  it('honours the status of http errors', async () => {
    const data = {
      ...createMockDataService(),
      listHubs: () => Promise.reject(new HttpError(404, 'Gone')),
    } satisfies DataService;
    const app = createApp(loadConfig({ MOCK_APS: '1' }), {
      auth: fakeAuth(),
      data,
    });
    const res = await request(app).get('/api/hubs');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Gone' });
  });

  it('answers 400 for malformed json bodies', async () => {
    const res = await request(realApp())
      .post('/api/auth/signout')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
  });
});

describe('production static serving', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bim-hub-static-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<html>spa</html>');
  fs.writeFileSync(path.join(dir, 'app.js'), 'console.log(1)');
  const app = createApp(
    loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 's',
      APS_CLIENT_ID: 'id',
      APS_CLIENT_SECRET: 'secret',
      STATIC_DIR: dir,
    }),
  );

  it('serves assets and falls back to index.html for spa routes', async () => {
    expect((await request(app).get('/app.js')).text).toBe('console.log(1)');
    const spa = await request(app).get('/viewer/some/deep/route');
    expect(spa.status).toBe(200);
    expect(spa.text).toBe('<html>spa</html>');
  });

  it('serves the spa fallback when STATIC_DIR is relative', async () => {
    const relative = path.relative(process.cwd(), dir);
    const relativeApp = createApp(
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 's',
        APS_CLIENT_ID: 'id',
        APS_CLIENT_SECRET: 'secret',
        STATIC_DIR: relative,
      }),
    );
    const spa = await request(relativeApp).get('/viewer/deep');
    expect(spa.status).toBe(200);
    expect(spa.text).toBe('<html>spa</html>');
  });

  it('keeps unknown api routes as json 404 rather than the spa shell', async () => {
    const res = await request(app).get('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
