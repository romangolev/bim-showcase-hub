export function decodeBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  } catch {
    return null;
  }
}

export function encodeBase64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeBase64UrlBytes(
  value: string,
  strict = false,
): Uint8Array<ArrayBuffer> | null {
  if (strict && !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const binary = decodeBase64Url(value);
  return binary === null
    ? null
    : Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function encodeBase64UrlText(text: string): string {
  return encodeBase64UrlBytes(new TextEncoder().encode(text));
}

export function decodeBase64UrlText(value: string, strict = false) {
  const bytes = decodeBase64UrlBytes(value, strict);
  if (!bytes) return null;
  try {
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
