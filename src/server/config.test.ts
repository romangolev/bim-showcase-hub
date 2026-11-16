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

  it('requires APS credentials in production unless mocking', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's' }),
    ).toThrow(/APS_CLIENT_ID/);
    expect(
      loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's', MOCK_APS: '1' })
        .production,
    ).toBe(true);
  });

  it('reads mock mode and scopes', () => {
    const config = loadConfig({ MOCK_APS: '1' });
    expect(config.mock).toBe(true);
    expect(config.aps.scopes).toEqual(['data:read', 'viewables:read']);
  });
});
