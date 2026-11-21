import { HttpError } from './errors.js';

const SAFE_ID = /^[A-Za-z0-9_-]{1,2048}$/;

export function encodeId(raw: string): string {
  return Buffer.from(raw, 'utf8').toString('base64url');
}

export function decodeId(encoded: string): string {
  if (!SAFE_ID.test(encoded)) {
    throw new HttpError(400, 'Invalid id');
  }
  const raw = Buffer.from(encoded, 'base64url').toString('utf8');
  if (raw === '' || encodeId(raw) !== encoded) {
    throw new HttpError(400, 'Invalid id');
  }
  return raw;
}

export function decodeUrn(encoded: string): string {
  const raw = decodeId(encoded);
  if (!raw.startsWith('urn:adsk.')) {
    throw new HttpError(400, 'Invalid id');
  }
  return raw;
}
