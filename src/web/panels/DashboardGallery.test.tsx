import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DASHBOARD_VIEW,
  saveDashboardPreset,
} from '../extensions/dashboardPresets.js';
import { forgetPersonal } from '../storage.js';
import { readSaved } from '../store/savedStore.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { DashboardGallery } from './DashboardGallery.js';

describe('DashboardGallery', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('lists a labelled card per built-in with no rename or delete', () => {
    render(<DashboardGallery view={DEFAULT_DASHBOARD_VIEW} apply={vi.fn()} />);
    const list = screen.getByRole('list', { name: 'Dashboard presets' });
    const cards = within(list).getAllByRole('listitem', { hidden: false });
    expect(
      within(list)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual([
      'Model health',
      'By discipline',
      'Quantities by type',
      'Classification coverage',
    ]);
    expect(cards.length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByLabelText(/^Rename /)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull();
    expect(
      screen.getByText(
        'Charts Category, Level, Assembly Code, Classification Code',
      ),
    ).toBeTruthy();
  });

  it('applies a built-in with one click', () => {
    const apply = vi.fn();
    render(<DashboardGallery view={DEFAULT_DASHBOARD_VIEW} apply={apply} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Apply By discipline' }),
    );
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ preset: 'discipline' }),
    );
  });

  it('saves a built-in as my preset, then renames, applies and deletes it', async () => {
    const apply = vi.fn();
    render(<DashboardGallery view={DEFAULT_DASHBOARD_VIEW} apply={apply} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Save Model health as my preset' }),
    );
    expect(readSaved('dashboard-preset')[0]?.data).toMatchObject({
      preset: 'health',
    });

    const rename = await screen.findByLabelText('Rename Model health');
    fireEvent.change(rename, { target: { value: 'Mine' } });
    fireEvent.blur(rename);
    expect(readSaved('dashboard-preset')[0]?.name).toBe('Mine');

    fireEvent.click(await screen.findByRole('button', { name: 'Apply Mine' }));
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ preset: 'health' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete Mine' }));
    expect(readSaved('dashboard-preset')).toHaveLength(0);
    await waitFor(() =>
      expect(screen.queryByLabelText('Rename Mine')).toBeNull(),
    );
  });

  it('marks a card whose properties are absent from the model', () => {
    const rows = [{ dbId: 1, name: 'a', properties: { Item: 'x' } }];
    render(
      <DashboardGallery
        view={DEFAULT_DASHBOARD_VIEW}
        apply={vi.fn()}
        rows={rows}
      />,
    );
    expect(screen.getAllByText(/Not in this model/)).toHaveLength(4);
  });

  it('is reachable with the keyboard in a stable order', () => {
    render(<DashboardGallery view={DEFAULT_DASHBOARD_VIEW} apply={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.every((b) => b.getAttribute('tabindex') !== '-1')).toBe(
      true,
    );
    expect(buttons[0]?.getAttribute('aria-label')).toBe('Apply Model health');
  });

  it('does not bring back a preset another pane deleted, and drops it on forget', async () => {
    saveDashboardPreset('P', DEFAULT_DASHBOARD_VIEW);
    const id = readSaved('dashboard-preset')[0]?.id ?? '';
    const props = { view: DEFAULT_DASHBOARD_VIEW, apply: vi.fn() };
    render(
      <>
        <DashboardGallery {...props} />
        <DashboardGallery {...props} />
      </>,
    );
    const stale = screen.getAllByLabelText('Rename P')[1] as HTMLInputElement;
    const remove = screen.getAllByRole('button', { name: 'Delete P' })[0];
    if (remove) fireEvent.click(remove);
    fireEvent.change(stale, { target: { value: 'Back' } });
    fireEvent.blur(stale);
    await waitFor(() => expect(screen.queryByLabelText('Rename P')).toBeNull());
    expect(readSaved('dashboard-preset')).toEqual([]);
    expect(readSaved().find((item) => item.id === id)).toBeUndefined();
  });

  it('shows no preset after a forget while mounted', async () => {
    saveDashboardPreset('P', DEFAULT_DASHBOARD_VIEW);
    render(<DashboardGallery view={DEFAULT_DASHBOARD_VIEW} apply={vi.fn()} />);
    expect(screen.getByLabelText('Rename P')).toBeTruthy();
    act(() => forgetPersonal());
    await waitFor(() => expect(screen.queryByLabelText('Rename P')).toBeNull());
    expect(readSaved()).toEqual([]);
  });
});
