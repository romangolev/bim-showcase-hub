const MAX_ZIP32 = 0xffffffff;
const MAX_ENTRIES = 0xffff;
const encoder = new TextEncoder();

const TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array, seed = 0): number {
  let crc = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = (TABLE[(crc ^ (bytes[i] as number)) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function checksum(data: Blob): Promise<number> {
  const reader = data.stream().getReader();
  let crc = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return crc;
    crc = crc32(value, crc);
  }
}

async function deflate(data: Blob): Promise<Blob | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const packed = await new Response(
      data.stream().pipeThrough(new CompressionStream('deflate-raw')),
    ).blob();
    return packed.size < data.size ? packed : null;
  } catch {
    return null;
  }
}

function dosStamp(date: Date): { time: number; day: number } {
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (date.getSeconds() >> 1),
    day:
      (Math.max(0, date.getFullYear() - 1980) << 9) |
      ((date.getMonth() + 1) << 5) |
      date.getDate(),
  };
}

function record(
  size: number,
  write: (view: DataView) => void,
): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
}

export interface ZipBuilder {
  add: (name: string, data: Blob) => Promise<void>;
  finish: () => Blob;
}

export function createZip(now: Date = new Date()): ZipBuilder {
  const { time, day } = dosStamp(now);
  const parts: (Uint8Array<ArrayBuffer> | Blob)[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  return {
    async add(name, data) {
      const nameBytes = encoder.encode(name);
      if (
        central.length >= MAX_ENTRIES ||
        offset + 30 + nameBytes.length + data.size > MAX_ZIP32 ||
        data.size > MAX_ZIP32
      ) {
        throw new Error('The ZIP archive would pass the 4 GB limit');
      }
      const crc = await checksum(data);
      const packed = await deflate(data);
      const body = packed ?? data;
      const method = packed ? 8 : 0;
      const local = record(30 + nameBytes.length, (v) => {
        v.setUint32(0, 0x04034b50, true);
        v.setUint16(4, 20, true);
        v.setUint16(6, 0x0800, true);
        v.setUint16(8, method, true);
        v.setUint16(10, time, true);
        v.setUint16(12, day, true);
        v.setUint32(14, crc, true);
        v.setUint32(18, body.size, true);
        v.setUint32(22, data.size, true);
        v.setUint16(26, nameBytes.length, true);
      });
      local.set(nameBytes, 30);
      const entry = record(46 + nameBytes.length, (v) => {
        v.setUint32(0, 0x02014b50, true);
        v.setUint16(4, 20, true);
        v.setUint16(6, 20, true);
        v.setUint16(8, 0x0800, true);
        v.setUint16(10, method, true);
        v.setUint16(12, time, true);
        v.setUint16(14, day, true);
        v.setUint32(16, crc, true);
        v.setUint32(20, body.size, true);
        v.setUint32(24, data.size, true);
        v.setUint16(28, nameBytes.length, true);
        v.setUint32(42, offset, true);
      });
      entry.set(nameBytes, 46);
      central.push(entry);
      parts.push(local, body);
      offset += local.length + body.size;
    },
    finish() {
      const size = central.reduce((sum, entry) => sum + entry.length, 0);
      const end = record(22, (v) => {
        v.setUint32(0, 0x06054b50, true);
        v.setUint16(8, central.length, true);
        v.setUint16(10, central.length, true);
        v.setUint32(12, size, true);
        v.setUint32(16, offset, true);
      });
      return new Blob([...parts, ...central, end], { type: 'application/zip' });
    },
  };
}
