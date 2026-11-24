import { inflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { crc32, createZip } from './zip.js';

const enc = new TextEncoder();

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

interface Entry {
  name: string;
  method: number;
  flags: number;
  crc: number;
  data: Uint8Array;
}

async function readZip(blob: Blob): Promise<Entry[]> {
  const bytes = await bytesOf(blob);
  const view = new DataView(bytes.buffer);
  const count = view.getUint16(bytes.length - 22 + 10, true);
  let at = view.getUint32(bytes.length - 22 + 16, true);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const method = view.getUint16(at + 10, true);
    const flags = view.getUint16(at + 8, true);
    const crc = view.getUint32(at + 16, true);
    const csize = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(at + 46, at + 46 + nameLen),
    );
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const start = local + 30 + view.getUint16(local + 26, true);
    entries.push({
      name,
      method,
      flags,
      crc,
      data: bytes.subarray(start, start + csize),
    });
    at += 46 + nameLen;
  }
  return entries;
}

afterEach(() => vi.unstubAllGlobals());

describe('crc32', () => {
  it('matches the known vector and chains', () => {
    expect(crc32(enc.encode('123456789'))).toBe(0xcbf43926);
    const first = crc32(enc.encode('12345'));
    expect(crc32(enc.encode('6789'), first)).toBe(0xcbf43926);
  });
});

describe('createZip', () => {
  it('round-trips deflated entries with offsets and utf-8 names', async () => {
    const text = 'ifc '.repeat(500);
    const zip = createZip();
    await zip.add('Gebäude-v1.ifc', new Blob([text]));
    await zip.add('b.ifc', new Blob(['tiny']));
    const entries = await readZip(zip.finish());
    expect(entries.map((e) => e.name)).toEqual(['Gebäude-v1.ifc', 'b.ifc']);
    expect((entries[0]?.flags ?? 0) & 0x0800).toBe(0x0800);
    expect(entries[0]?.method).toBe(8);
    expect(entries[0]?.crc).toBe(crc32(enc.encode(text)));
    expect(
      new TextDecoder().decode(inflateRawSync(entries[0]?.data as Uint8Array)),
    ).toBe(text);
    expect(entries[1]?.method).toBe(0);
    expect(new TextDecoder().decode(entries[1]?.data)).toBe('tiny');
  });

  it('stores entries when CompressionStream is missing', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const zip = createZip();
    await zip.add('a.ifc', new Blob(['x'.repeat(1000)]));
    const [entry] = await readZip(zip.finish());
    expect(entry?.method).toBe(0);
    expect(entry?.data.length).toBe(1000);
  });

  it('refuses an entry past the 4 GB limit', async () => {
    const zip = createZip();
    const huge = { size: 2 ** 32 } as Blob;
    await expect(zip.add('big.ifc', huge)).rejects.toThrow('4 GB');
  });
});
