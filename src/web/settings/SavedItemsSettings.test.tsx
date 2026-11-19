import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportSaved,
  MAX_IMPORT_BYTES,
  MAX_ITEMS,
  readSaved,
  removeSaved,
  type SavedItem,
  upsertSaved,
} from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { SavedItemsSettings } from './SavedItemsSettings.js';

const saved = vi.hoisted(() => ({ calls: [] as [Blob, string][] }));

vi.mock('../extensions/download.js', () => ({
  saveBlob: (blob: Blob, name: string) => saved.calls.push([blob, name]),
}));

function item(id: string, kind = 'dashboard-preset'): SavedItem {
  return { id, kind, name: id, version: 1, updatedAt: 1, data: { a: 1 } };
}

function pick(text: string) {
  const input = screen.getByLabelText('Saved items file');
  const file = new File([text], 'in.json', { type: 'application/json' });
  fireEvent.change(input, { target: { files: [file] } });
}

beforeEach(() => {
  installMemoryStorage();
  saved.calls.length = 0;
});

describe('SavedItemsSettings', () => {
  it('shows counts per kind, the budget and exports the store as JSON', async () => {
    upsertSaved(item('a'));
    upsertSaved(item('b', 'viewpoint'));
    render(<SavedItemsSettings />);
    expect(screen.getByText(/dashboard-preset: 1, viewpoint: 1/)).toBeTruthy();
    expect(screen.getByText(/of 4\.0 MB used\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Export saved items' }));
    expect(saved.calls).toHaveLength(1);
    expect(saved.calls[0]?.[1]).toBe('bsh-saved.json');
    expect(await saved.calls[0]?.[0].text()).toBe(exportSaved());
  });

  it('follows saves and deletes made elsewhere', async () => {
    render(<SavedItemsSettings />);
    expect(screen.getByText(/Nothing saved yet\./)).toBeTruthy();
    await act(async () => {
      upsertSaved(item('a'));
    });
    expect(screen.getByText(/dashboard-preset: 1/)).toBeTruthy();
    await act(async () => {
      removeSaved('a');
    });
    expect(screen.getByText(/Nothing saved yet\./)).toBeTruthy();
  });

  it('imports a valid file and reports the counts', async () => {
    render(<SavedItemsSettings />);
    pick(
      JSON.stringify({
        format: 'bsh-saved',
        version: 1,
        items: [item('a'), { id: 'bad' }],
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        'Imported 1 item, skipped 1 invalid item.',
      ),
    );
    expect(readSaved()).toHaveLength(1);
  });

  it.each([
    ['not json', '{', 'Not valid JSON.'],
    ['bad schema', '{"format":"other","items":[]}', 'Not a saved-items file.'],
    [
      'a newer version',
      '{"format":"bsh-saved","version":99,"items":[]}',
      'This file was saved by a newer version of the app.',
    ],
  ])('shows an error for %s', async (_name, text, message) => {
    render(<SavedItemsSettings />);
    pick(text);
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(message),
    );
    expect(readSaved()).toHaveLength(0);
  });

  it('refuses a file over the size cap', async () => {
    render(<SavedItemsSettings />);
    pick('x'.repeat(MAX_IMPORT_BYTES + 1));
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('File is too large.'),
    );
  });

  it('reports items dropped for the cap and stored items kept', async () => {
    for (let i = 0; i < MAX_ITEMS - 1; i++) upsertSaved(item(`s${i}`));
    upsertSaved({ ...item('keep'), updatedAt: 9 });
    render(<SavedItemsSettings />);
    pick(
      JSON.stringify({
        format: 'bsh-saved',
        version: 1,
        items: [item('keep'), item('x1'), item('x2')],
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        `Imported 0 items, kept 1 newer stored item, dropped 2 items over the limit of ${MAX_ITEMS}.`,
      ),
    );
  });

  it('shows the failure for a file nested too deep', async () => {
    render(<SavedItemsSettings />);
    const depth = 20_000;
    const nested = `${'{"a":'.repeat(depth)}1${'}'.repeat(depth)}`;
    pick(
      `{"format":"bsh-saved","version":1,"items":[{"id":"d","kind":"viewpoint","name":"D","data":${nested}}]}`,
    );
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        'Not a saved-items file.',
      ),
    );
  });
});
