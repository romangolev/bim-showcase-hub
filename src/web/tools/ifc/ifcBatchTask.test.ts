import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PickedModel } from '../../components/tree/treeState.js';
import type { BatchResult } from '../../extensions/ifcBatch.js';
import { tasks } from '../../tasks/taskStore.js';
import { installMemoryStorage } from '../../test/mockApi.js';

const runIfcBatch = vi.fn();

vi.mock('../../extensions/ifcBatch.js', async (original) => ({
  ...(await original<typeof import('../../extensions/ifcBatch.js')>()),
  runIfcBatch,
}));

const { CONFIRM_BATCH_ABOVE, MAX_BATCH, exportPickedAsIfcBatch } = await import(
  './ifcBatchTask.js'
);

function picked(count: number): PickedModel[] {
  return Array.from({ length: count }, (_, i) => ({
    urn: `urn-${i + 1}`,
    context: {
      file: 'Arch.rvt',
      v: `v${i + 1}`,
      crumbs: ['Hub', 'Tower'],
    },
  }));
}

const last = () => tasks.getSnapshot().tasks.at(-1);

beforeEach(() => {
  installMemoryStorage();
  runIfcBatch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('exportPickedAsIfcBatch', () => {
  it('maps picked versions and names the zip after the shared project', async () => {
    let finish: (result: BatchResult) => void = () => undefined;
    runIfcBatch.mockReturnValue(
      new Promise<BatchResult>((resolve) => {
        finish = resolve;
      }),
    );
    exportPickedAsIfcBatch(picked(2));
    const [items, options] = runIfcBatch.mock.calls[0] ?? [];
    expect(items).toEqual([
      { urn: 'urn-1', file: 'Arch.rvt', version: 'v1' },
      { urn: 'urn-2', file: 'Arch.rvt', version: 'v2' },
    ]);
    expect(options.project).toBe('Tower');
    expect(last()?.label).toBe('Exporting IFC batch');
    finish({
      done: ['a.ifc', 'b.ifc'],
      failed: [],
      cancelled: false,
      bytes: 1,
    });
    await vi.waitFor(() => expect(last()?.state).toBe('done'));
  });

  it('warns while a batch is running', async () => {
    let finish: (result: BatchResult) => void = () => undefined;
    runIfcBatch.mockReturnValue(
      new Promise<BatchResult>((resolve) => {
        finish = resolve;
      }),
    );
    exportPickedAsIfcBatch(picked(1));
    exportPickedAsIfcBatch(picked(1));
    expect(runIfcBatch).toHaveBeenCalledTimes(1);
    expect(last()?.detail).toContain('already running');
    finish({ done: ['a.ifc'], failed: [], cancelled: false, bytes: 1 });
    await vi.waitFor(() => expect(last()?.state).toBe('warning'));
  });

  it('refuses more than the batch limit', () => {
    exportPickedAsIfcBatch(picked(MAX_BATCH + 1));
    expect(runIfcBatch).not.toHaveBeenCalled();
    expect(last()?.detail).toContain(`${MAX_BATCH}`);
  });

  it('asks to confirm above the threshold', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    exportPickedAsIfcBatch(picked(CONFIRM_BATCH_ABOVE + 1));
    expect(confirm).toHaveBeenCalled();
    expect(runIfcBatch).not.toHaveBeenCalled();
  });

  it('reports a cancelled batch with the partial count', async () => {
    runIfcBatch.mockResolvedValue({
      done: ['a.ifc'],
      failed: [],
      cancelled: true,
      bytes: 1,
    });
    exportPickedAsIfcBatch(picked(3));
    await vi.waitFor(() => expect(last()?.label).toBe('IFC batch cancelled'));
    expect(last()?.state).toBe('warning');
    expect(last()?.detail).toBe('Downloaded 1 of 3');
  });
});
