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

function bytesToBase64Url(bytes: Uint8Array<ArrayBufferLike>): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  const padded = text.replace(/-/g, '+').replace(/_/g, '/');
  const fill = '='.repeat((4 - (padded.length % 4)) % 4);
  try {
    const binary = atob(padded + fill);
    const bytes = new Uint8Array(binary.length);
    for (let at = 0; at < binary.length; at += 1) {
      bytes[at] = binary.charCodeAt(at);
    }
    return bytes;
  } catch {
    return null;
  }
}

export function base64UrlEncode(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

export function base64UrlDecode(text: string): string | null {
  const bytes = base64UrlToBytes(text);
  if (!bytes) return null;
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
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
  return bytesToBase64Url(await readAll(stream.readable));
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
  const bytes = base64UrlToBytes(body);
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
