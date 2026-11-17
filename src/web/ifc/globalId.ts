const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';

const REVIT_UNIQUE_ID =
  /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})(?:-([0-9a-f]{8}))?$/i;

export interface GuidSeed {
  externalId?: string;
  urn: string;
  dbId: number;
}

export function ifcGuidFromBytes(bytes: ArrayLike<number>): string {
  let bits = '';
  for (let i = 0; i < 16; i += 1) {
    bits += ((bytes[i] ?? 0) & 255).toString(2).padStart(8, '0');
  }
  let out = ALPHABET[Number.parseInt(bits.slice(0, 2), 2)] as string;
  for (let i = 2; i < 128; i += 6) {
    out += ALPHABET[Number.parseInt(bits.slice(i, i + 6), 2)] as string;
  }
  return out;
}

function hash128(seed: string): Uint8Array {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < seed.length; i += 1) {
    const k = seed.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  const out = new Uint8Array(16);
  [h1, h2, h3, h4].forEach((word, index) => {
    out[index * 4] = (word >>> 24) & 255;
    out[index * 4 + 1] = (word >>> 16) & 255;
    out[index * 4 + 2] = (word >>> 8) & 255;
    out[index * 4 + 3] = word & 255;
  });
  return out;
}

export function hashGlobalId(seed: string): string {
  return ifcGuidFromBytes(hash128(seed));
}

export function globalIdFor(seed: GuidSeed): string {
  const match = seed.externalId
    ? REVIT_UNIQUE_ID.exec(seed.externalId.trim())
    : null;
  if (match) {
    const hex = match.slice(1, 6).join('');
    const bytes = Uint8Array.from({ length: 16 }, (_, index) =>
      Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16),
    );
    const suffix = match[6];
    if (suffix) {
      const value = Number.parseInt(suffix, 16) >>> 0;
      bytes[12] = (bytes[12] as number) ^ ((value >>> 24) & 255);
      bytes[13] = (bytes[13] as number) ^ ((value >>> 16) & 255);
      bytes[14] = (bytes[14] as number) ^ ((value >>> 8) & 255);
      bytes[15] = (bytes[15] as number) ^ (value & 255);
    }
    return ifcGuidFromBytes(bytes);
  }
  const key = seed.externalId?.trim() || `dbId:${seed.dbId}`;
  return hashGlobalId(`${seed.urn}|${key}`);
}
