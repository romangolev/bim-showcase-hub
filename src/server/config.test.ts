import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('generates a dev-only secret outside production', () => {
    const a = loadConfig({});
    const b = loadConfig({});
    expect(a.sessionSecret).toHaveLength(64);
    expect(a.sessionSecret).not.toBe(b.sessionSecret);
  });

  it('fails fast without a secret in production', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', MOCK_APS: '1' })).toThrow(
      /SESSION_SECRET/,
    );
  });

  it('rejects the placeholder secret in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        MOCK_APS: '1',
        SESSION_SECRET: 'change-me',
      }),
    ).toThrow(/placeholder/);
  });

  it('requires APS credentials in production', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's' }),
    ).toThrow(/APS_CLIENT_ID/);
    expect(
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 's',
        APS_CLIENT_ID: 'id',
        APS_CLIENT_SECRET: 'secret',
      }).production,
    ).toBe(true);
  });

  it('ignores MOCK_APS in production and still demands credentials', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 's',
        MOCK_APS: '1',
      }),
    ).toThrow(/APS_CLIENT_ID/);
    const config = loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 's',
      MOCK_APS: '1',
      APS_CLIENT_ID: 'id',
      APS_CLIENT_SECRET: 'secret',
    });
    expect(config.mock).toBe(false);
  });

  it('reads mock mode and scopes', () => {
    const config = loadConfig({ MOCK_APS: '1' });
    expect(config.mock).toBe(true);
    expect(config.aps.scopes).toEqual(['data:read', 'viewables:read']);
  });

  it('resolves a relative STATIC_DIR to an absolute path', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: 's',
      APS_CLIENT_ID: 'id',
      APS_CLIENT_SECRET: 'secret',
      STATIC_DIR: 'dist/web',
    });
    expect(config.staticDir).toBe(path.resolve('dist/web'));
    expect(path.isAbsolute(config.staticDir ?? '')).toBe(true);
  });

  it('marks cookies secure only for https callbacks in production', () => {
    const base = {
      NODE_ENV: 'production',
      SESSION_SECRET: 'x'.repeat(32),
      APS_CLIENT_ID: 'id',
      APS_CLIENT_SECRET: 'secret',
    };
    expect(
      loadConfig({ ...base, APS_CALLBACK_URL: 'https://app.example/cb' })
        .secureCookies,
    ).toBe(true);
    expect(
      loadConfig({ ...base, APS_CALLBACK_URL: 'http://localhost:3000/cb' })
        .secureCookies,
    ).toBe(false);
    expect(loadConfig({}).secureCookies).toBe(false);
  });
});
