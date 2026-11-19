import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { viewerCommands } from '../commands/viewerCommands.js';
import { readSaved } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { readScopedRows } from '../viewer/scopedRows.js';
import {
  listSets,
  SELECTION_SET_KIND,
  type SelectionSetData,
  saveSelectionSet,
} from '../viewer/selectionSets.js';
import type { ViewerAdapter } from '../viewer/ViewerAdapter.js';
import { SelectionSets } from './SelectionSets.js';

beforeEach(() => {
  installMemoryStorage();
});

async function loaded() {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.loadModels([{ urn: 'urn-a' }, { urn: 'urn-b' }]);
  return adapter;
}

async function pick(adapter: MockViewerAdapter) {
  const { rows } = await readScopedRows(adapter, { names: ['Category'] });
  const find = (modelId: string) => {
    const row = rows.find((r) => r.modelId === modelId);
    return { modelId, dbId: row?.dbId ?? -1 };
  };
  return [find('urn-a'), find('urn-b')];
}

describe('SelectionSets', () => {
  it('saves, renames, selects and deletes a set', async () => {
    const adapter = await loaded();
    render(<SelectionSets adapter={adapter} />);
    fireEvent.change(screen.getByLabelText('Selection set name'), {
      target: { value: 'Walls' },
    });
    fireEvent.click(screen.getByText('Save selection as set'));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Select elements/,
    );

    adapter.selectModelIds(await pick(adapter));
    fireEvent.click(screen.getByText('Save selection as set'));
    expect(await screen.findByText('2 elements')).toBeTruthy();
    expect(listSets()[0]?.items).toHaveLength(2);

    fireEvent.change(screen.getByLabelText('Rename Walls'), {
      target: { value: 'Façade' },
    });
    fireEvent.blur(screen.getByLabelText('Rename Walls'));
    expect(listSets()[0]?.name).toBe('Façade');

    adapter.clearSelection();
    fireEvent.click(await screen.findByLabelText('Select Façade'));
    await waitFor(() => expect(adapter.getModelSelection()).toHaveLength(2));

    fireEvent.click(await screen.findByLabelText('Delete Façade'));
    expect(listSets()).toHaveLength(0);
    expect(await screen.findByText('No selection sets yet.')).toBeTruthy();
    adapter.destroy();
  });

  it('unions and intersects two saved sets', async () => {
    const adapter = await loaded();
    saveSelectionSet('First', [{ modelId: 'urn-a', dbId: 1 }]);
    saveSelectionSet('Second', [
      { modelId: 'urn-a', dbId: 1 },
      { modelId: 'urn-a', dbId: 2 },
    ]);
    render(<SelectionSets adapter={adapter} />);
    const union = screen.getByRole('button', { name: 'Union' });
    expect(union).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Merge set A'), {
      target: { value: listSets()[0]?.id },
    });
    fireEvent.change(screen.getByLabelText('Merge set B'), {
      target: { value: listSets()[1]?.id },
    });
    expect(union).toBeEnabled();
    fireEvent.click(union);
    expect(await screen.findByLabelText('Rename First ∪ Second')).toBeTruthy();
    expect(listSets().map((set) => set.name)).toContain('First ∪ Second');

    fireEvent.click(screen.getByRole('button', { name: 'Intersect' }));
    await waitFor(() =>
      expect(listSets().map((set) => set.name)).toContain('First ∩ Second'),
    );
    const shared = listSets().find((set) => set.name === 'First ∩ Second');
    expect(shared?.items).toEqual([{ modelId: 'urn-a', dbId: 1 }]);
    adapter.destroy();
  });
});

function mergeAdapter(open: boolean): ViewerAdapter {
  return {
    getModels: () => (open ? [{ id: 'urn-a', status: 'ready' }] : []),
    getExternalIdMap: async () => ({ 'ext-1': 1 }),
  } as unknown as ViewerAdapter;
}

