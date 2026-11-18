export function modelKey(urn: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < urn.length; index += 1) {
    hash ^= urn.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
