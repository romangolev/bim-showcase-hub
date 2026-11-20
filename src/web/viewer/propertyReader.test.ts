import { describe, expect, it } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { ModelSet } from './modelSet.js';
import { PropertyReader, type PropertySource } from './propertyReader.js';

function setup(source: Partial<PropertySource<string>> = {}) {
  const models = new ModelSet<string>();
  for (const urn of ['a', 'b']) {
    models.add({ urn, name: `Model ${urn}` });
    models.resolve(urn, `handle-${urn}`);
  }
  const full: PropertySource<string> = {
    rows: async ({ info }) => [
      { dbId: 1, name: `row ${info.id}`, properties: { Category: 'Walls' } },
    ],
    infos: async ({ info }) => [{ name: `P ${info.id}`, category: 'Cat' }],
    ...source,
  };
  return { models, reader: new PropertyReader(models, full) };
}

describe('PropertyReader', () => {
  it('tags rows with their model and filters by model id', async () => {
    const { reader } = setup();
    const rows = await reader.rows(['Category'], ['b']);
    expect(rows).toEqual([
      {
        dbId: 1,
        name: 'row b',
        properties: { Category: 'Walls' },
        modelId: 'b',
        modelName: 'Model b',
      },
    ]);
  });

  it('skips hidden models', async () => {
    const { models, reader } = setup();
    models.setVisible('a', false);
    const rows = await reader.rows(['Category'], undefined);
    expect(rows.map((row) => row.modelId)).toEqual(['b']);
  });

  it('sums progress across models', async () => {
    const { reader } = setup({
      rows: async (_model, _names, options) => {
        options.onProgress?.({
          phase: 'rows',
          loaded: 2,
          total: 2,
          partial: false,
        });
        return [];
      },
    });
    const seen: number[] = [];
    await reader.rows(['x'], undefined, {
      onProgress: (progress) => seen.push(progress.total),
    });
    expect(seen).toEqual([2, 4]);
  });

  it('keeps the rows of healthy models and flags the failing one', async () => {
    const { models, reader } = setup({
      rows: async ({ info }): Promise<PropertyRow[]> => {
        if (info.id === 'a') throw new Error('boom');
        return [{ dbId: 1, name: 'ok', properties: {} }];
      },
    });
    const rows = await reader.rows([], undefined);
    expect(rows).toHaveLength(1);
    expect(models.get('a')?.propertiesError).toBe(
      'Properties could not be read: boom',
    );
    expect(models.get('b')?.propertiesError).toBeUndefined();
  });

  it('throws the failure when no model yields rows', async () => {
    const { models, reader } = setup({
      rows: async () => {
        throw new Error('boom');
      },
    });
    await expect(reader.rows([], undefined)).rejects.toThrow('boom');
    expect(models.get('b')?.propertiesError).toBe(
      'Properties could not be read: boom',
    );
  });

  it('merges discovered properties and throws only when all fail', async () => {
    const { reader } = setup();
    expect((await reader.infos(undefined)).map((info) => info.name)).toEqual([
      'P a',
      'P b',
    ]);
    const failing = setup({
      infos: async () => {
        throw new Error('nope');
      },
    });
    await expect(failing.reader.infos(undefined)).rejects.toThrow('nope');
  });

  it('rejects with an abort error when cancelled', async () => {
    const { reader } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      reader.rows([], undefined, { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
