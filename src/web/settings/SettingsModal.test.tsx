import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ModalProvider } from '../modal/ModalContext.js';
import { MODALS } from '../modal/registry.js';
import { installMemoryStorage } from '../test/mockApi.js';
import { ThemeProvider } from '../theme/ThemeContext.js';
import { TOOLS } from '../tools/index.js';
import { SettingsBody, SettingsProvider } from './index.js';

beforeEach(() => {
  installMemoryStorage();
});

afterEach(() => {
  window.localStorage.clear();
});

function renderBody() {
  return render(
    <SettingsProvider>
      <ThemeProvider>
        <ModalProvider>
          <SettingsBody />
        </ModalProvider>
      </ThemeProvider>
    </SettingsProvider>,
  );
}

describe('SettingsBody', () => {
  it('holds only the app fields, nothing from a tool', () => {
    renderBody();
    const switches = screen
      .getAllByRole('switch')
      .map((el) => el.getAttribute('aria-label'));
    expect(switches).toEqual(
      expect.arrayContaining(['Caption on snapshots', 'Quiet mode']),
    );
    expect(switches).not.toContain('Dark theme');
    expect(
      switches.filter((name) =>
        ['Paint palette', 'Table export'].includes(name ?? ''),
      ),
    ).toEqual([]);
    expect(screen.getByLabelText('Theme')).toHaveValue('system');
    expect(
      screen.getByLabelText(/Warn me before the session ends/),
    ).toBeTruthy();
    expect(screen.getByLabelText('Recent models to list')).toBeTruthy();
    for (const absent of [
      'Paint palette',
      'Table export',
      'IFC export',
      'Summary settings',
    ]) {
      expect(screen.queryByRole('heading', { name: absent })).toBeNull();
    }
    expect(screen.queryByLabelText('Density')).toBeNull();
    expect(screen.queryByLabelText('Maximum categories')).toBeNull();
  });

  it('offers System, Light and Dark and applies the choice', () => {
    renderBody();
    const theme = screen.getByLabelText('Theme');
    expect(theme.tagName).toBe('SELECT');
    expect(
      within(theme as HTMLElement)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['System', 'Light', 'Dark']);
    const start = document.documentElement.dataset.theme;
    const next = start === 'dark' ? 'light' : 'dark';
    fireEvent.change(theme, { target: { value: next } });
    expect(document.documentElement.dataset.theme).toBe(next);
    fireEvent.change(theme, { target: { value: 'system' } });
    expect(document.documentElement.dataset.theme).toBe(start);
  });

  it('lists every registered tool and both panes as entry points', () => {
    renderBody();
    for (const tool of TOOLS.all()) {
      expect(
        screen.getByRole('button', { name: `${tool.title} settings` }),
      ).toBeTruthy();
    }
    expect(
      screen.getByRole('button', { name: 'Summary settings' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Dashboard settings' }),
    ).toBeTruthy();
  });

  it('shows whether a tool is on or off from the tool setting', () => {
    window.localStorage.setItem(
      'bsh.tool.paint.v1',
      JSON.stringify({ enabled: false }),
    );
    renderBody();
    const paint = screen
      .getByRole('button', { name: 'Paint brushes settings' })
      .closest('.settings__entry') as HTMLElement;
    expect(within(paint).getByText('Off')).toBeTruthy();
    const excel = screen
      .getByRole('button', { name: 'Excel export settings' })
      .closest('.settings__entry') as HTMLElement;
    expect(within(excel).getByText('On')).toBeTruthy();
  });

  it.each([
    ['Paint brushes settings', 'Paint palette'],
    ['Excel export settings', 'Table export'],
    ['Geometry export settings', null],
    ['IFC export settings', 'Length unit'],
    ['Summary settings', 'Density'],
    ['Dashboard settings', 'Maximum categories'],
  ])('opens the %s window', (name, marker) => {
    renderBody();
    fireEvent.click(screen.getByRole('button', { name }));
    const dialog = screen.getByRole('dialog', { name });
    if (marker) {
      expect(within(dialog).getByText(marker, { exact: false })).toBeTruthy();
    }
  });

  it('registers one modal per tool next to the app and pane modals', () => {
    const ids = MODALS.map((modal) => modal.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'settings',
        'summary-settings',
        'dashboard-settings',
        ...TOOLS.all().map((tool) => tool.modalId),
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});
