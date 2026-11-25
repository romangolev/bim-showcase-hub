import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { exportToXlsx } from './excelExport.js';

async function zipEntries(blob: Blob): Promise<Map<string, string>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let end = bytes.length - 22;
  while (view.getUint32(end, true) !== 0x06054b50) end -= 1;
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const entries = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = new TextDecoder().decode(
      bytes.subarray(at + 46, at + 46 + nameLength),
    );
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    entries.set(
      name,
      new TextDecoder().decode(method === 8 ? inflateRawSync(raw) : raw),
    );
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe('xlsx export of formula-like text', () => {
  it('stores property text that starts like a formula as a string cell', async () => {
    const payload = '=HYPERLINK("http://x","y")';
    const rows: PropertyRow[] = [
      {
        dbId: 1,
        name: 'Wall',
        modelId: 'm',
        properties: { Comments: payload, Mark: '+1-2', Tag: '@sum' },
      },
    ];
    const adapter = {
      getLeafProperties: () => Promise.resolve(rows),
      getModels: () => [
        { id: 'm', urn: 'm', name: 'm', visible: true, status: 'ready' },
      ],
      getModelSelection: () => [],
    } as never;
    const saved: Blob[] = [];
    await exportToXlsx(adapter, {
      propertyNames: ['Comments', 'Mark', 'Tag'],
      groupBy: null,
      format: 'xlsx',
      fileName: 'a.xlsx',
      save: (blob) => {
        saved.push(blob);
      },
    });
    const files = await zipEntries(saved[0] as Blob);
    const sheets = [...files.keys()].filter((name) =>
      name.startsWith('xl/worksheets/sheet'),
    );
    expect(sheets.length).toBeGreaterThan(0);
    for (const name of sheets) {
      expect(files.get(name)).not.toMatch(/<f[\s>]/);
    }
    const sheet = files.get(sheets[0] as string) ?? '';
    const strings = [
      ...(files.get('xl/sharedStrings.xml') ?? '').matchAll(
        /<si><t[^>]*>(.*?)<\/t><\/si>/gs,
      ),
    ].map((match) => match[1]);
    for (const text of [payload, '+1-2', '@sum']) {
      const index = strings.indexOf(text);
      expect(index, text).toBeGreaterThanOrEqual(0);
      expect(sheet).toMatch(new RegExp(`<c r="[A-Z]+2" t="s"><v>${index}</v>`));
    }
  });
});
