import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.js';
import { createApp } from '../index.js';
import { cspRouter } from './csp.js';

function build(options: Parameters<typeof cspRouter>[0] = {}) {
  const log = vi.fn();
  const app = express();
  app.use('/api', cspRouter({ log, ...options }));
  return { app, log };
}

const legacy = {
  'csp-report': {
    'violated-directive': 'script-src-elem',
    'effective-directive': 'script-src-elem',
    'blocked-uri': 'https://cdn.example.com/lib.js?token=secret#frag',
    'document-uri':
      'https://app.example.com/model/dXJuOmFkc2s?session=abc&urn=xyz#hash',
  },
};

describe('POST /api/csp-report', () => {
  it('logs one sanitized line for a legacy report', async () => {
    const { app, log } = build();
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify(legacy));
    expect(res.status).toBe(204);
    expect(log).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0]?.[0]);
    expect(line).toContain('script-src-elem');
    expect(line).toContain('https://cdn.example.com');
    expect(line).toContain('/model');
    for (const secret of [
      'token',
      'secret',
      'session',
      'urn',
      'dXJu',
      'hash',
      'lib.js',
    ]) {
      expect(line).not.toContain(secret);
    }
    expect(line).not.toContain('\n');
  });

  it('accepts the reports+json shape', async () => {
    const { app, log } = build();
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/reports+json')
      .send(
        JSON.stringify([
          {
            type: 'csp-violation',
            body: {
              effectiveDirective: 'img-src',
              blockedURL: 'inline',
              documentURL: 'https://app.example.com/?x=1',
            },
          },
        ]),
      );
    expect(res.status).toBe(204);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0]?.[0])).toContain('img-src');
    expect(String(log.mock.calls[0]?.[0])).toContain('inline');
  });

  it('ignores malformed, wrong-type and non-report bodies with 204', async () => {
    const { app, log } = build();
    const post = (type: string, body: string) =>
      request(app).post('/api/csp-report').set('Content-Type', type).send(body);
    expect((await post('application/csp-report', '{nope')).status).toBe(204);
    expect((await post('application/csp-report', '{"a":1}')).status).toBe(204);
    expect((await post('application/csp-report', '[1,2]')).status).toBe(204);
    expect(
      (await post('application/json', JSON.stringify(legacy))).status,
    ).toBe(204);
    expect((await post('text/plain', 'hello')).status).toBe(204);
    expect(log).not.toHaveBeenCalled();
  });

  it('answers 204 for an oversize body without logging', async () => {
    const { app, log } = build();
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify({ 'csp-report': { pad: 'x'.repeat(20_000) } }));
    expect(res.status).toBe(204);
    expect(log).not.toHaveBeenCalled();
  });

  it('caps the lines per minute and resets after the window', async () => {
    let now = 1_000_000;
    const { app, log } = build({ maxPerMinute: 3, now: () => now });
    const send = () =>
      request(app)
        .post('/api/csp-report')
        .set('Content-Type', 'application/csp-report')
        .send(JSON.stringify(legacy));
    for (let i = 0; i < 10; i++) expect((await send()).status).toBe(204);
    expect(log).toHaveBeenCalledTimes(3);
    now += 61_000;
    await send();
    expect(log).toHaveBeenCalledTimes(4);
  });

  it('is mounted on the app without a session', async () => {
    const app = createApp(loadConfig({ MOCK_APS: '1' }));
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send('{}');
    expect(res.status).toBe(204);
  });
});
