import { describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.js';
import { createApsAuth, userIdOf } from './apsAuth.js';

const config = loadConfig({
  SESSION_SECRET: 's',
  APS_CLIENT_ID: 'cid',
  APS_CLIENT_SECRET: 'csecret',
  APS_CALLBACK_URL: 'http://localhost:3000/api/auth/callback',
});

function fakeClient() {
  return {
    authorize: vi
      .fn()
      .mockReturnValue(
        'https://developer.api.autodesk.com/authentication/v2/authorize?x=1',
      ),
    getThreeLeggedToken: vi.fn().mockResolvedValue({
      access_token: 'a',
      refresh_token: 'r',
      expires_in: 3599,
    }),
    refreshToken: vi.fn().mockResolvedValue({
      access_token: 'a2',
      refresh_token: 'r2',
      expires_in: 3599,
    }),
    getUserInfo: vi.fn().mockResolvedValue({
      name: 'Sam Smith',
      picture: 'https://img/x.png',
    }),
  };
}

describe('createApsAuth', () => {
  it('builds the authorize url with state and scopes', () => {
    const client = fakeClient();
    const auth = createApsAuth(config, client as never);
    auth.authorizeUrl('st');
    expect(client.authorize).toHaveBeenCalledWith(
      'cid',
      'code',
      config.aps.callbackUrl,
      ['data:read', 'viewables:read'],
      { state: 'st' },
    );
  });

  it('exchanges codes and refreshes tokens', async () => {
    const client = fakeClient();
    const auth = createApsAuth(config, client as never);
    await expect(auth.exchangeCode('c')).resolves.toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresIn: 3599,
    });
    expect(client.getThreeLeggedToken).toHaveBeenCalledWith(
      'cid',
      'c',
      config.aps.callbackUrl,
      { clientSecret: 'csecret' },
    );
    await expect(auth.refresh('r')).resolves.toMatchObject({
      accessToken: 'a2',
    });
  });

  it('maps user info, defaulting the picture to null', async () => {
    const client = fakeClient();
    const auth = createApsAuth(config, client as never);
    await expect(auth.getUser('a')).resolves.toEqual({
      name: 'Sam Smith',
      picture: 'https://img/x.png',
    });
    client.getUserInfo.mockResolvedValue({
      given_name: 'Ann',
      family_name: 'Lee',
    });
    await expect(auth.getUser('a')).resolves.toEqual({
      name: 'Ann Lee',
      picture: null,
    });
  });

  it('adds a stable hashed id from the Autodesk subject', async () => {
    const client = fakeClient();
    client.getUserInfo.mockResolvedValue({ sub: 'ABC123', name: 'Sam' });
    const auth = createApsAuth(config, client as never);
    const user = await auth.getUser('a');
    expect(user.id).toBe(userIdOf('ABC123'));
    expect(user.id).not.toContain('ABC123');
    expect(userIdOf('ABC123')).toBe(userIdOf('ABC123'));
    expect(userIdOf('ABC124')).not.toBe(userIdOf('ABC123'));
  });

  it('turns SDK failures into http errors', async () => {
    const client = fakeClient();
    client.getThreeLeggedToken.mockRejectedValue(
      Object.assign(new Error('x'), { httpStatusCode: () => 400 }),
    );
    const auth = createApsAuth(config, client as never);
    await expect(auth.exchangeCode('c')).rejects.toMatchObject({ status: 502 });
  });

  it('maps refresh rejections to 401 and other failures to 502', async () => {
    for (const [code, expected] of [
      [400, 401],
      [401, 401],
      [403, 401],
      [429, 502],
      [500, 502],
    ] as const) {
      const client = fakeClient();
      client.refreshToken.mockRejectedValue(
        Object.assign(new Error('x'), { httpStatusCode: () => code }),
      );
      const auth = createApsAuth(config, client as never);
      await expect(auth.refresh('r')).rejects.toMatchObject({
        status: expected,
      });
    }
  });
});
