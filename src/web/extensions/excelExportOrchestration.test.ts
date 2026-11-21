import { describe, expect, it, vi } from 'vitest';
import type { PropertyRow } from '../../shared/types.js';
import { type ExportStatus, exportToXlsx } from './excelExport.js';

function row(dbId: number, name: string): PropertyRow {
  return { dbId, name, modelId: 'm', properties: { Name: name } };
}

function adapterOf(
  rows: PropertyRow[],
  extra: Record<string, unknown> = {},
): never {
  return {
    getLeafProperties: () => Promise.resolve(rows),
    getModels: () => [
      { id: 'm', urn: 'm', name: 'm', visible: true, status: 'ready' },
    ],
    getModelSelection: () => [],
    ...extra,
  } as never;
}

const data = [row(1, 'Wall'), row(2, 'Door'), row(3, 'Slab')];
const base = { propertyNames: ['Name'] };

describe('exportToXlsx orchestration', () => {
  it('passes the row count to confirm and exports when accepted', async () => {
    const confirm = vi.fn(() => true);
    const save = vi.fn();
    const status = await exportToXlsx(adapterOf(data), {
      ...base,
      format: 'csv',
      confirm,
      save,
    });
    expect(confirm).toHaveBeenCalledWith(3);
    expect(save).toHaveBeenCalledTimes(1);
    expect(status).toMatchObject({ phase: 'done', rowCount: 3 });
  });

  it('does not ask for confirmation when there is nothing to export', async () => {
    const confirm = vi.fn(() => true);
    const status = await exportToXlsx(adapterOf([]), { ...base, confirm });
    expect(status).toEqual({ phase: 'empty' });
    expect(confirm).not.toHaveBeenCalled();
  });

  it('reports the row count and limit to the overflow choice', async () => {
    const askOverflow = vi.fn(() => 'split' as const);
    await exportToXlsx(adapterOf(data), {
      ...base,
      rowLimit: 2,
      askOverflow,
      save: vi.fn(),
    });
    expect(askOverflow).toHaveBeenCalledWith({ rowCount: 3, limit: 2 });
  });

  it('does not ask about overflow within the limit', async () => {
    const askOverflow = vi.fn(() => 'cancel' as const);
    const status = await exportToXlsx(adapterOf(data), {
      ...base,
      rowLimit: 3,
      askOverflow,
      save: vi.fn(),
    });
    expect(askOverflow).not.toHaveBeenCalled();
    expect(status).toMatchObject({ phase: 'done', rowCount: 3 });
  });

  it.each(['csv', 'json', 'copy'] as const)(
    'does not ask about overflow for %s output',
    async (format) => {
      const askOverflow = vi.fn(() => 'cancel' as const);
      const status = await exportToXlsx(adapterOf(data), {
        ...base,
        format,
        rowLimit: 1,
        askOverflow,
        save: vi.fn(),
        copy: (text) => text.then(() => undefined),
      });
      expect(askOverflow).not.toHaveBeenCalled();
      expect(status).toMatchObject({ phase: 'done', rowCount: 3 });
    },
  );

  it('writes a file and not the clipboard for file formats', async () => {
    const copy = vi.fn();
    const save = vi.fn();
    await exportToXlsx(adapterOf(data), {
      ...base,
      format: 'json',
      fileName: 'a.json',
      copy,
      save,
    });
    expect(copy).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith(expect.any(Blob), 'a.json');
  });

  it('writes the clipboard and not a file for copy', async () => {
    const save = vi.fn();
    const status = await exportToXlsx(adapterOf(data), {
      ...base,
      format: 'copy',
      copy: (text) => text.then(() => undefined),
      save,
    });
    expect(save).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      phase: 'done',
      fileName: 'the clipboard',
      rowCount: 3,
    });
  });

  it('rejects the pending clipboard text when confirm declines', async () => {
    let pending: Promise<string> | undefined;
    const status = await exportToXlsx(adapterOf(data), {
      ...base,
      format: 'copy',
      confirm: () => false,
      copy: (text) => {
        pending = text;
        return text.then(() => undefined);
      },
    });
    expect(status).toEqual({ phase: 'cancelled' });
    await expect(pending).rejects.toThrow('Export stopped');
  });

  it('rejects the pending clipboard text when there are no rows', async () => {
    let pending: Promise<string> | undefined;
    const status = await exportToXlsx(adapterOf([]), {
      ...base,
      format: 'copy',
      copy: (text) => {
        pending = text;
        return text.then(() => undefined);
      },
    });
    expect(status).toEqual({ phase: 'empty' });
    await expect(pending).rejects.toThrow('Export stopped');
  });

  it('emits reading, building and done in order', async () => {
    const phases: string[] = [];
    await exportToXlsx(adapterOf(data), {
      ...base,
      format: 'csv',
      save: vi.fn(),
      onStatus: (status: ExportStatus) => phases.push(status.phase),
    });
    expect(phases).toEqual(['reading', 'building', 'done']);
  });

  it('reports an error and keeps the file untouched when save throws', async () => {
    const status = await exportToXlsx(adapterOf(data), {
      ...base,
      format: 'csv',
      save: () => {
        throw new Error('disk full');
      },
    });
    expect(status).toEqual({ phase: 'error', message: 'disk full' });
  });

  it('reports an error when a model could not be read', async () => {
    const adapter = adapterOf(data, {
      getLeafProperties: () => Promise.reject(new Error('boom')),
    });
    const save = vi.fn();
    const status = await exportToXlsx(adapter, { ...base, save });
    expect(status).toMatchObject({ phase: 'error' });
    expect(save).not.toHaveBeenCalled();
  });

  it('exports only the isolated elements', async () => {
    const save = vi.fn();
    const status = await exportToXlsx(
      adapterOf(data, {
        getIsolated: async () => [{ modelId: 'm', dbId: 3 }],
      }),
      { ...base, format: 'csv', scope: 'isolated', save },
    );
    expect(status).toMatchObject({ phase: 'done', rowCount: 1 });
  });
});
