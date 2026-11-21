import { regionOf } from '../../shared/region.js';
import { HttpError, RateLimited } from '../errors.js';
import { REGION_HEADER } from './viewState.js';

const MD_BASE =
  'https://developer.api.autodesk.com/modelderivative/v2/designdata';
const MAX_BYTES = 512 * 1024;
const TYPES = new Set(['image/png', 'image/jpeg']);

export type ThumbnailSize = 100 | 200 | 400;

export interface Thumbnail {
  contentType: string;
  body: Buffer;
}

type Fetch = (
  input: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
}>;

export function createThumbnailFetcher(
  options: { fetchImpl?: Fetch; timeoutMs?: number } = {},
) {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as Fetch);
  const timeoutMs = options.timeoutMs ?? 8000;
  return {
    async fetch(
      token: string,
      urn: string,
      size: ThumbnailSize,
    ): Promise<Thumbnail | null> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(
          `${MD_BASE}/${encodeURIComponent(urn)}/thumbnail?width=${size}&height=${size}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              region: REGION_HEADER[regionOf(urn).region],
            },
            signal: controller.signal,
          },
        );
        if (res.status === 404) return null;
        if (res.status === 401 || res.status === 403) {
          throw new HttpError(401, 'Not authorized');
        }
        if (res.status === 429) {
          throw new RateLimited(Number(res.headers.get('retry-after')) || 5);
        }
        const contentType =
          (res.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
        if (!res.ok || !TYPES.has(contentType)) {
          throw new HttpError(502, 'Upstream service error');
        }
        const declared = Number(res.headers.get('content-length'));
        if (declared > MAX_BYTES || !res.body) {
          throw new HttpError(502, 'Upstream service error');
        }
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > MAX_BYTES) {
            await reader.cancel();
            throw new HttpError(502, 'Upstream service error');
          }
          chunks.push(value);
        }
        return { contentType, body: Buffer.concat(chunks) };
      } catch (err) {
        if (err instanceof HttpError) throw err;
        throw new HttpError(502, 'Upstream service error');
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
