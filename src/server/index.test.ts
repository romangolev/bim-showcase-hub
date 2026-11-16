import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createApp } from './index.js';
import { createMockDataService } from './mock/index.js';

describe('createApp', () => {
  it('serves the health route', async () => {
    const app = createApp(loadConfig({ MOCK_APS: '1' }));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', mock: true });
  });
});

describe('session cookie security', () => {
  const production = loadConfig({
    NODE_ENV: 'production',
    SESSION_SECRET: 'x'.repeat(32),
    APS_CLIENT_ID: 'id',
    APS_CLIENT_SECRET: 'secret',
    APS_CALLBACK_URL: 'http://localhost:3000/api/auth/callback',
    STATIC_DIR: '.',
  });
  const app = () =>
    createApp(production, {
      auth: {
        authorizeUrl: (state) => `https://aps.test/authorize?state=${state}`,
        exchangeCode: async () => {
          throw new Error('unused');
        },
        refresh: async () => {
          throw new Error('unused');
        },
        getUser: async () => ({ name: 'n', picture: null }),
      },
      data: createMockDataService(),
    });

  it('marks the cookie secure for forwarded https requests', async () => {
    const res = await request(app())
      .get('/api/auth/url')
      .set('X-Forwarded-Proto', 'https');
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.some((c) => /;\s*secure/i.test(c))).toBe(true);
  });

  it('still sets a non-secure cookie over plain http', async () => {
    const res = await request(app()).get('/api/auth/url');
    expect(res.status).toBe(200);
    const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
    expect(cookies.length).toBeGreaterThan(0);
    expect(cookies.some((c) => /;\s*secure/i.test(c))).toBe(false);
  });
});
