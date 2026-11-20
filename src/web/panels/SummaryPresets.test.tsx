import { beforeEach, describe, expect, it } from 'vitest';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { readSaved, SAVED_KEY } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { fireEvent, render, screen, waitFor } from '../test/render.js';
import { MockViewerAdapter } from '../viewer/MockViewerAdapter.js';
import { ModelSummaryPanel } from './ModelSummaryPanel.js';

beforeEach(() => {
  installMemoryStorage();
});

async function openPresets(adapter: MockViewerAdapter) {
  render(<ModelSummaryPanel adapter={adapter} />);
  fireEvent.click(screen.getByRole('button', { name: 'Presets' }));
}

async function loaded() {
  const adapter = new MockViewerAdapter(document.createElement('div'));
  await adapter.load('urn');
  return adapter;
}

describe('summary presets', () => {
  it('saves, applies, renames and deletes a summary', async () => {
    const adapter = await loaded();
    await openPresets(adapter);
    expect(screen.getByText('No saved presets yet.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Summary preset name'), {
      target: { value: 'Mine' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save current summary' }),
    );
    expect(readSaved('summary-preset')).toHaveLength(1);
    expect(readSaved('summary-preset')[0]?.data).toMatchObject({
      properties: ['Assembly Code', 'Classification Code', 'Name'],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Apply Doors check' }));
    await waitFor(() => {
      expect(PANE_SETTINGS.summary.properties.read()).toEqual([
        'Category',
        'Family',
        'Type Name',
      ]);
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Apply Mine' }));
    await waitFor(() => {
      expect(PANE_SETTINGS.summary.properties.read()).toEqual([
        'Assembly Code',
        'Classification Code',
        'Name',
      ]);
    });

    const rename = screen.getByLabelText('Rename Mine');
    fireEvent.change(rename, { target: { value: 'Renamed' } });
    fireEvent.blur(rename);
    expect(readSaved('summary-preset')[0]?.name).toBe('Renamed');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Renamed' }),
    );
    expect(readSaved('summary-preset')).toHaveLength(0);
    expect(await screen.findByText('No saved presets yet.')).toBeTruthy();
    adapter.destroy();
  });

  it('flags exactly the preset properties this model lacks', async () => {
    const adapter = await loaded();
    await openPresets(adapter);
    const gaps = await screen.findByText(
      'Not in this model: Family, Type Name',
    );
    expect(gaps).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Apply Doors check' }));
    expect(
      await screen.findByText(
        'Applied "Doors check". 2 properties are not in this model: Family, Type Name.',
      ),
    ).toBeTruthy();
    adapter.destroy();
  });

  it('ignores a corrupt saved preset and keeps the pane working', async () => {
    window.localStorage.setItem(
      SAVED_KEY,
      JSON.stringify({
        version: 2,
        items: [
          {
            id: 'broken',
            kind: 'summary-preset',
            name: 'Broken',
            version: 1,
            updatedAt: 1,
            data: { properties: 'Level', view: {} },
          },
        ],
      }),
    );
    const adapter = await loaded();
    await openPresets(adapter);
    expect(screen.getByText('No saved presets yet.')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply Rooms by level' }),
    );
    await waitFor(() => {
      expect(PANE_SETTINGS.summary.properties.read()).toEqual([
        'Level',
        'Category',
        'Name',
      ]);
    });
    adapter.destroy();
  });

  it('copies a starter into the saved presets', async () => {
    const adapter = await loaded();
    await openPresets(adapter);
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy Rooms by level to my presets' }),
    );
    expect(readSaved('summary-preset')[0]?.name).toBe('Rooms by level');
    expect(
      await screen.findByRole('button', { name: 'Delete Rooms by level' }),
    ).toBeTruthy();
    adapter.destroy();
  });
});
