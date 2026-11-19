import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  base64UrlDecode,
  base64UrlEncode,
  decodeShare,
  encodeShare,
  SHARE_MAX_LENGTH,
  shareLinkFor,
  shareParamIn,
} from './layoutShare.js';

function noise(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('share payload', () => {
  it('round-trips text and unicode through base64url', () => {
    const text = '{"name":"Étage 1 · 模型"}';
    expect(base64UrlDecode(base64UrlEncode(text))).toBe(text);
    expect(base64UrlEncode(text)).not.toMatch(/[+/=]/);
    expect(base64UrlDecode('not base64!')).toBeNull();
  });

  it('round-trips a workspace payload through the share encoding', async () => {
    const text = JSON.stringify({ kind: 'bsh.workspace', version: 1 });
    expect(await decodeShare(await encodeShare(text))).toBe(text);
  });

  it('falls back to plain base64url without a compression stream', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const text = JSON.stringify({ kind: 'bsh.workspace', version: 1 });
    expect(await encodeShare(text)).toBe(`j${base64UrlEncode(text)}`);
    expect(await decodeShare(`j${base64UrlEncode(text)}`)).toBe(text);
  });

  it('falls back to plain base64url when compression hangs', async () => {
    class Hanging {
      writable = {
        getWriter: () => ({
          write: () => new Promise(() => undefined),
          close: () => new Promise(() => undefined),
        }),
      };
      readable = {
        getReader: () => ({ read: () => new Promise(() => undefined) }),
      };
    }
    vi.stubGlobal('CompressionStream', Hanging);
    const text = '{"kind":"bsh.workspace","version":1}';
    expect(await encodeShare(text)).toBe(`j${base64UrlEncode(text)}`);
  });

  it('refuses an unknown or damaged payload', async () => {
    expect(await decodeShare('')).toBeNull();
    expect(await decodeShare('qabcd')).toBeNull();
    expect(await decodeShare('j%%%')).toBeNull();
    expect(await decodeShare('zabcd')).toBeNull();
  });

  it('returns null for a link longer than the cap', async () => {
    const link = await shareLinkFor(
      'https://hub.test/',
      noise(SHARE_MAX_LENGTH * 2),
    );
    expect(link).toBeNull();
    const short = await shareLinkFor(
      'https://hub.test/model/abc?view=1#old',
      '{"kind":"bsh.workspace"}',
    );
    expect(short).toMatch(/^https:\/\/hub\.test\/model\/abc\?view=1#layout=/);
    expect(short?.length).toBeLessThan(SHARE_MAX_LENGTH);
  });
});

describe('share hash', () => {
  it('reads the layout parameter once from a hash', () => {
    expect(shareParamIn('#layout=zabc')).toBe('zabc');
    expect(shareParamIn('layout=zabc')).toBe('zabc');
    expect(shareParamIn('#model=1&layout=jabc')).toBe('jabc');
    expect(shareParamIn('#other=1')).toBeNull();
    expect(shareParamIn('')).toBeNull();
  });
});
