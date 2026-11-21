import { describe, expect, it, vi } from 'vitest';
import { createThumbnailFetcher } from './thumbnails.js';

const MD_BASE =
  'https://developer.api.autodesk.com/modelderivative/v2/designdata';
const URN = Buffer.from('urn:adsk.wipprod:dm.lineage:abc').toString(
  'base64url',
);
const EMEA_URN = Buffer.from('urn:adsk.wipprod:dm.lineage:emea-abc').toString(
  'base64url',
);

function reply(
  status: number,
  headers: Record<string, string> = {},
  bytes = new Uint8Array([1, 2, 3]),
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(bytes));
        controller.close();
      },
    }),
  };
}

const png = () => reply(200, { 'content-type': 'image/png' });

describe('createThumbnailFetcher', () => {
  it('asks for the square size in the urn region with the user token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(png());
    const thumbs = createThumbnailFetcher({ fetchImpl });
    const out = await thumbs.fetch('tok', EMEA_URN, 200);
    expect(fetchImpl).toHaveBeenCalledWith(
      `${MD_BASE}/${EMEA_URN}/thumbnail?width=200&height=200`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer tok',
          region: 'EMEA',
        }),
      }),
    );
    expect(out?.contentType).toBe('image/png');
  });

  it('returns null on 404 and rejects other types', async () => {
    expect(
      await createThumbnailFetcher({
        fetchImpl: vi.fn().mockResolvedValue(reply(404)),
      }).fetch('t', URN, 100),
    ).toBeNull();
    await expect(
      createThumbnailFetcher({
        fetchImpl: vi
          .fn()
          .mockResolvedValue(reply(200, { 'content-type': 'text/html' })),
      }).fetch('t', URN, 100),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('returns null while the thumbnail is still pending', async () => {
    expect(
      await createThumbnailFetcher({
        fetchImpl: vi.fn().mockResolvedValue(reply(202)),
      }).fetch('t', URN, 100),
    ).toBeNull();
  });

  it('caps concurrent upstream calls per token', async () => {
    let active = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return png();
    });
    const thumbs = createThumbnailFetcher({
      fetchImpl,
      perTokenConcurrency: 2,
    });
    await Promise.all(
      Array.from({ length: 6 }, () => thumbs.fetch('t', URN, 100)),
    );
    expect(fetchImpl).toHaveBeenCalledTimes(6);
    expect(peak).toBe(2);
  });

  it('refuses bodies over 512 KB', async () => {
    const big = reply(
      200,
      { 'content-type': 'image/png' },
      new Uint8Array(600 * 1024),
    );
    await expect(
      createThumbnailFetcher({
        fetchImpl: vi.fn().mockResolvedValue(big),
      }).fetch('t', URN, 400),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('refuses on content-length without reading the body', async () => {
    const getReader = vi.fn();
    const res = {
      ...reply(200, {
        'content-type': 'image/png',
        'content-length': String(600 * 1024),
      }),
      body: { getReader } as unknown as ReadableStream<Uint8Array>,
    };
    await expect(
      createThumbnailFetcher({
        fetchImpl: vi.fn().mockResolvedValue(res),
      }).fetch('t', URN, 400),
    ).rejects.toMatchObject({ status: 502 });
    expect(getReader).not.toHaveBeenCalled();
  });

  it('stops reading a streamed body once it exceeds the cap', async () => {
    let pulls = 0;
    const res = {
      ...reply(200, { 'content-type': 'image/png' }),
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          pulls += 1;
          controller.enqueue(new Uint8Array(100 * 1024));
        },
      }),
    };
    await expect(
      createThumbnailFetcher({
        fetchImpl: vi.fn().mockResolvedValue(res),
      }).fetch('t', URN, 400),
    ).rejects.toMatchObject({ status: 502 });
    expect(pulls).toBeLessThan(10);
  });

  it('maps 401 and 403 to 401 and 429 to 429 with retry after', async () => {
    await expect(
      createThumbnailFetcher({
        fetchImpl: vi.fn().mockResolvedValue(reply(403)),
      }).fetch('t', URN, 100),
    ).rejects.toMatchObject({ status: 401 });
    await expect(
      createThumbnailFetcher({
        fetchImpl: vi
          .fn()
          .mockResolvedValue(reply(429, { 'retry-after': '7' })),
      }).fetch('t', URN, 100),
    ).rejects.toMatchObject({ status: 429, retryAfterSeconds: 7 });
  });
});
