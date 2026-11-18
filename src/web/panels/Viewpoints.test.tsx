import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { viewerCommands } from '../commands/viewerCommands.js';
import { forgetPersonal } from '../storage.js';
import { MAX_NAME_LENGTH } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { publishActiveAdapter } from '../viewer/activeAdapterStore.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import {
  deleteViewpoint,
  goToViewpoint,
  listViewpoints,
  moveViewpoint,
  nextViewpointName,
  renameViewpoint,
  saveViewpoint,
} from '../viewer/viewpoints.js';
import { ViewpointsBody } from './Viewpoints.js';

beforeEach(() => {
  installMemoryStorage();
  publishActiveAdapter(null);
});

async function loaded(...urns: string[]) {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.loadModels(urns.map((urn) => ({ urn })));
  return adapter;
}

describe('viewpoints store', () => {
  it('saves, lists in order, renames, reorders and forgets', async () => {
    const adapter = await loaded('urn-a');
    expect(saveViewpoint('First', adapter.getState())).toBe('ok');
    expect(saveViewpoint('Second', adapter.getState())).toBe('ok');
    expect(listViewpoints().map((p) => p.name)).toEqual(['First', 'Second']);
    expect(nextViewpointName()).toBe('Viewpoint 1');
    const [first] = listViewpoints();
    expect(moveViewpoint(first?.id ?? '', 1)).toBe(true);
    expect(listViewpoints().map((p) => p.name)).toEqual(['Second', 'First']);
    expect(moveViewpoint(first?.id ?? '', 1)).toBe(false);
    expect(renameViewpoint(first?.id ?? '', ' Lobby ')).toBe(true);
    expect(listViewpoints()[1]?.name).toBe('Lobby');
    forgetPersonal();
    expect(listViewpoints()).toEqual([]);
  });

  it('names the next viewpoint with the lowest unused number', async () => {
    const adapter = await loaded('urn-a');
    for (const name of ['Viewpoint 1', 'Viewpoint 2', 'Viewpoint 3']) {
      saveViewpoint(name, adapter.getState());
    }
    deleteViewpoint(listViewpoints()[1]?.id ?? '');
    expect(nextViewpointName()).toBe('Viewpoint 2');
  });

  it('applies the name limit on rename and fails on a blank name', async () => {
    const adapter = await loaded('urn-a');
    saveViewpoint('A', adapter.getState());
    const id = listViewpoints()[0]?.id ?? '';
    expect(renameViewpoint(id, 'n'.repeat(200))).toBe(true);
    expect(listViewpoints()[0]?.name).toHaveLength(MAX_NAME_LENGTH);
    expect(renameViewpoint(id, '  ')).toBe(false);
  });

  it('tells hidden models from closed ones', async () => {
    const both = await loaded('urn-a', 'urn-b');
    saveViewpoint('Both', both.getState());
    const id = listViewpoints()[0]?.id ?? '';
    const [a, b] = both.getModels();
    both.setModelVisible(b?.id ?? '', false);
    const partial = await goToViewpoint(both, id);
    expect(partial.result).toBe('partial');
    expect(partial.text).toContain('hidden');
    expect(partial.text).not.toContain('not open');
    both.setModelVisible(a?.id ?? '', false);
    const none = await goToViewpoint(both, id);
    expect(none.result).toBe('unavailable');
    expect(none.text).toContain('hidden');
  });

  it('refuses an empty state', () => {
    expect(
      saveViewpoint('x', {
        version: 1,
        camera: null,
        cutplanes: [],
        models: {},
      }),
    ).toBe('empty');
  });

  it('restores a viewpoint and degrades when models are closed', async () => {
    const both = await loaded('urn-a', 'urn-b');
    both.setCamera({
      eye: [5, 5, 5],
      target: [0, 0, 0],
      up: [0, 1, 0],
      ortho: false,
    });
    saveViewpoint('Both', both.getState());
    const id = listViewpoints()[0]?.id ?? '';
    both.setCamera({
      eye: [1, 1, 1],
      target: [0, 0, 0],
      up: [0, 1, 0],
      ortho: false,
    });
    expect((await goToViewpoint(both, id)).result).toBe('ok');
    expect(both.getCamera()?.eye).toEqual([5, 5, 5]);

    const one = await loaded('urn-a');
    const partial = await goToViewpoint(one, id);
    expect(partial.result).toBe('partial');
    expect(partial.text).toContain('not open');

    const other = await loaded('urn-z');
    expect((await goToViewpoint(other, id)).result).toBe('unavailable');
    expect((await goToViewpoint(other, 'gone')).result).toBe('missing');
  });
});

describe('ViewpointsBody', () => {
  it('saves, goes to, moves and deletes viewpoints', async () => {
    const adapter = await loaded('urn-a');
    publishActiveAdapter(adapter);
    render(<ViewpointsBody />);
    fireEvent.change(screen.getByLabelText('Viewpoint name'), {
      target: { value: 'Entrance' },
    });
    fireEvent.click(screen.getByText('Save viewpoint'));
    fireEvent.click(screen.getByText('Save viewpoint'));
    await waitFor(() => expect(listViewpoints()).toHaveLength(2));
    expect(listViewpoints().map((p) => p.name)).toEqual([
      'Entrance',
      'Viewpoint 1',
    ]);
    fireEvent.click(screen.getByLabelText('Move Entrance down'));
    await waitFor(() =>
      expect(listViewpoints().map((p) => p.name)).toEqual([
        'Viewpoint 1',
        'Entrance',
      ]),
    );
    fireEvent.click(screen.getByLabelText('Go to Entrance'));
    fireEvent.click(screen.getByLabelText('Delete Entrance'));
    await waitFor(() => expect(listViewpoints()).toHaveLength(1));
  });

  it('shows a message when a rename fails', async () => {
    const adapter = await loaded('urn-a');
    saveViewpoint('Old', adapter.getState());
    publishActiveAdapter(adapter);
    render(<ViewpointsBody />);
    const input = screen.getByLabelText('Rename Old');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Could not rename/,
    );
  });

  it('tells the user when a viewpoint belongs to closed models', async () => {
    const adapter = await loaded('urn-a');
    saveViewpoint('Old', adapter.getState());
    publishActiveAdapter(await loaded('urn-z'));
    render(<ViewpointsBody />);
    fireEvent.click(screen.getByLabelText('Go to Old'));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not open/);
  });
});

describe('viewpoint commands', () => {
  it('offers save and go-to commands', async () => {
    const adapter = await loaded('urn-a');
    const titles = () => viewerCommands(adapter).map((c) => c.title);
    expect(titles()).toContain('Save viewpoint');
    const save = viewerCommands(adapter).find(
      (c) => c.title === 'Save viewpoint',
    );
    await save?.run({ openModal: () => undefined });
    expect(titles()).toContain('Go to viewpoint Viewpoint 1');
    expect(
      viewerCommands(null).find((c) => c.title === 'Save viewpoint')?.disabled,
    ).toBeTruthy();
  });
});
