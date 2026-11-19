import {
  decodeBase64UrlBytes,
  decodeBase64UrlText,
  encodeBase64UrlBytes,
  encodeBase64UrlText,
} from '../../shared/urn.js';

const SHARE_PARAM = 'layout';
export const SHARE_MAX_LENGTH = 6000;
const COMPRESSED = 'z';
const PLAIN = 'j';
const STREAM_TIMEOUT_MS = 1200;
const INFLATE_MAX_BYTES = 256 * 1024;

function bounded<T>(task: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    task,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), STREAM_TIMEOUT_MS);
    }),
  ]);
}

export const base64UrlEncode = encodeBase64UrlText;

export function base64UrlDecode(text: string): string | null {
  return decodeBase64UrlText(text, true);
}

async function readAll(
  stream: ReadableStream<Uint8Array>,
  maxBytes = Number.POSITIVE_INFINITY,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new RangeError('stream too large');
    }
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

async function deflateNow(text: string): Promise<string | null> {
  const stream = new CompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  await writer.write(new TextEncoder().encode(text));
  await writer.close();
  return encodeBase64UrlBytes(await readAll(stream.readable));
}

async function deflate(text: string): Promise<string | null> {
  if (typeof CompressionStream !== 'function') return null;
  try {
    return await bounded(deflateNow(text), null);
  } catch {
    return null;
  }
}

async function inflateNow(body: string): Promise<string | null> {
  const bytes = decodeBase64UrlBytes(body, true);
  if (!bytes) return null;
  const stream = new DecompressionStream('deflate-raw');
  const writer = stream.writable.getWriter();
  const [out] = await Promise.all([
    readAll(stream.readable, INFLATE_MAX_BYTES),
    writer.write(bytes).then(() => writer.close()),
  ]);
  return new TextDecoder().decode(out);
}

async function inflate(body: string): Promise<string | null> {
  if (typeof DecompressionStream !== 'function') return null;
  try {
    return await bounded(inflateNow(body), null);
  } catch {
    return null;
  }
}

export async function encodeShare(text: string): Promise<string> {
  const packed = await deflate(text);
  return packed ? `${COMPRESSED}${packed}` : `${PLAIN}${base64UrlEncode(text)}`;
}

export async function decodeShare(value: string): Promise<string | null> {
  if (value.length < 2 || value.length > SHARE_MAX_LENGTH) return null;
  const body = value.slice(1);
  if (value.startsWith(COMPRESSED)) return inflate(body);
  if (value.startsWith(PLAIN)) return base64UrlDecode(body);
  return null;
}

export function shareParamIn(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const value = new URLSearchParams(raw).get(SHARE_PARAM);
  return value ? value : null;
}

export async function shareLinkFor(
  href: string,
  payload: string,
): Promise<string | null> {
  let encoded: string;
  try {
    encoded = await encodeShare(payload);
  } catch {
    return null;
  }
  if (encoded.length > SHARE_MAX_LENGTH) return null;
  const base = href.split('#')[0];
  return `${base}#${SHARE_PARAM}=${encoded}`;
}
