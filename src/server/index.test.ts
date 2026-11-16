import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';
import { createApp } from './index.js';

describe('createApp', () => {
  it('serves the health route', async () => {
    const app = createApp(loadConfig({ MOCK_APS: '1' }));
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', mock: true });
  });
});