async function mergeRawWithKeyed(open: boolean, mode: 'Union' | 'Intersect') {
  saveSelectionSet('Raw', [{ modelId: 'urn-a', dbId: 1 }]);
  saveSelectionSet(
    'Keyed',
    [{ modelId: 'urn-a', dbId: 1 }],
    new Map([['urn-a:1', 'ext-1']]),
  );
  const [raw, keyed] = listSets();
  render(<SelectionSets adapter={mergeAdapter(open)} />);
  fireEvent.change(screen.getByLabelText('Merge set A'), {
    target: { value: raw?.id },
  });
  fireEvent.change(screen.getByLabelText('Merge set B'), {
    target: { value: keyed?.id },
  });
  fireEvent.click(screen.getByRole('button', { name: mode }));
  const sign = mode === 'Union' ? '∪' : '∩';
  await waitFor(() =>
    expect(listSets().map((set) => set.name)).toContain(`Raw ${sign} Keyed`),
  );
  const id = listSets().find((set) => set.name === `Raw ${sign} Keyed`)?.id;
  return readSaved(SELECTION_SET_KIND).find((item) => item.id === id)
    ?.data as SelectionSetData;
}

describe('merging raw and keyed sets', () => {
  it('counts the same element once in a union when the model is open', async () => {
    const merged = await mergeRawWithKeyed(true, 'Union');
    expect(merged).toEqual({
      models: {},
      keys: { 'urn-a': [{ dbId: 1, key: 'ext-1' }] },
    });
  });

  it('finds the overlap in an intersect when the model is open', async () => {
    const merged = await mergeRawWithKeyed(true, 'Intersect');
    expect(merged).toEqual({
      models: {},
      keys: { 'urn-a': [{ dbId: 1, key: 'ext-1' }] },
    });
  });

  it('finds no overlap in an intersect when the model is closed', async () => {
    saveSelectionSet('Raw', [{ modelId: 'urn-a', dbId: 1 }]);
    saveSelectionSet(
      'Keyed',
      [{ modelId: 'urn-a', dbId: 1 }],
      new Map([['urn-a:1', 'ext-1']]),
    );
    const [raw, keyed] = listSets();
    render(<SelectionSets adapter={mergeAdapter(false)} />);
    fireEvent.change(screen.getByLabelText('Merge set A'), {
      target: { value: raw?.id },
    });
    fireEvent.change(screen.getByLabelText('Merge set B'), {
      target: { value: keyed?.id },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Intersect' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /No elements are in both sets/,
    );
    expect(listSets()).toHaveLength(2);
  });
});

describe('set commands', () => {
  it('saves the selection and lists one select command per set', async () => {
    const adapter = await loaded();
    const save = () =>
      viewerCommands(adapter).find((c) => c.id === 'viewer.saveSet');
    expect(save()?.disabled).toBe('Select elements first');
    const [first] = await pick(adapter);
    if (!first) throw new Error('no rows');
    adapter.selectModelIds([first]);
    await save()?.run({ openModal: () => undefined });
    const [set] = listSets();
    expect(set?.name).toBe('Selection 1');
    adapter.clearSelection();
    const select = viewerCommands(adapter).find(
      (c) => c.id === `viewer.selectSet.${set?.id}`,
    );
    expect(select?.title).toBe('Select set Selection 1');
    await select?.run({ openModal: () => undefined });
    expect(adapter.getModelSelection()).toEqual([first]);
    adapter.destroy();
  });

  it('says so when the set belongs to closed models', async () => {
    const both = await loaded();
    const items = await pick(both);
    saveSelectionSet('Walls', items);
    const onlyA = new MockViewerAdapter(document.createElement('div'));
    await onlyA.loadModels([{ urn: 'urn-a' }]);
    const view = render(<SelectionSets adapter={onlyA} />);
    fireEvent.click(await screen.findByLabelText('Select Walls'));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /of 2 elements/,
    );
    view.unmount();
    const other = new MockViewerAdapter(document.createElement('div'));
    await other.loadModels([{ urn: 'urn-z' }]);
    render(<SelectionSets adapter={other} />);
    fireEvent.click(await screen.findByLabelText('Select Walls'));
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /None of this set/,
    );
  });
});
