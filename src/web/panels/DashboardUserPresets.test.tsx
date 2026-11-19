import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { readSaved } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { DashboardSettingsBody } from './DashboardSettings.js';

function viewStored() {
  return JSON.parse(
    window.localStorage.getItem('bsh.dashboard.view.v1') ?? '{}',
  );
}

describe('dashboard user presets', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('saves, applies, renames and deletes a preset', async () => {
    render(<DashboardSettingsBody />);
    expect(screen.getByText('No saved presets yet.')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save current board' });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Chart type'), {
      target: { value: 'bar' },
    });
    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Mine' },
    });
    fireEvent.click(save);
    expect(readSaved('dashboard-preset')).toHaveLength(1);
    expect(readSaved('dashboard-preset')[0]?.data).toMatchObject({
      kind: 'bar',
    });

    fireEvent.change(screen.getByLabelText('Chart type'), {
      target: { value: 'doughnut' },
    });
    expect(viewStored().kind).toBe('doughnut');
    fireEvent.click(await screen.findByRole('button', { name: 'Apply Mine' }));
    expect(viewStored().kind).toBe('bar');
    expect(
      (screen.getByLabelText('Chart type') as HTMLSelectElement).value,
    ).toBe('bar');

    const rename = screen.getByLabelText('Rename Mine');
    fireEvent.change(rename, { target: { value: 'Renamed' } });
    fireEvent.blur(rename);
    expect(readSaved('dashboard-preset')[0]?.name).toBe('Renamed');

    fireEvent.click(
      await screen.findByRole('button', { name: 'Delete Renamed' }),
    );
    expect(readSaved('dashboard-preset')).toHaveLength(0);
    expect(await screen.findByText('No saved presets yet.')).toBeTruthy();
  });

  it('keeps a catalog property when a saved preset is applied', () => {
    window.localStorage.setItem(
      'bsh.saved.v1',
      JSON.stringify({
        version: 1,
        items: [
          {
            id: 'x',
            kind: 'dashboard-preset',
            name: 'Catalog',
            version: 1,
            updatedAt: 1,
            data: { property: 'Type Name' },
          },
        ],
      }),
    );
    render(<DashboardSettingsBody />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Catalog' }));
    expect(viewStored().property).toBe('Type Name');
  });

  it('applies a malformed saved preset through the sanitizer', () => {
    window.localStorage.setItem(
      'bsh.saved.v1',
      JSON.stringify({
        version: 1,
        items: [
          {
            id: 'x',
            kind: 'dashboard-preset',
            name: 'Odd',
            data: { kind: 'nope', maxCategories: 'many' },
          },
        ],
      }),
    );
    render(<DashboardSettingsBody />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply Odd' }));
    expect(viewStored()).toMatchObject({ kind: 'both', maxCategories: 12 });
  });
});
