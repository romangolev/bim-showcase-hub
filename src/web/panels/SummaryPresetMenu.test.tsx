import { beforeEach, describe, expect, it } from 'vitest';
import {
  seedInstanceSetting,
  summarySetting,
} from '../layout/instanceSettings.js';
import { setPaneSettingsTarget } from '../layout/settingsTarget.js';
import { PANE_SETTINGS } from '../settings/paneSettings.js';
import { readSaved } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { act, fireEvent, render, screen, within } from '../test/render.js';
import { ModelSummaryPanel } from './ModelSummaryPanel.js';
import { SummarySettingsBody } from './SummarySettings.js';

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Summary presets' }));
}

async function settle() {
  await act(async () => {});
}

async function saveAs(name: string) {
  open();
  fireEvent.click(
    screen.getByRole('menuitem', { name: 'Save current as preset...' }),
  );
  const dialog = document.querySelector('dialog[open]') as HTMLElement;
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
          kind: 'summary-preset',
          name,
          version: 1,
          updatedAt: 1,
          data,
        },
      ],
    }),
  );
}

describe('summary preset menu in settings', () => {
  beforeEach(() => {
    installMemoryStorage();
    for (const dialog of document.querySelectorAll('dialog')) dialog.remove();
  });

  it('lives in settings only', () => {
    render(
      <>
        <ModelSummaryPanel />
        <SummarySettingsBody />
      </>,
    );
    const triggers = screen.getAllByRole('button', { name: 'Summary presets' });
    expect(triggers).toHaveLength(1);
    expect(
      document.querySelector('.bsh-summary')?.contains(triggers[0] ?? null),
    ).toBe(false);
    expect(screen.queryByRole('button', { name: 'Presets' })).toBeNull();
    expect(screen.queryByLabelText('Summary preset name')).toBeNull();
  });

  it('applies a starter, which becomes the checked choice', () => {
    render(<SummarySettingsBody />);
    open();
    expect(screen.queryByRole('menuitem', { name: 'Rename...' })).toBeNull();
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Doors check' }),
    );
    expect(PANE_SETTINGS.summary.properties.read()).toEqual([
      'Category',
      'Family',
      'Type Name',
    ]);
    open();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Doors check' }),
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('saves the current summary, then updates, renames and deletes it', async () => {
    render(<SummarySettingsBody />);
    await saveAs('Mine');
    expect(readSaved('summary-preset')).toHaveLength(1);
    open();
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Mine' }),
    ).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(
      screen.getByRole('menuitem', {
        name: 'Update "Mine" with the current summary',
      }),
    );
    expect(readSaved('summary-preset')).toHaveLength(1);

    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename...' }));
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    fireEvent.change(within(dialog).getByLabelText('Preset name'), {
      target: { value: 'Renamed' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(readSaved('summary-preset')[0]?.name).toBe('Renamed');
    await settle();

    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    expect(readSaved('summary-preset')).toHaveLength(0);
  });

  it('applies to the targeted instance pane, not the global keys', () => {
    seedInstanceSetting('modelSummary:3', null);
    setPaneSettingsTarget('modelSummary:3');
    render(<SummarySettingsBody />);
    open();
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Doors check' }),
    );
    expect(summarySetting('modelSummary:3').read().properties).toEqual([
      'Category',
      'Family',
      'Type Name',
    ]);
    expect(PANE_SETTINGS.summary.properties.has()).toBe(false);
    setPaneSettingsTarget(null);
  });

  it('applies an old saved preset with a measure as a Sum column', () => {
    seed('Legacy', {
      properties: ['Level'],
      view: { measure: 'Area', hiddenColumns: ['property'] },
    });
    render(<SummarySettingsBody />);
    open();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Legacy' }));
    expect(PANE_SETTINGS.summary.view.read()).toMatchObject({
      showProperty: false,
      columns: [{ id: 'count' }, { id: 'sum:Area' }],
    });
  });

  it('keeps Export and Import next to the menu', () => {
    render(<SummarySettingsBody />);
    const group = screen.getByRole('group', { name: 'Preset' });
    expect(
      within(group).getByRole('button', { name: 'Export presets' }),
    ).toBeInTheDocument();
    expect(
      within(group).getByRole('button', { name: 'Import presets' }),
    ).toBeInTheDocument();
  });
});
