import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { viewerCommands } from '../commands/viewerCommands.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { readScopedRows } from '../viewer/propertyScope.js';
import { listSets } from '../viewer/selectionSets.js';
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
    expect(screen.getByRole('alert').textContent).toMatch(/Select elements/);

    adapter.selectModelIds(await pick(adapter));
    fireEvent.click(screen.getByText('Save selection as set'));
    expect(listSets()[0]?.items).toHaveLength(2);
    expect(await screen.findByText('2 elements')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Rename Walls'), {
      target: { value: 'Façade' },
    });
    fireEvent.blur(screen.getByLabelText('Rename Walls'));
    expect(listSets()[0]?.name).toBe('Façade');

    adapter.clearSelection();
    fireEvent.click(await screen.findByLabelText('Select Façade'));
    expect(adapter.getModelSelection()).toHaveLength(2);

    fireEvent.click(await screen.findByLabelText('Delete Façade'));
    expect(listSets()).toHaveLength(0);
    expect(await screen.findByText('No selection sets yet.')).toBeTruthy();
    adapter.destroy();
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
});
