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

  it('lists a saved preset in the Presets menu as the checked choice', async () => {
    render(<DashboardSettingsBody />);
    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Mine' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save current board' }));
    await screen.findByRole('button', { name: 'Apply Mine' });
    fireEvent.click(screen.getByRole('button', { name: 'Dashboard presets' }));
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Mine' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Model health' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  it('saves, applies, renames and deletes a preset', async () => {
    render(<DashboardSettingsBody />);
    expect(screen.getByText('No saved presets yet.')).toBeTruthy();
    const save = screen.getByRole('button', { name: 'Save current board' });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Mine' },
    });
    fireEvent.click(save);
    expect(readSaved('dashboard-preset')).toHaveLength(1);
    expect(readSaved('dashboard-preset')[0]?.data).toMatchObject({
      otherBucket: true,
    });

    fireEvent.click(
      screen.getByRole('switch', { name: /Fold values beyond the top/ }),
    );
    expect(viewStored().otherBucket).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Apply Mine' }));
    expect(viewStored().otherBucket).toBe(true);

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
    expect(viewStored().charts[0].property).toBe('Type Name');
  });

  it('saves the chosen property list with a preset', async () => {
    window.localStorage.setItem(
      'bsh.dashboard.view.v1',
      JSON.stringify({ property: 'Name', properties: ['Category', 'Name'] }),
    );
    render(<DashboardSettingsBody />);
    fireEvent.change(screen.getByLabelText('Preset name'), {
      target: { value: 'Mine' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save current board' }));
    expect(readSaved('dashboard-preset')[0]?.data).toMatchObject({
      properties: ['Category', 'Name'],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Apply Mine' }));
    expect(viewStored().properties).toEqual(['Category', 'Name']);
    expect(viewStored().charts[0].property).toBe('Name');
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
    expect(viewStored()).toMatchObject({ maxCategories: 12 });
    expect(viewStored().charts).toHaveLength(2);
  });
});
