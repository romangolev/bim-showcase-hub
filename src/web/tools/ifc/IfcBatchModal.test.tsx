import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TreeNode } from '../../../shared/types.js';
import { scopeKey } from '../../api/scope.js';
import type { BatchResult } from '../../extensions/ifcBatch.js';
import { tasks } from '../../tasks/taskStore.js';
import { installMemoryStorage } from '../../test/mockApi.js';

const runIfcBatch = vi.fn();

vi.mock('../../extensions/ifcBatch.js', async (original) => ({
  ...(await original<typeof import('../../extensions/ifcBatch.js')>()),
  runIfcBatch,
}));

const { IFC_BATCH_MODAL, CONFIRM_BATCH_ABOVE, MAX_BATCH } = await import(
  './IfcBatchModal.js'
);

function version(n: number, patch: Partial<TreeNode> = {}): TreeNode {
  return {
    id: `v${n}`,
    kind: 'version',
    name: `v${n}: day by me`,
    hasChildren: false,
    viewable: true,
    versionNumber: n,
    urn: `urn-${n}`,
    viewState: 'ready',
    ...patch,
  };
}

function seeded(versions: TreeNode[], fileName = 'Arch.rvt'): QueryClient {
  const client = new QueryClient();
  client.setQueryData(
    scopeKey({ kind: 'folder', id: 'f', hubId: 'h', projectId: 'p' }),
    [
      {
        id: 'i1',
        kind: 'item',
        name: fileName,
        hasChildren: true,
        viewable: false,
      },
    ],
  );
  client.setQueryData(
    scopeKey({ kind: 'item', id: 'i1', hubId: 'h', projectId: 'p' }),
    versions,
  );
  return client;
}

function many(count: number): TreeNode[] {
  return Array.from({ length: count }, (_, i) => version(i + 1));
}

const close = vi.fn();

function mount(client: QueryClient) {
  const { Body } = IFC_BATCH_MODAL;
  return render(
    <QueryClientProvider client={client}>
      <Body close={close} />
    </QueryClientProvider>,
  );
}

const start = () => screen.getByRole('button', { name: 'Start export' });

beforeEach(() => {
  installMemoryStorage();
  runIfcBatch.mockReset();
  close.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IfcBatchModal', () => {
  it('filters the listed versions', () => {
    mount(seeded([version(1), version(2, { name: 'v2: other by you' })]));
    fireEvent.change(screen.getByLabelText('Filter versions'), {
      target: { value: 'other' },
    });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  });

  it('caps select all at the batch limit', () => {
    mount(seeded(many(25)));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(
      screen.getByText(`${MAX_BATCH} of ${MAX_BATCH} selected`),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Select none' }));
    expect(screen.getByText(`0 of ${MAX_BATCH} selected`)).toBeTruthy();
  });

  it('disables versions that cannot be viewed and says why', () => {
    mount(
      seeded([
        version(1),
        version(2, { viewState: 'failed', urn: 'urn-2' }),
        version(3, { urn: undefined, viewState: undefined }),
      ]),
    );
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.map((box) => box.disabled).sort()).toEqual([
      false,
      true,
      true,
    ]);
    expect(screen.getByText('Translation failed')).toBeTruthy();
  });

  it('asks to confirm above the threshold', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    mount(seeded(many(CONFIRM_BATCH_ABOVE + 1)));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(start());
    expect(confirm).toHaveBeenCalled();
    expect(runIfcBatch).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('closes and starts a task, then reports a cancelled batch', async () => {
    let finish: (result: BatchResult) => void = () => undefined;
    runIfcBatch.mockReturnValue(
      new Promise<BatchResult>((resolve) => {
        finish = resolve;
      }),
    );
    const before = tasks.getSnapshot().tasks.length;
    mount(seeded(many(3)));
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    fireEvent.click(start());
    expect(close).toHaveBeenCalled();
    const task = tasks.getSnapshot().tasks[before];
    expect(task?.label).toBe('Exporting IFC batch');
    expect(task?.cancellable).toBe(true);
    expect(runIfcBatch.mock.calls[0]?.[0]).toHaveLength(3);
    tasks.cancel(task?.id as number);
    finish({ done: ['a.ifc'], failed: [], cancelled: true, bytes: 1 });
    await vi.waitFor(() =>
      expect(tasks.getSnapshot().tasks.at(-1)?.label).toBe(
        'IFC batch cancelled',
      ),
    );
    const note = tasks.getSnapshot().tasks.at(-1);
    expect(note?.state).toBe('warning');
    expect(note?.detail).toBe('Downloaded 1 of 3');
  });
});
