import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DASHBOARD_PRESETS } from '../extensions/dashboardPresets.js';
import { readSaved } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { DashboardSettingsBody } from './DashboardSettings.js';

function viewStored() {
  return JSON.parse(
    window.localStorage.getItem('bsh.dashboard.view.v1') ?? '{}',
  );
}

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Dashboard presets' }));
}

async function settle() {
  await act(async () => {});
}

async function saveAs(name: string) {
  open();
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Save current as preset...' }),
  );
  const dialog = document.querySelector('dialog') as HTMLElement;
  fireEvent.change(within(dialog).getByLabelText('Preset name'), {
    target: { value: name },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save preset' }));
  await settle();
}

function seed(name: string, data: unknown) {
  window.localStorage.setItem(
    'bsh.saved.v1',
    JSON.stringify({
      version: 1,
      items: [
        {
          id: 'x',
          kind: 'dashboard-preset',
          name,
          version: 1,
          updatedAt: 1,
          data,
        },
      ],
    }),
  );
}

describe('dashboard preset menu in settings', () => {
  beforeEach(() => {
    installMemoryStorage();
    document.querySelectorAll('dialog').forEach((d) => {
      d.remove();
    });
  });

  it('is the only preset control: no separate list or name field', () => {
    render(<DashboardSettingsBody />);
    expect(
      screen.getAllByRole('button', { name: 'Dashboard presets' }),
    ).toHaveLength(1);
    expect(screen.queryByLabelText('Preset name')).toBeNull();
    expect(screen.queryByText('My presets')).toBeNull();
  });

  it('applies a built-in and offers no update, rename or delete for it', () => {
    render(<DashboardSettingsBody />);
    open();
    expect(screen.queryByRole('menuitem', { name: 'Rename...' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull();
    const other = DASHBOARD_PRESETS[1];
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: other?.label ?? '' }),
    );
    expect(viewStored().charts.length).toBeGreaterThan(0);
    open();
    expect(
      screen.getByRole('menuitemcheckbox', { name: other?.label ?? '' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('saves the current charts as a preset, which becomes the checked choice', async () => {
    render(<DashboardSettingsBody />);
    await saveAs('Mine');
    expect(readSaved('dashboard-preset')).toHaveLength(1);
    open();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Mine' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('updates, renames and deletes an own preset', async () => {
    render(<DashboardSettingsBody />);
    await saveAs('Mine');
    fireEvent.click(
      screen.getByRole('switch', { name: /Fold values beyond the top/ }),
    );
    open();
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'Update "Mine" with current charts',
      }),
    );
    expect(readSaved('dashboard-preset')[0]?.data).toMatchObject({
      otherBucket: false,
    });

    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename...' }));
    const dialog = document.querySelector('dialog') as HTMLElement;
    fireEvent.change(within(dialog).getByLabelText('Preset name'), {
      target: { value: 'Renamed' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(readSaved('dashboard-preset')[0]?.name).toBe('Renamed');
    await settle();

    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(readSaved('dashboard-preset')).toHaveLength(0);
  });

  it('will not save with an empty name', () => {
    render(<DashboardSettingsBody />);
    open();
    fireEvent.click(
      screen.getByRole('menuitem', { name: 'Save current as preset...' }),
    );
    const dialog = document.querySelector('dialog') as HTMLElement;
    expect(
      within(dialog).getByRole('button', { name: 'Save preset' }),
    ).toBeDisabled();
  });

  it('keeps a catalog property when a saved preset is applied', () => {
    seed('Catalog', { property: 'Type Name' });
    render(<DashboardSettingsBody />);
    open();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Catalog' }));
    expect(viewStored().charts[0].property).toBe('Type Name');
  });

  it('applies a malformed saved preset through the sanitizer', () => {
    seed('Odd', { kind: 'nope', maxCategories: 'many' });
    render(<DashboardSettingsBody />);
    open();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Odd' }));
    expect(viewStored()).toMatchObject({ maxCategories: 12 });
    expect(viewStored().charts).toHaveLength(2);
  });
});
